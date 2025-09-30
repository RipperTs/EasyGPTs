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
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { dispatchWorkFlow } from '../../index';
import { DispatchToolModuleProps, RunToolResponse, ToolNodeItemType } from './type.d';
import json5 from 'json5';
import { DispatchFlowResponse, WorkflowResponseType } from '../../type';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { AIChatItemType } from '@fastgpt/global/core/chat/type';
import { updateToolInputValue, formatToolResponse } from './utils';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../../common/system/log';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/type';

type ToolRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
}[];

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
  },
  response?: RunToolResponse
): Promise<RunToolResponse> => {
  const { messages, toolNodes, toolModel, maxRunToolTimes, ...workflowProps } = props;
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
  let requestBody: ChatCompletionCreateParams = {
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

    const { answer, toolCalls } = await (async () => {
      if (res && stream) {
        return streamResponse({
          res,
          workflowStreamResponse,
          toolNodes,
          stream: aiResponse
        });
      } else {
        const result = aiResponse as ChatCompletion;
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

        return {
          answer: result.choices?.[0]?.message?.content || '',
          toolCalls: toolCalls
        };
      }
    })();

    // Run the selected tool by LLM.
    const toolsRunResponse = (
      await Promise.all(
        toolCalls.map(async (tool) => {
          const toolNode = toolNodes.find((item) => item.nodeId === tool.function?.name);

          if (!toolNode) return;

          const startParams = (() => {
            try {
              return json5.parse(tool.function.arguments);
            } catch (error) {
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
                : {
                    ...item,
                    isEntry: false
                  }
            )
          });

          const stringToolResponse = formatToolResponse(toolRunResponse.toolResponses);

          const toolMsgParams: ChatCompletionToolMessageParam = {
            tool_call_id: tool.id,
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            name: tool.function.name,
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
        ...toolNodeAssistant.value
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
            flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0)
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
            flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0)
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
        assistantResponses: [...assistantResponses, ...toolNodeAssistant.value],
        runTimes: (response?.runTimes || 0) + 1
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
          const { answer, toolCalls } = await (async () => {
            if (res && stream) {
              return streamResponse({
                res,
                workflowStreamResponse,
                toolNodes,
                stream: aiResponse2
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
              return {
                answer: result.choices?.[0]?.message?.content || '',
                toolCalls
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
                  name: tool.function.name,
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
              ...toolNodeAssistant.value
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
                  flatToolsResponseData.reduce((s, i) => s + i.runTimes, 0)
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
                  flatToolsResponseData.reduce((s, i) => s + i.runTimes, 0)
              }
            );
          }
          return {
            dispatchFlowResponse: response?.dispatchFlowResponse || [],
            totalTokens: response?.totalTokens || 0,
            completeMessages: requestMessages,
            assistantResponses: assistantResponses,
            runTimes: response?.runTimes || 0
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
  workflowStreamResponse
}: {
  res: NextApiResponse;
  toolNodes: ToolNodeItemType[];
  stream: StreamChatType;
  workflowStreamResponse?: WorkflowResponseType;
}) {
  const write = responseWriteController({
    res,
    readStream: stream
  });

  let textAnswer = '';
  let callingTool: { name: string; arguments: string } | null = null;
  let toolCalls: ChatCompletionMessageToolCall[] = [];

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;

    if (responseChoice?.content) {
      const content = responseChoice.content || '';
      textAnswer += content;

      workflowStreamResponse?.({
        write,
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
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

  if (!textAnswer && toolCalls.length === 0) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls };
}
