import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../../chat/utils';
import {
  ChatCompletion,
  StreamChatType,
  ChatCompletionMessageParam,
  ChatCompletionCreateParams,
  ChatCompletionMessageFunctionCall,
  ChatCompletionFunctionMessageParam,
  ChatCompletionAssistantMessageParam
} from '@fastgpt/global/core/ai/type.d';
import { NextApiResponse } from 'next';
import { responseWriteController } from '../../../../../common/response';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlow } from '../../index';
import { DispatchToolModuleProps, RunToolResponse, ToolNodeItemType } from './type.d';
import json5 from 'json5';
import { DispatchFlowResponse, WorkflowResponseType } from '../../type';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { updateToolInputValue, formatToolResponse, isLLMEmptyResponseError, sleep } from './utils';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { throwIfAborted } from '../../utils/abort';

type FunctionRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  functionCallMsg: ChatCompletionFunctionMessageParam;
}[];

// 合并多次推理内容，用 '\n' 分隔，最终返回一个整体字符串
const mergeReasoningText = (prev?: string, curr?: string): string => {
  if (prev && curr) return `${prev}\n${curr}`;
  return prev || curr || '';
};

const createEmptyDispatchFlowResponse = (): DispatchFlowResponse => {
  return {
    flowResponses: [],
    flowUsages: [],
    debugResponse: {
      finishedNodes: [],
      finishedEdges: [],
      nextStepRunNodes: []
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: [] as unknown,
    [DispatchNodeResponseKeyEnum.assistantResponses]: [],
    [DispatchNodeResponseKeyEnum.runTimes]: 0,
    newVariables: {}
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const stableStringify = (value: unknown): string => {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(String(value));
};

const validateToolArgs = (params: {
  toolNode: ToolNodeItemType;
  args: Record<string, unknown>;
}) => {
  const { toolNode, args } = params;
  const errors: string[] = [];
  const defs = (toolNode.toolParams || [])
    .map((p) => p as unknown as { key?: unknown; required?: unknown; toolDescription?: unknown })
    .filter((p) => typeof p.key === 'string' && p.key)
    .map((p) => ({
      key: p.key as string,
      required: !!p.required,
      toolDescription: typeof p.toolDescription === 'string' ? p.toolDescription : ''
    }));

  defs.forEach((def) => {
    const value = args[def.key];
    const missing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim().length === 0) ||
      (Array.isArray(value) && value.length === 0);
    if (def.required && missing) {
      errors.push(
        `缺少必填参数：${def.key}${def.toolDescription ? `（${def.toolDescription}）` : ''}`
      );
    }
  });

  return { ok: errors.length === 0, errors };
};

export const runToolWithFunctionCall = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolNodes: ToolNodeItemType[];
    toolModel: LLMModelItemType;
    enableReasoning: boolean;
    reasoningEffort?: string;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    toolModel,
    toolNodes,
    messages,
    enableReasoning,
    reasoningEffort,
    res,
    requestOrigin,
    runtimeNodes,
    node,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = props;
  const abortSignal = props.abortSignal;
  const ensureNotAborted = () => throwIfAborted({ abortSignal, res });
  const assistantResponses = response?.assistantResponses || [];
  const toolResultCache = response?.toolResultCache || {};
  const toolValidationRetry = response?.toolValidationRetry || {};

  const functions: ChatCompletionCreateParams.Function[] = toolNodes.map((node) => {
    const properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        items?: { type: 'string' | 'number' | 'boolean' | 'object' };
        description: string;
        enum?: string[];
      }
    > = {};
    node.toolParams.forEach((p) => {
      const schema = p.valueType
        ? valueTypeJsonSchemaMap[p.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;
      properties[p.key] = { ...schema, description: p.toolDescription || '' };
      if (Array.isArray(p.list) && p.list.length > 0)
        properties[p.key].enum = p.list.map((i) => i.value);
    });
    return {
      name: node.nodeId,
      description: node.intro || node.name,
      parameters: {
        type: 'object',
        properties,
        required: node.toolParams.filter((i) => i.required && !!properties[i.key]).map((i) => i.key)
      }
    };
  });

  const max_tokens = computedMaxToken({
    model: toolModel,
    maxToken
  });

  const filterMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: toolModel.maxContext - (max_tokens || 0) // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant && item.function_call) {
      return {
        ...item,
        function_call: {
          name: item.function_call?.name,
          arguments: item.function_call?.arguments
        },
        content: ''
      };
    }
    return item;
  });
  const [requestMessages] = await Promise.all([
    loadRequestMessages({
      messages: filterMessages,
      useVision: toolModel.vision && aiChatVision,
      origin: requestOrigin
    })
  ]);
  let requestBody: ChatCompletionCreateParams & { reasoning_effort?: string } = {
    ...toolModel?.defaultConfig,
    model: toolModel.model,
    temperature: computedTemperature({
      model: toolModel,
      temperature
    }),
    max_tokens,
    stream,
    messages: requestMessages,
    functions,
    function_call: 'auto'
  };

  if (enableReasoning && reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  // console.log(JSON.stringify(requestBody, null, 2));
  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });
  const createAiResponse = async () => {
    try {
      ensureNotAborted();
      return await ai.chat.completions.create(requestBody as any, {
        signal: abortSignal,
        headers: { Accept: 'application/json, text/plain, */*' }
      });
    } catch (error: unknown) {
      const errObj = error as { message?: unknown; status?: unknown; code?: unknown };
      const msg = typeof errObj?.message === 'string' ? errObj.message : '';
      const status =
        typeof errObj?.status === 'number' || typeof errObj?.status === 'string'
          ? errObj.status
          : errObj?.code;

      // 无可用渠道 → 模型降级（function call 场景）
      const needFallback =
        status === 503 || /无可用渠道|no available channel|当前分组/.test(msg || '');
      if (needFallback && Array.isArray((global as any).llmModels)) {
        const candidates = (global as any).llmModels.filter(
          (m: LLMModelItemType) => m.usedInToolCall && m.functionCall && m.model !== toolModel.model
        ) as LLMModelItemType[];
        const fallback = candidates[0];
        if (fallback) {
          requestBody = {
            ...(fallback?.defaultConfig || {}),
            model: fallback.model,
            temperature: computedTemperature({ model: fallback, temperature }),
            max_tokens,
            stream,
            messages: requestMessages,
            functions,
            function_call: 'auto'
          } as any;
          const ai2 = getAIApi({ timeout: 480000 });
          ensureNotAborted();
          return ai2.chat.completions.create(requestBody as any, {
            signal: abortSignal,
            headers: { Accept: 'application/json, text/plain, */*' }
          });
        }
      }
      throw error;
    }
  };

  const parseAiResponse = async (resp: unknown) => {
    if (res && stream) {
      return streamResponse({
        res,
        toolNodes,
        stream: resp as StreamChatType,
        workflowStreamResponse,
        enableReasoning
      });
    }

    const result = resp as ChatCompletion;
    const function_call = result.choices?.[0]?.message?.function_call;
    const toolNode = toolNodes.find((node) => node.nodeId === function_call?.name);

    const toolCalls = function_call
      ? [
          {
            ...function_call,
            id: getNanoid(),
            toolName: toolNode?.name,
            toolAvatar: toolNode?.avatar
          }
        ]
      : [];

    const reasoning = enableReasoning
      ? // @ts-ignore
        result.choices?.[0]?.message?.reasoning_content || ''
      : '';

    return {
      answer: result.choices?.[0]?.message?.content || '',
      functionCalls: toolCalls,
      reasoning: reasoning
    };
  };

  const { answer, functionCalls, reasoning } = await (async () => {
    ensureNotAborted();
    let aiResponse = await createAiResponse();
    try {
      return await parseAiResponse(aiResponse);
    } catch (e) {
      if (!isLLMEmptyResponseError(e)) throw e;
      ensureNotAborted();
      await sleep(150);
      ensureNotAborted();
      aiResponse = await createAiResponse();
      try {
        return await parseAiResponse(aiResponse);
      } catch (e2) {
        if (!isLLMEmptyResponseError(e2)) throw e2;
        return {
          answer: '（模型本次未返回内容，已自动重试仍失败，请重试或更换模型）',
          functionCalls: [],
          reasoning: ''
        };
      }
    }
  })();

  // Run the selected tool.
  const toolsRunResponse = (
    await Promise.all(
      functionCalls.map(async (tool) => {
        if (!tool) return;

        const toolNode = toolNodes.find((node) => node.nodeId === tool.name);

        if (!toolNode) return;

        const parseArgs = (): Record<string, unknown> => {
          try {
            const parsed = json5.parse(tool.arguments || '') as unknown;
            return isRecord(parsed) ? parsed : {};
          } catch {
            return {};
          }
        };

        const args = parseArgs();
        const validation = validateToolArgs({ toolNode, args });
        if (!validation.ok) {
          const retryKey = `validate:${toolNode.nodeId}:${tool.arguments || ''}`;
          toolValidationRetry[retryKey] = (toolValidationRetry[retryKey] || 0) + 1;

          const errText = `__TOOL_VALIDATION_ERROR__\n工具：${toolNode.name}\n原因：\n${validation.errors
            .map((e) => `- ${e}`)
            .join('\n')}\n\n要求：请不要猜测缺失值；先向用户澄清或给出可确定的参数后再调用工具。`;

          const functionCallMsg: ChatCompletionFunctionMessageParam = {
            role: ChatCompletionRequestMessageRoleEnum.Function,
            name: tool.name,
            content: errText
          };

          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolResponse,
            data: {
              tool: {
                id: tool.id,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                params: tool.arguments || '',
                response: sliceStrStartEnd(errText, 500, 500)
              }
            }
          });

          return { toolRunResponse: createEmptyDispatchFlowResponse(), functionCallMsg };
        }

        const signature = `${toolNode.nodeId}|${stableStringify(args)}`;
        if (toolResultCache[signature]) {
          const cached = toolResultCache[signature];
          const functionCallMsg: ChatCompletionFunctionMessageParam = {
            role: ChatCompletionRequestMessageRoleEnum.Function,
            name: tool.name,
            content: cached
          };
          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolResponse,
            data: {
              tool: {
                id: tool.id,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                params: tool.arguments || '',
                response: sliceStrStartEnd(cached, 500, 500)
              }
            }
          });
          return { toolRunResponse: createEmptyDispatchFlowResponse(), functionCallMsg };
        }

        const toolRunResponse = await dispatchWorkFlow({
          ...props,
          isToolCall: true,
          runtimeNodes: runtimeNodes.map((item) =>
            item.nodeId === toolNode.nodeId
              ? {
                  ...item,
                  isEntry: true,
                  inputs: updateToolInputValue({ params: args, inputs: item.inputs })
                }
              : {
                  ...item,
                  isEntry: false
                }
          )
        });

        const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);
        toolResultCache[signature] = stringToolResponse;

        const functionCallMsg: ChatCompletionFunctionMessageParam = {
          role: ChatCompletionRequestMessageRoleEnum.Function,
          name: tool.name,
          content: stringToolResponse
        };

        workflowStreamResponse?.({
          event: SseResponseEventEnum.toolResponse,
          data: {
            tool: {
              id: tool.id,
              toolName: toolNode.name,
              toolAvatar: toolNode.avatar,
              params: JSON.stringify(args),
              response: sliceStrStartEnd(stringToolResponse, 500, 500)
            }
          }
        });

        return {
          toolRunResponse,
          functionCallMsg
        };
      })
    )
  ).filter(Boolean) as FunctionRunResponseType;

  const flatToolsResponseData = toolsRunResponse.map((item) => item.toolRunResponse).flat();

  const functionCall = functionCalls[0];
  if (functionCall && !res?.closed) {
    // Run the tool, combine its results, and perform another round of AI calls
    const assistantToolMsgParams: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      function_call: functionCall
    };
    const concatToolMessages = [
      ...requestMessages,
      assistantToolMsgParams
    ] as ChatCompletionMessageParam[];
    const tokens = await countGptMessagesTokens(concatToolMessages, undefined, functions);
    const completeMessages = [
      ...concatToolMessages,
      ...toolsRunResponse.map((item) => item?.functionCallMsg)
    ];
    // console.log(tokens, 'tool');

    // Run tool status
    if (node.showStatus) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.flowNodeStatus,
        data: {
          status: 'running',
          name: node.name
        }
      });
    }

    // tool assistant
    const toolAssistants = toolsRunResponse
      .map((item) => {
        const assistantResponses = item.toolRunResponse.assistantResponses || [];
        return assistantResponses;
      })
      .flat();
    // tool node assistant（仅用本次 assistant 工具调用 + tool 响应重建）
    const toolNodeAssistant = GPTMessages2Chats([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        // 单函数调用（function call 模式一次只会有一个）
        function_call: functionCalls[0]
      } as ChatCompletionAssistantMessageParam,
      ...toolsRunResponse.map((item) => item?.functionCallMsg)
    ] as ChatCompletionMessageParam[])[0] as AIChatItemType;

    const toolNodeAssistants = [
      ...assistantResponses,
      ...toolAssistants,
      ...(toolNodeAssistant?.value || [])
    ];

    // concat tool responses
    const dispatchFlowResponse = response
      ? response.dispatchFlowResponse.concat(flatToolsResponseData)
      : flatToolsResponseData;

    /* check stop signal */
    const hasStopSignal = flatToolsResponseData.some(
      (item) => !!item.flowResponses?.find((item) => item.toolStop)
    );
    if (hasStopSignal) {
      return {
        dispatchFlowResponse,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
        completeMessages: filterMessages,
        assistantResponses: toolNodeAssistants,
        runTimes:
          (response?.runTimes || 0) +
          flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0),
        toolResultCache,
        toolValidationRetry,
        reasoningText: mergeReasoningText(response?.reasoningText, reasoning)
      };
    }

    return runToolWithFunctionCall(
      {
        ...props,
        messages: completeMessages
      },
      {
        dispatchFlowResponse,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
        assistantResponses: toolNodeAssistants,
        runTimes:
          (response?.runTimes || 0) +
          flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0),
        toolResultCache,
        toolValidationRetry,
        reasoningText: mergeReasoningText(response?.reasoningText, reasoning)
      }
    );
  } else {
    // No tool is invoked, indicating that the process is over
    const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answer
    };
    const completeMessages = filterMessages.concat(gptAssistantResponse);
    const tokens = await countGptMessagesTokens(completeMessages, undefined, functions);
    // console.log(tokens, 'response token');

    // concat tool assistant
    const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

    return {
      dispatchFlowResponse: response?.dispatchFlowResponse || [],
      totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
      completeMessages,
      assistantResponses: [...assistantResponses, ...(toolNodeAssistant?.value || [])],
      runTimes: (response?.runTimes || 0) + 1,
      toolResultCache,
      toolValidationRetry,
      reasoningText: mergeReasoningText(response?.reasoningText, reasoning)
    };
  }
};

