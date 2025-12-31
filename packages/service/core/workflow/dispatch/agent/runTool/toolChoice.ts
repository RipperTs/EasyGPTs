import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { filterGPTMessageByMaxContext, loadRequestMessages } from '../../../../chat/utils';
import {
  ChatCompletion,
  ChatCompletionMessageToolCall,
  StreamChatType,
  ChatCompletionToolMessageParam,
  ChatCompletionAssistantToolParam,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionAssistantMessageParam
} from '@fastgpt/global/core/ai/type';
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
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { updateToolInputValue, formatToolResponse, isLLMEmptyResponseError, sleep } from './utils';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../../common/system/log';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/type';

type ToolRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
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

const getLastUserText = (messages: ChatCompletionMessageParam[]) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role !== ChatCompletionRequestMessageRoleEnum.User) continue;
    const content = msg.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const parts = content
        .map((p) =>
          p && typeof p === 'object' && (p as { type?: unknown }).type === 'text'
            ? (p as { text?: unknown }).text
            : ''
        )
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
      if (parts.length) return parts.join('\n');
    }
  }
  return '';
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
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`);
    return `{${pairs.join(',')}}`;
  }
  return JSON.stringify(String(value));
};

const normalizeToolArgsSignatureFromArgs = (params: {
  toolNodeId: string;
  args: Record<string, unknown>;
}) => {
  const { toolNodeId, args } = params;
  return `${toolNodeId}|${stableStringify(args)}`;
};

const validateToolArgs = (params: {
  toolNode: ToolNodeItemType;
  args: Record<string, unknown>;
}): { ok: boolean; errors: string[] } => {
  const { toolNode, args } = params;
  const errors: string[] = [];

  const defs = (toolNode.toolParams || [])
    .map(
      (p) =>
        p as unknown as {
          key?: unknown;
          required?: unknown;
          toolDescription?: unknown;
          list?: unknown;
        }
    )
    .filter((p) => typeof p.key === 'string' && p.key)
    .map((p) => ({
      key: p.key as string,
      required: !!p.required,
      toolDescription: typeof p.toolDescription === 'string' ? p.toolDescription : '',
      enumValues: Array.isArray(p.list)
        ? p.list
            .map((i) => (i && typeof i === 'object' ? (i as { value?: unknown }).value : undefined))
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : []
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
      return;
    }
    if (!missing && def.enumValues.length > 0) {
      if (typeof value === 'string' && !def.enumValues.includes(value)) {
        errors.push(
          `参数 ${def.key} 值不在枚举范围内：${value}，可选：${def.enumValues.join('、')}`
        );
      }
    }
  });

  return { ok: errors.length === 0, errors };
};

const callRepairToolArgs = async (params: {
  toolModel: LLMModelItemType;
  toolNode: ToolNodeItemType;
  lastUserText: string;
  badArguments: string;
  errors: string[];
  temperature: number;
}): Promise<{ args?: Record<string, unknown>; needClarifyQuestions?: string[] }> => {
  const { toolModel, toolNode, lastUserText, badArguments, errors, temperature } = params;
  const schemaText = JSON.stringify(
    (toolNode.toolParams || []).map((p) => {
      const rec = p as unknown as {
        key?: unknown;
        required?: unknown;
        toolDescription?: unknown;
        list?: unknown;
        valueType?: unknown;
      };
      const enumValues = Array.isArray(rec.list)
        ? rec.list
            .map((i) => (i && typeof i === 'object' ? (i as { value?: unknown }).value : undefined))
            .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
        : undefined;
      return {
        key: typeof rec.key === 'string' ? rec.key : '',
        required: !!rec.required,
        description: typeof rec.toolDescription === 'string' ? rec.toolDescription : '',
        valueType: typeof rec.valueType === 'string' ? rec.valueType : undefined,
        ...(enumValues?.length ? { enum: enumValues } : {})
      };
    })
  );

  const repairMessages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `你是“工具参数修复器”。你的任务是：只根据对话内容与工具参数 schema，修复一次错误的工具参数。

规则：
1) 只输出 JSON（不要代码块、不要解释）。
2) 严禁凭空猜测用户未提供的关键值（例如日期范围、ID、筛选条件等）。如果缺失关键值无法确定，输出：
{"needClarify": true, "questions": ["问题1", "问题2"]}
3) 如果可以确定，输出：
{"needClarify": false, "arguments": { ... }}
4) arguments 里只包含该工具定义的 key。`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `工具：${toolNode.name} (id: ${toolNode.nodeId})
工具说明：${toolNode.intro || '（无）'}
参数 schema（JSON）：${schemaText}