async function streamResponse({
  res,
  toolNodes,
  stream,
  workflowStreamResponse,
  enableReasoning
}: {
  res: NextApiResponse;
  toolNodes: ToolNodeItemType[];
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
  enableReasoning: boolean;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  let textAnswer = '';
  let reasoning = '';
  let functionCalls: ChatCompletionMessageFunctionCall[] = [];
  let functionId = getNanoid();

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;

    // Extract reasoning content first (it may come separately from content or function_call)
    const reasoningContent = enableReasoning ? responseChoice?.reasoning_content || '' : '';
    reasoning += reasoningContent;

    if (responseChoice.content) {
      const content = responseChoice?.content || '';
      textAnswer += content;

      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content,
          reasoning_content: reasoningContent
        })
      });
    } else if (reasoningContent) {
      // Send reasoning content even when there's no text content
      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: '',
          reasoning_content: reasoningContent
        })
      });
    } else if (responseChoice.function_call) {
      const functionCall: {
        arguments: string;
        name?: string;
      } = responseChoice.function_call;

      // 流响应中,每次只会返回一个函数，如果带了name，说明触发某个函数
      if (functionCall?.name) {
        functionId = getNanoid();
        const toolNode = toolNodes.find((item) => item.nodeId === functionCall?.name);

        if (toolNode) {
          if (functionCall?.arguments === undefined) {
            functionCall.arguments = '';
          }
          functionCalls.push({
            ...functionCall,
            id: functionId,
            name: functionCall.name,
            toolName: toolNode.name,
            toolAvatar: toolNode.avatar
          });

          workflowStreamResponse?.({
            write,
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: functionId,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                functionName: functionCall.name,
                params: functionCall.arguments,
                response: ''
              }
            }
          });
        }

        continue;
      }

      /* arg 插入最后一个工具的参数里 */
      const arg: string = functionCall?.arguments || '';
      const currentTool = functionCalls[functionCalls.length - 1];
      if (currentTool) {
        currentTool.arguments += arg;

        workflowStreamResponse?.({
          write,
          event: SseResponseEventEnum.toolParams,
          data: {
            tool: {
              id: functionId,
              toolName: '',
              toolAvatar: '',
              params: arg,
              response: ''
            }
          }
        });
      }
    }
  }

  if (!textAnswer && functionCalls.length === 0 && !reasoning) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, functionCalls, reasoning };
}