用户最新输入：${lastUserText || '（无）'}

当前错误参数（原始字符串）：${badArguments || '（空）'}
校验错误：
${errors.map((e) => `- ${e}`).join('\n')}

请按规则输出修复结果 JSON：`
    }
  ];

  try {
    const ai = getAIApi({ timeout: 60000 });
    const requestBody: Record<string, unknown> = {
      ...(toolModel.defaultConfig || {}),
      model: toolModel.model,
      temperature: computedTemperature({
        model: toolModel,
        temperature: Math.min(0.2, temperature)
      }),
      max_tokens: 350,
      stream: false,
      messages: repairMessages
    };
    const resp = (await ai.chat.completions.create(
      requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
    )) as unknown as ChatCompletion;

    const content = (resp.choices?.[0]?.message?.content || '').trim();
    const parsed = (() => {
      try {
        return json5.parse(content) as unknown;
      } catch {
        return undefined;
      }
    })();
    if (!isRecord(parsed)) return {};

    const needClarify = parsed.needClarify === true;
    if (needClarify) {
      const questions = Array.isArray(parsed.questions)
        ? parsed.questions
            .filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
            .slice(0, 4)
        : [];
      return { needClarifyQuestions: questions };
    }

    const args = parsed.arguments;
    if (isRecord(args)) return { args };
  } catch {}

  return {};
};

/*
  调用思路
  1. messages 接收发送给AI的消息
  2. response 记录递归运行结果(累计计算 dispatchFlowResponse, totalTokens和assistantResponses)
  3. 如果运行工具的话，则需要把工具中的结果累计加到dispatchFlowResponse中。 本次消耗的 token 加到 totalTokens, assistantResponses 记录当前工具运行的内容。
*/

export const runToolWithToolChoice = async (
  props: DispatchToolModuleProps & {
    messages: ChatCompletionMessageParam[];
    toolNodes: ToolNodeItemType[];
    toolModel: LLMModelItemType;
    maxRunToolTimes: number;
    enableReasoning: boolean;
    reasoningEffort?: string;
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const {
    messages,
    toolNodes,
    toolModel,
    maxRunToolTimes,
    enableReasoning,
    reasoningEffort,
    ...workflowProps
  } = props;
  const {
    res,
    requestOrigin,
    runtimeNodes,
    node,
    stream,
    workflowStreamResponse,
    params: { temperature = 0, maxToken = 4000, aiChatVision }
  } = workflowProps;

  if (maxRunToolTimes <= 0 && response) {
    return response;
  }

  const assistantResponses = response?.assistantResponses || [];
  const toolResultCache = response?.toolResultCache || {};
  const toolValidationRetry = response?.toolValidationRetry || {};

  const tools: ChatCompletionTool[] = toolNodes.map((node) => {
    const properties: Record<
      string,
      {
        type: 'string' | 'number' | 'boolean' | 'object' | 'array';
        description: string;
        items?: { type: 'string' | 'number' | 'boolean' | 'object' };
        enum?: string[];
      }
    > = {};

    node.toolParams.forEach((p) => {
      const schema = p.valueType
        ? valueTypeJsonSchemaMap[p.valueType] || toolValueTypeList[0].jsonSchema
        : toolValueTypeList[0].jsonSchema;

      properties[p.key] = {
        ...schema,
        description: p.toolDescription || ''
      };
      // 如果输入定义了下拉列表，尽量映射为 enum
      if (Array.isArray(p.list) && p.list.length > 0) {
        properties[p.key].enum = p.list.map((i) => i.value);
      }
    });

    return {
      type: 'function',
      function: {
        name: node.nodeId,
        description: node.intro || node.name,
        parameters: {
          type: 'object',
          properties,
          required: node.toolParams
            .filter((i) => i.required && !!properties[i.key])
            .map((i) => i.key)
        }
      }
    };
  });
  const max_tokens = computedMaxToken({
    model: toolModel,
    maxToken
  });
  // Filter histories by maxToken
  const filterMessages = (
    await filterGPTMessageByMaxContext({
      messages,
      maxContext: toolModel.maxContext - (max_tokens || 0) // filter token. not response maxToken
    })
  ).map((item) => {
    if (item.role === 'assistant' && item.tool_calls) {
      return {
        ...item,
        tool_calls: item.tool_calls.map((tool) => ({
          id: tool.id,
          type: tool.type,
          function: tool.function
        }))
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
    tools,
    tool_choice: 'auto'
  };

  if (enableReasoning && reasoningEffort) {
    requestBody.reasoning_effort = reasoningEffort;
  }

  // console.log(JSON.stringify(requestBody, null, 2));
  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });

  try {
    let aiResponse = await ai.chat.completions.create(requestBody as any, {
      headers: {
        Accept: 'application/json, text/plain, */*'
      }
    });
    // 成功直接进入解析

    const parseAiResponse = async (resp: unknown) => {
      if (res && stream) {
        return streamResponse({
          res,
          workflowStreamResponse,
          toolNodes,
          stream: resp as StreamChatType,
          enableReasoning
        });
      }

      const result = resp as ChatCompletion;
      const calls = result.choices?.[0]?.message?.tool_calls || [];

      // 加上name和avatar
      const toolCalls = calls.map((tool) => {
        const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);
        return {
          ...tool,
          toolName: toolNode?.name || '',
          toolAvatar: toolNode?.avatar || ''
        };
      });

      const reasoning = enableReasoning
        ? // @ts-ignore
          result.choices?.[0]?.message?.reasoning_content || ''
        : '';

      return {
        answer: result.choices?.[0]?.message?.content || '',
        toolCalls,
        reasoning
      };
    };

    const { answer, toolCalls, reasoning } = await (async () => {
      try {
        return await parseAiResponse(aiResponse);
      } catch (e) {
        if (!isLLMEmptyResponseError(e)) throw e;

        addLog.warn('LLM response empty, retry once', { model: toolModel.model });
        await sleep(150);
        aiResponse = await ai.chat.completions.create(requestBody as any, {
          headers: { Accept: 'application/json, text/plain, */*' }
        });

        try {
          return await parseAiResponse(aiResponse);
        } catch (e2) {
          if (!isLLMEmptyResponseError(e2)) throw e2;
          return {
            answer: '（模型本次未返回内容，已自动重试仍失败，请重试或更换模型）',
            toolCalls: [],
            reasoning: ''
          };
        }
      }
    })();

    // Run the selected tool by LLM.
    const toolsRunResponse = (
      await Promise.all(
        toolCalls.map(async (tool) => {
          const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);

          if (!toolNode) return;

          const parseArgs = (): Record<string, unknown> => {
            try {
              const parsed = json5.parse(tool.function.arguments || '') as unknown;
              return isRecord(parsed) ? parsed : {};
            } catch {
              return {};
            }
          };

          let args = parseArgs();
          let validation = validateToolArgs({ toolNode, args });

          if (!validation.ok) {
            const retryKey = `validate:${toolNode.nodeId}:${tool.function?.arguments || ''}`;
            const tried = toolValidationRetry[retryKey] || 0;
            toolValidationRetry[retryKey] = tried + 1;

            if (tried < 1) {
              const repaired = await callRepairToolArgs({
                toolModel,
                toolNode,
                lastUserText: getLastUserText(messages),
                badArguments: tool.function?.arguments || '',
                errors: validation.errors,
                temperature
              });

              if (repaired.args) {
                args = repaired.args;
                validation = validateToolArgs({ toolNode, args });
              } else if (repaired.needClarifyQuestions?.length) {
                const clarifyText = `__TOOL_VALIDATION_NEED_CLARIFY__\n缺少关键参数，无法安全调用工具。\n请先向用户澄清：\n${repaired.needClarifyQuestions
                  .map((q) => `- ${q}`)
                  .join('\n')}`;
                const toolMsgParams: ChatCompletionToolMessageParam = {
                  tool_call_id: tool.id,
                  role: ChatCompletionRequestMessageRoleEnum.Tool,
                  content: clarifyText
                };
                workflowStreamResponse?.({
                  event: SseResponseEventEnum.toolResponse,
                  data: {
                    tool: {
                      id: tool.id,
                      toolName: toolNode.name,
                      toolAvatar: toolNode.avatar,
                      params: tool.function?.arguments ?? '',
                      response: sliceStrStartEnd(clarifyText, 500, 500)
                    }
                  }
                });
                return {
                  toolRunResponse: createEmptyDispatchFlowResponse(),
                  toolMsgParams
                };
              }
            }
          }

          if (!validation.ok) {
            const errText = `__TOOL_VALIDATION_ERROR__\n工具：${toolNode.name}\n原因：\n${validation.errors
              .map((e) => `- ${e}`)
              .join('\n')}\n\n要求：请不要猜测缺失值；先向用户澄清或给出可确定的参数后再调用工具。`;
            const toolMsgParams: ChatCompletionToolMessageParam = {
              tool_call_id: tool.id,
              role: ChatCompletionRequestMessageRoleEnum.Tool,
              content: errText
            };
            workflowStreamResponse?.({
              event: SseResponseEventEnum.toolResponse,
              data: {
                tool: {
                  id: tool.id,
                  toolName: toolNode.name,
                  toolAvatar: toolNode.avatar,
                  params: tool.function?.arguments ?? '',
                  response: sliceStrStartEnd(errText, 500, 500)
                }
              }
            });
            return {
              toolRunResponse: createEmptyDispatchFlowResponse(),
              toolMsgParams
            };
          }

          const finalSignature = normalizeToolArgsSignatureFromArgs({
            toolNodeId: toolNode.nodeId,
            args
          });

          if (toolResultCache[finalSignature]) {
            const cached = toolResultCache[finalSignature];
            const toolMsgParams: ChatCompletionToolMessageParam = {
              tool_call_id: tool.id,
              role: ChatCompletionRequestMessageRoleEnum.Tool,
              content: cached
            };
            workflowStreamResponse?.({
              event: SseResponseEventEnum.toolResponse,
              data: {
                tool: {
                  id: tool.id,
                  toolName: toolNode.name,
                  toolAvatar: toolNode.avatar,
                  params: tool.function?.arguments ?? '',
                  response: sliceStrStartEnd(cached, 500, 500)
                }
              }
            });
            return {
              toolRunResponse: createEmptyDispatchFlowResponse(),
              toolMsgParams
            };
          }

          const toolRunResponse = await dispatchWorkFlow({
            ...workflowProps,
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
          toolResultCache[finalSignature] = stringToolResponse;

          const toolMsgParams: ChatCompletionToolMessageParam = {
            tool_call_id: tool.id,
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            content: stringToolResponse
          };

          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolResponse,
            data: {
              tool: {
                id: tool.id,
                toolName: '',
                toolAvatar: '',
                params: '',
                response: sliceStrStartEnd(stringToolResponse, 500, 500)
              }
            }
          });

          return {
            toolRunResponse,
            toolMsgParams
          };
        })
      )
    ).filter(Boolean) as ToolRunResponseType;

    const flatToolsResponseData = toolsRunResponse.map((item) => item.toolRunResponse).flat();
    if (toolCalls.length > 0 && !res?.closed) {
      // Run the tool, combine its results, and perform another round of AI calls
      const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: toolCalls
      };
      /*
        ...
        user
        assistant: tool data
      */
      const concatToolMessages = [
        ...requestMessages,
        assistantToolMsgParams
      ] as ChatCompletionMessageParam[];
      const tokens = await countGptMessagesTokens(concatToolMessages, tools);
      /*
        ...
        user
        assistant: tool data
        tool: tool response
      */
      const completeMessages = [
        ...concatToolMessages,
        ...toolsRunResponse.map((item) => item?.toolMsgParams)
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

      // tool node assistant（仅用本次 assistant 工具调用 + tool 响应重建，避免取到末尾的 tool 消息）
      const toolNodeAssistant = GPTMessages2Chats([
        assistantToolMsgParams,
        ...toolsRunResponse.map((item) => item?.toolMsgParams)
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
          completeMessages,
          assistantResponses: toolNodeAssistants,
          runTimes:
            (response?.runTimes || 0) +
            flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0),
          reasoningText: mergeReasoningText(response?.reasoningText, reasoning)
        };
      }

      return runToolWithToolChoice(
        {
          ...props,
          maxRunToolTimes: maxRunToolTimes - 1,
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
      const tokens = await countGptMessagesTokens(completeMessages, tools);
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
  } catch (error: any) {
    const msg = `${error?.message || ''}`;
    const status = error?.status ?? error?.code;
    addLog.warn(`LLM response error`, { requestBody, status, msg });

    // OneAPI/聚合器常见报错：无可用渠道/503 → 自动降级可用的工具调用模型
    const needFallback =
      status === 503 || /无可用渠道|no available channel|当前分组/.test(msg || '');
    if (needFallback && Array.isArray((global as any).llmModels)) {
      const candidates = (global as any).llmModels.filter(
        (m: LLMModelItemType) => m.usedInToolCall && m.toolChoice && m.model !== toolModel.model
      ) as LLMModelItemType[];
      const fallback = candidates[0];
      if (fallback) {
        addLog.warn('LLM fallback to tool-call model', {
          from: toolModel.model,
          to: fallback.model
        });
        // 重建请求体，使用降级模型
        requestBody = {
          ...(fallback?.defaultConfig || {}),
          model: fallback.model,
          temperature: computedTemperature({ model: fallback, temperature }),
          max_tokens,
          stream,
          messages: requestMessages,
          tools,
          tool_choice: 'auto'
        } as any;
        try {
          const ai2 = getAIApi({ timeout: 480000 });
          const aiResponse2 = await ai2.chat.completions.create(requestBody as any, {
            headers: { Accept: 'application/json, text/plain, */*' }
          });
          const {
            answer,
            toolCalls,
            reasoning: reasoning2
          } = await (async () => {
            if (res && stream) {
              return streamResponse({
                res,
                workflowStreamResponse,
                toolNodes,
                stream: aiResponse2,
                enableReasoning
              });
            } else {
              const result = aiResponse2 as ChatCompletion;
              const calls = result.choices?.[0]?.message?.tool_calls || [];
              const toolCalls = calls.map((tool) => {
                const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);
                return {
                  ...tool,
                  toolName: toolNode?.name || '',
                  toolAvatar: toolNode?.avatar || ''
                };
              });
              const reasoning2 = enableReasoning
                ? // @ts-ignore
                  result.choices?.[0]?.message?.reasoning_content || ''
                : '';

              return {
                answer: result.choices?.[0]?.message?.content || '',
                toolCalls,
                reasoning: reasoning2
              };
            }
          })();

          // 与主路径保持一致（复制后续逻辑）
          const toolsRunResponse = (
            await Promise.all(
              toolCalls.map(async (tool) => {
                const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);
                if (!toolNode) return;
                const startParams = (() => {
                  try {
                    return json5.parse(tool.function.arguments);
                  } catch (_) {
                    return {};
                  }
                })();
                const toolRunResponse = await dispatchWorkFlow({
                  ...workflowProps,
                  isToolCall: true,
                  runtimeNodes: runtimeNodes.map((item) =>
                    item.nodeId === toolNode.nodeId
                      ? {
                          ...item,
                          isEntry: true,
                          inputs: updateToolInputValue({ params: startParams, inputs: item.inputs })
                        }
                      : { ...item, isEntry: false }
                  )
                });
                const stringToolResponse = (() => {
                  if (typeof toolRunResponse.toolResponses === 'object') {
                    return JSON.stringify(toolRunResponse.toolResponses, null, 2);
                  }
                  return toolRunResponse.toolResponses
                    ? String(toolRunResponse.toolResponses)
                    : 'none';
                })();
                const toolMsgParams: ChatCompletionToolMessageParam = {
                  tool_call_id: tool.id,
                  role: ChatCompletionRequestMessageRoleEnum.Tool,
                  content: stringToolResponse
                };
                workflowStreamResponse?.({
                  event: SseResponseEventEnum.toolResponse,
                  data: {
                    tool: {
                      id: tool.id,
                      toolName: '',
                      toolAvatar: '',
                      params: '',
                      response: sliceStrStartEnd(stringToolResponse, 500, 500)
                    }
                  }
                });
                return { toolRunResponse, toolMsgParams };
              })
            )
          ).filter(Boolean) as ToolRunResponseType;

          const flatToolsResponseData = toolsRunResponse.map((i) => i.toolRunResponse).flat();
          if (toolCalls.length > 0 && !res?.closed) {
            const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls: toolCalls
            };
            const concatToolMessages = [
              ...requestMessages,
              assistantToolMsgParams
            ] as ChatCompletionMessageParam[];
            const tokens = await countGptMessagesTokens(concatToolMessages, tools);
            const completeMessages = [
              ...concatToolMessages,
              ...toolsRunResponse.map((i) => i?.toolMsgParams)
            ];
            if (node.showStatus) {
              workflowStreamResponse?.({
                event: SseResponseEventEnum.flowNodeStatus,
                data: { status: 'running', name: node.name }
              });
            }
            const toolAssistants = toolsRunResponse
              .map((i) => i.toolRunResponse.assistantResponses || [])
              .flat();
            const adaptChatMessages = GPTMessages2Chats(completeMessages);
            const toolNodeAssistant = adaptChatMessages.pop() as AIChatItemType;
            const toolNodeAssistants = [
              ...assistantResponses,
              ...toolAssistants,
              ...(toolNodeAssistant?.value || [])
            ];
            const dispatchFlowResponse = response
              ? response.dispatchFlowResponse.concat(flatToolsResponseData)
              : flatToolsResponseData;
            const hasStopSignal = flatToolsResponseData.some(
              (i) => !!i.flowResponses?.find((it) => it.toolStop)
            );
            if (hasStopSignal) {
              return {
                dispatchFlowResponse,
                totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
                completeMessages,
                assistantResponses: toolNodeAssistants,
                runTimes:
                  (response?.runTimes || 0) +
                  flatToolsResponseData.reduce((s, i) => s + i.runTimes, 0),
                reasoningText: mergeReasoningText(response?.reasoningText, reasoning2)
              };
            }
            return runToolWithToolChoice(
              { ...props, maxRunToolTimes: maxRunToolTimes - 1, messages: completeMessages },
              {
                dispatchFlowResponse,
                totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
                assistantResponses: toolNodeAssistants,
                runTimes:
                  (response?.runTimes || 0) +
                  flatToolsResponseData.reduce((s, i) => s + i.runTimes, 0),
                reasoningText: mergeReasoningText(response?.reasoningText, reasoning2)
              }
            );
          }
          return {
            dispatchFlowResponse: response?.dispatchFlowResponse || [],
            totalTokens: response?.totalTokens || 0,
            completeMessages: requestMessages,
            assistantResponses: assistantResponses,
            runTimes: response?.runTimes || 0,
            reasoningText: response?.reasoningText || ''
          };
        } catch (e2) {
          addLog.warn('LLM fallback model still failed', { err: `${e2}` });
        }
      }
    }
    return Promise.reject(error);
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
  let callingTool: { name: string; arguments: string } | null = null;
  let toolCalls: ChatCompletionMessageToolCall[] = [];

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;

    // Extract reasoning content first (it may come separately from content or tool_calls)
    const reasoningContent = enableReasoning ? responseChoice?.reasoning_content || '' : '';
    reasoning += reasoningContent;

    if (responseChoice?.content) {
      const content = responseChoice.content || '';
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
    } else if (responseChoice?.tool_calls?.[0]) {
      const toolCall: ChatCompletionMessageToolCall = responseChoice.tool_calls[0];
      // In a stream response, only one tool is returned at a time.  If have id, description is executing a tool
      if (toolCall.id || callingTool) {
        // Start call tool
        if (toolCall.id) {
          callingTool = {
            name: toolCall.function?.name || '',
            arguments: toolCall.function?.arguments || ''
          };
        } else if (callingTool) {
          // Continue call
          callingTool.name += toolCall.function.name || '';
          callingTool.arguments += toolCall.function.arguments || '';
        }

        const toolFunction = callingTool!;

        const toolNode = toolNodes.find((item) => item.nodeId === toolFunction.name);

        if (toolNode) {
          // New tool, add to list.
          const toolId = getNanoid();
          toolCalls.push({
            ...toolCall,
            id: toolId,
            type: 'function',
            function: toolFunction,
            toolName: toolNode.name,
            toolAvatar: toolNode.avatar
          });

          workflowStreamResponse?.({
            event: SseResponseEventEnum.toolCall,
            data: {
              tool: {
                id: toolId,
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                functionName: toolFunction.name,
                params: toolFunction?.arguments ?? '',
                response: ''
              }
            }
          });
          callingTool = null;
        }
      } else {
        /* arg 插入最后一个工具的参数里 */
        const arg: string = toolCall?.function?.arguments ?? '';
        const currentTool = toolCalls[toolCalls.length - 1];
        if (currentTool && arg) {
          currentTool.function.arguments += arg;

          workflowStreamResponse?.({
            write,
            event: SseResponseEventEnum.toolParams,
            data: {
              tool: {
                id: currentTool.id,
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
  }

  if (!textAnswer && toolCalls.length === 0 && !reasoning) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls, reasoning };
}
