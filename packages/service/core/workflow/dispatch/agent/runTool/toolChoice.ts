import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getAIApi } from '../../../../ai/config';
import { loadRequestMessages } from '../../../../chat/utils';
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
import {
  updateToolInputValue,
  formatToolResponse,
  isLLMEmptyResponseError,
  sleep,
  injectWorkflowStartOutputsForToolRun
} from './utils';
import {
  buildChatCompletionRequestBody,
  computedMaxToken,
  createThinkTagStreamParser,
  splitThinkTagContent
} from '../../../../ai/utils';
import { getNanoid, sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { addLog } from '../../../../../common/system/log';
import { toolValueTypeList, valueTypeJsonSchemaMap } from '@fastgpt/global/core/workflow/constants';
import { throwIfAborted } from '../../utils/abort';

type ToolRunResponseType = {
  toolRunResponse: DispatchFlowResponse;
  toolMsgParams: ChatCompletionToolMessageParam;
  toolCall: ChatCompletionMessageToolCall;
}[];

type ToolCallDelta = {
  index?: number;
  id?: string;
  type?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

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

const getToolParamEnumValues = (list: unknown): string[] => {
  if (!Array.isArray(list)) return [];

  return Array.from(
    new Set(
      list
        .map((item) => {
          if (!isRecord(item) || typeof item.value !== 'string') return;
          const value = item.value.trim();
          return value.length > 0 ? value : undefined;
        })
        .filter((value): value is string => typeof value === 'string')
    )
  );
};

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

const normalizeToolCalls = ({
  toolCalls,
  toolNodes,
  source
}: {
  toolCalls: ChatCompletionMessageToolCall[];
  toolNodes: ToolNodeItemType[];
  source: string;
}): ChatCompletionMessageToolCall[] => {
  return toolCalls
    .map((tool) => {
      const functionName = tool.function?.name?.trim() || '';
      if (!functionName) {
        addLog.warn('Ignore tool call without function name', {
          source,
          toolCallId: tool.id
        });
        return;
      }

      const toolNode = toolNodes.find((item) => item.nodeId === functionName);
      if (!toolNode) {
        addLog.warn('Ignore tool call with unknown function name', {
          source,
          toolCallId: tool.id,
          functionName
        });
        return;
      }

      return {
        ...tool,
        id: tool.id || getNanoid(),
        type: 'function' as const,
        toolName: toolNode.name,
        toolAvatar: toolNode.avatar,
        function: {
          name: functionName,
          arguments: typeof tool.function?.arguments === 'string' ? tool.function.arguments : ''
        }
      };
    })
    .filter(Boolean) as ChatCompletionMessageToolCall[];
};

const isBadResponseStatusCodeError = (error: unknown) => {
  if (!isRecord(error)) return false;
  return (
    error.code === 'bad_response_status_code' ||
    error.type === 'bad_response_status_code' ||
    String(error.message || '').includes('bad_response_status_code')
  );
};

const getMessageText = (message: ChatCompletionMessageParam) => {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => (item.type === 'text' ? item.text : ''))
    .filter(Boolean)
    .join('\n');
};

const getToolMessageText = (content: ChatCompletionToolMessageParam['content']) => {
  if (typeof content === 'string') return content;
  try {
    return JSON.stringify(content);
  } catch {
    return String(content || '');
  }
};

const TOOL_RESULT_SUMMARY_CHAR_LIMIT = 8000;
const TOOL_RESULT_TOO_LARGE_PLACEHOLDER =
  '工具返回内容超出上下文预算，已省略原始内容。请基于工具名称、参数和可用上下文回答；如果信息不足，请说明无法确定。';

const formatToolResultSummaryText = (content: ChatCompletionToolMessageParam['content']) => {
  const text = getToolMessageText(content);
  if (text.length <= TOOL_RESULT_SUMMARY_CHAR_LIMIT) return text;

  return `工具返回内容过长，已截断。以下保留开头和结尾片段：\n${sliceStrStartEnd(
    text,
    TOOL_RESULT_SUMMARY_CHAR_LIMIT / 2,
    TOOL_RESULT_SUMMARY_CHAR_LIMIT / 2
  )}`;
};

const buildToolResultSummaryMessages = ({
  requestMessages,
  toolsRunResponse
}: {
  requestMessages: ChatCompletionMessageParam[];
  toolsRunResponse: ToolRunResponseType;
}): ChatCompletionMessageParam[] => {
  const toolResultText = toolsRunResponse
    .map((item, index) => {
      const toolCall = item.toolCall;
      return [
        `Tool ${index + 1}: ${toolCall.toolName || toolCall.function.name}`,
        `Arguments: ${toolCall.function.arguments || '{}'}`,
        `Result: ${formatToolResultSummaryText(item.toolMsgParams.content)}`
      ].join('\n');
    })
    .join('\n\n');

  const lastUserIndex = (() => {
    for (let i = requestMessages.length - 1; i >= 0; i--) {
      if (requestMessages[i]?.role === ChatCompletionRequestMessageRoleEnum.User) return i;
    }
    return -1;
  })();

  const summaryMessage: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.User,
    content: `The tools have already been executed. Use the following tool results as authoritative external data and answer the user's latest question in Simplified Chinese.\n\n${toolResultText}`
  };

  if (lastUserIndex < 0) return [...requestMessages, summaryMessage];

  const lastUserMessage = requestMessages[lastUserIndex];
  return [
    ...requestMessages.slice(0, lastUserIndex),
    {
      ...lastUserMessage,
      content: `${getMessageText(lastUserMessage)}\n\n${summaryMessage.content}`.trim()
    },
    ...requestMessages.slice(lastUserIndex + 1)
  ];
};

const sanitizeToolChoiceMessages = ({
  messages,
  toolNodes
}: {
  messages: ChatCompletionMessageParam[];
  toolNodes: ToolNodeItemType[];
}): ChatCompletionMessageParam[] => {
  const validToolCallIds = new Set<string>();

  return messages
    .map((item) => {
      if (item.role === ChatCompletionRequestMessageRoleEnum.Assistant && item.tool_calls) {
        const toolCalls = normalizeToolCalls({
          toolCalls: item.tool_calls as ChatCompletionMessageToolCall[],
          toolNodes,
          source: 'history'
        }).map((tool) => {
          validToolCallIds.add(tool.id);
          return {
            id: tool.id,
            type: tool.type,
            function: tool.function
          };
        });

        if (toolCalls.length === 0) {
          if (!item.content) return;
          const { tool_calls, ...rest } = item;
          return rest;
        }

        return {
          ...item,
          tool_calls: toolCalls
        };
      }

      if (item.role === ChatCompletionRequestMessageRoleEnum.Tool) {
        return validToolCallIds.has(item.tool_call_id) ? item : undefined;
      }

      return item;
    })
    .filter(Boolean) as ChatCompletionMessageParam[];
};

const compactToolMessageContent = (
  content: ChatCompletionToolMessageParam['content'],
  limit: number
) => {
  const text = getToolMessageText(content);
  if (text.length <= limit) return content;

  const halfLimit = Math.max(100, Math.floor(limit / 2));
  return `工具返回内容过长，已截断。以下保留开头和结尾片段：\n${sliceStrStartEnd(
    text,
    halfLimit,
    halfLimit
  )}`;
};

const compactToolChoiceBlockByBudget = async ({
  block,
  maxTokens
}: {
  block: ChatCompletionMessageParam[];
  maxTokens: number;
}) => {
  const limits = [12000, 6000, 3000, 1500, 800, 400];

  for (const limit of limits) {
    const compactBlock = block.map((message) => {
      if (message.role !== ChatCompletionRequestMessageRoleEnum.Tool) return message;

      return {
        ...message,
        content: compactToolMessageContent(message.content, limit)
      };
    });

    if ((await countGptMessagesTokens(compactBlock)) <= maxTokens) return compactBlock;
  }

  return block.map((message) => {
    if (message.role !== ChatCompletionRequestMessageRoleEnum.Tool) return message;

    return {
      ...message,
      content: TOOL_RESULT_TOO_LARGE_PLACEHOLDER
    };
  });
};

const filterToolChoiceMessagesByMaxContext = async ({
  messages,
  maxContext,
  tools
}: {
  messages: ChatCompletionMessageParam[];
  maxContext: number;
  tools: ChatCompletionTool[];
}) => {
  if (!Array.isArray(messages) || messages.length < 4) return messages;

  const chatStartIndex = messages.findIndex(
    (item) => item.role !== ChatCompletionRequestMessageRoleEnum.System
  );
  const systemMessages =
    chatStartIndex < 0 ? messages : messages.slice(0, Math.max(chatStartIndex, 0));
  const chatMessages = chatStartIndex < 0 ? [] : messages.slice(chatStartIndex);

  const systemAndToolsTokens = await countGptMessagesTokens(systemMessages, tools);
  let remainingContext = maxContext - systemAndToolsTokens;
  const blocks: ChatCompletionMessageParam[][] = [];

  for (let i = 0; i < chatMessages.length; ) {
    const current = chatMessages[i];

    if (current?.role === ChatCompletionRequestMessageRoleEnum.User) {
      const block: ChatCompletionMessageParam[] = [current];
      i += 1;

      while (i < chatMessages.length) {
        const next = chatMessages[i];
        if (next?.role === ChatCompletionRequestMessageRoleEnum.User) break;
        block.push(next);
        i += 1;
      }

      blocks.push(block);
      continue;
    }

    blocks.push([current]);
    i += 1;
  }

  const selectedBlocks: ChatCompletionMessageParam[][] = [];

  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    const tokens = await countGptMessagesTokens(block);
    remainingContext -= tokens;

    if (remainingContext < 0 && selectedBlocks.length === 0) {
      const compactBlock = await compactToolChoiceBlockByBudget({
        block,
        maxTokens: Math.max(maxContext - systemAndToolsTokens, 0)
      });
      selectedBlocks.unshift(compactBlock);
      break;
    }

    if (remainingContext < 0) break;
    selectedBlocks.unshift(block);
  }

  return [...systemMessages, ...selectedBlocks.flat()];
};

const callToolResultFinalAnswer = async ({
  toolModel,
  requestMessages,
  toolsRunResponse,
  temperature,
  maxToken,
  reasoningEffort,
  enableReasoning,
  abortSignal
}: {
  toolModel: LLMModelItemType;
  requestMessages: ChatCompletionMessageParam[];
  toolsRunResponse: ToolRunResponseType;
  temperature: number;
  maxToken: number;
  reasoningEffort?: string;
  enableReasoning: boolean;
  abortSignal?: AbortSignal;
}) => {
  const messages = buildToolResultSummaryMessages({
    requestMessages,
    toolsRunResponse
  });
  const max_tokens = computedMaxToken({ model: toolModel, maxToken });
  const filterMessages = await filterToolChoiceMessagesByMaxContext({
    messages,
    maxContext: toolModel.maxContext - (max_tokens || 0),
    tools: []
  });
  const ai = getAIApi({ timeout: 480000 });
  const requestBody = buildChatCompletionRequestBody({
    model: toolModel,
    messages: filterMessages,
    temperature,
    maxToken,
    stream: false,
    reasoningEffort: enableReasoning ? reasoningEffort : undefined
  });
  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0],
    abortSignal ? { signal: abortSignal } : undefined
  )) as unknown as ChatCompletion;

  const parsedAnswer = splitThinkTagContent(resp.choices?.[0]?.message?.content || '');
  const reasoningByField = enableReasoning
    ? // @ts-ignore
      resp.choices?.[0]?.message?.reasoning_content || ''
    : '';

  return {
    answer: parsedAnswer.text,
    reasoning: [reasoningByField, parsedAnswer.reasoning].filter(Boolean).join('\n'),
    tokens:
      resp.usage?.total_tokens ??
      (await countGptMessagesTokens(
        filterMessages.concat({
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: parsedAnswer.text
        })
      ))
  };
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
      enumValues: getToolParamEnumValues(p.list)
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
  abortSignal?: AbortSignal;
}): Promise<{ args?: Record<string, unknown>; needClarifyQuestions?: string[] }> => {
  const { toolModel, toolNode, lastUserText, badArguments, errors, temperature, abortSignal } =
    params;
  const schemaText = JSON.stringify(
    (toolNode.toolParams || []).map((p) => {
      const rec = p as unknown as {
        key?: unknown;
        required?: unknown;
        toolDescription?: unknown;
        list?: unknown;
        valueType?: unknown;
      };
      const enumValues = getToolParamEnumValues(rec.list);
      return {
        key: typeof rec.key === 'string' ? rec.key : '',
        required: !!rec.required,
        description: typeof rec.toolDescription === 'string' ? rec.toolDescription : '',
        valueType: typeof rec.valueType === 'string' ? rec.valueType : undefined,
        ...(enumValues.length ? { enum: enumValues } : {})
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
    const requestBody = buildChatCompletionRequestBody({
      model: toolModel,
      messages: repairMessages,
      temperature: Math.min(0.2, temperature),
      maxToken: 350,
      stream: false
    });
    const resp = (await ai.chat.completions.create(
      requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0],
      abortSignal ? { signal: abortSignal } : undefined
    )) as unknown as ChatCompletion;

    const content = splitThinkTagContent(resp.choices?.[0]?.message?.content || '').text.trim();
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
  const abortSignal = workflowProps.abortSignal;
  const ensureNotAborted = () => throwIfAborted({ abortSignal, res });

  const runtimeNodesWithStartOutputs = injectWorkflowStartOutputsForToolRun({
    runtimeNodes,
    query: workflowProps.query
  });

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
      const enumValues = getToolParamEnumValues(p.list);
      if (enumValues.length > 0) {
        properties[p.key].enum = enumValues;
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
  const filterMessages = sanitizeToolChoiceMessages({
    messages: await filterToolChoiceMessagesByMaxContext({
      messages,
      maxContext: toolModel.maxContext - (max_tokens || 0), // filter token. not response maxToken
      tools
    }),
    toolNodes
  });

  const [requestMessages] = await Promise.all([
    loadRequestMessages({
      messages: filterMessages,
      useVision: toolModel.vision && aiChatVision,
      origin: requestOrigin
    })
  ]);
  let requestBody = buildChatCompletionRequestBody({
    model: toolModel,
    messages: requestMessages,
    temperature,
    maxToken,
    stream,
    reasoningEffort: enableReasoning ? reasoningEffort : undefined,
    extraBody: {
      tools,
      tool_choice: 'auto'
    }
  });

  // console.log(JSON.stringify(requestBody, null, 2));
  /* Run llm */
  const ai = getAIApi({
    timeout: 480000
  });

  try {
    ensureNotAborted();
    let aiResponse = await ai.chat.completions.create(requestBody as any, {
      signal: abortSignal,
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
      const toolCalls = normalizeToolCalls({
        toolCalls: result.choices?.[0]?.message?.tool_calls || [],
        toolNodes,
        source: 'completion'
      });

      const parsedAnswer = splitThinkTagContent(result.choices?.[0]?.message?.content || '');
      const reasoningByField = enableReasoning
        ? // @ts-ignore
          result.choices?.[0]?.message?.reasoning_content || ''
        : '';
      const reasoning = [reasoningByField, parsedAnswer.reasoning].filter(Boolean).join('\n');

      return {
        answer: parsedAnswer.text,
        toolCalls,
        reasoning
      };
    };

    const { answer, toolCalls, reasoning } = await (async () => {
      try {
        return await parseAiResponse(aiResponse);
      } catch (e) {
        if (!isLLMEmptyResponseError(e)) throw e;

        ensureNotAborted();
        addLog.warn('LLM response empty, retry once', { model: toolModel.model });
        await sleep(150);
        ensureNotAborted();
        aiResponse = await ai.chat.completions.create(requestBody as any, {
          signal: abortSignal,
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
                temperature,
                abortSignal
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
                  toolMsgParams,
                  toolCall: tool
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
              toolMsgParams,
              toolCall: tool
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
              toolMsgParams,
              toolCall: tool
            };
          }

          const toolRunResponse = await dispatchWorkFlow({
            ...workflowProps,
            isToolCall: true,
            runtimeNodes: runtimeNodesWithStartOutputs.map((item) =>
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
                toolName: toolNode.name,
                toolAvatar: toolNode.avatar,
                params: JSON.stringify(args),
                response: sliceStrStartEnd(stringToolResponse, 500, 500)
              }
            }
          });

          return {
            toolRunResponse,
            toolMsgParams,
            toolCall: tool
          };
        })
      )
    ).filter(Boolean) as ToolRunResponseType;

    const executedToolCalls = toolsRunResponse.map((item) => item.toolCall);
    const flatToolsResponseData = toolsRunResponse.map((item) => item.toolRunResponse).flat();
    if (executedToolCalls.length > 0 && !res?.closed) {
      // Run the tool, combine its results, and perform another round of AI calls
      const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: executedToolCalls
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

      const nextResponse = {
        dispatchFlowResponse,
        totalTokens: response?.totalTokens ? response.totalTokens + tokens : tokens,
        assistantResponses: toolNodeAssistants,
        runTimes:
          (response?.runTimes || 0) +
          flatToolsResponseData.reduce((sum, item) => sum + item.runTimes, 0),
        toolResultCache,
        toolValidationRetry,
        reasoningText: mergeReasoningText(response?.reasoningText, reasoning)
      };

      try {
        return await runToolWithToolChoice(
          {
            ...props,
            maxRunToolTimes: maxRunToolTimes - 1,
            messages: completeMessages
          },
          nextResponse
        );
      } catch (error) {
        if (!isBadResponseStatusCodeError(error)) throw error;

        addLog.warn('LLM tool history rejected, synthesize answer with text tool summary', {
          model: toolModel.model
        });
        const finalAnswer = await callToolResultFinalAnswer({
          toolModel,
          requestMessages,
          toolsRunResponse,
          temperature,
          maxToken,
          reasoningEffort,
          enableReasoning,
          abortSignal
        });
        const gptAssistantResponse: ChatCompletionAssistantMessageParam = {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: finalAnswer.answer
        };
        const toolNodeAssistant = GPTMessages2Chats([gptAssistantResponse])[0] as AIChatItemType;

        return {
          ...nextResponse,
          totalTokens: nextResponse.totalTokens + finalAnswer.tokens,
          completeMessages: completeMessages.concat(gptAssistantResponse),
          assistantResponses: [
            ...nextResponse.assistantResponses,
            ...(toolNodeAssistant?.value || [])
          ],
          runTimes: nextResponse.runTimes + 1,
          reasoningText: mergeReasoningText(nextResponse.reasoningText, finalAnswer.reasoning)
        };
      }
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
    ensureNotAborted();
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
        requestBody = buildChatCompletionRequestBody({
          model: fallback,
          messages: requestMessages,
          temperature,
          maxToken,
          stream,
          reasoningEffort: enableReasoning ? reasoningEffort : undefined,
          extraBody: {
            tools,
            tool_choice: 'auto'
          }
        });
        try {
          const ai2 = getAIApi({ timeout: 480000 });
          ensureNotAborted();
          const aiResponse2 = await ai2.chat.completions.create(requestBody as any, {
            signal: abortSignal,
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
              const toolCalls = normalizeToolCalls({
                toolCalls: result.choices?.[0]?.message?.tool_calls || [],
                toolNodes,
                source: 'fallback-completion'
              });
              const parsedAnswer = splitThinkTagContent(
                result.choices?.[0]?.message?.content || ''
              );
              const reasoningByField = enableReasoning
                ? // @ts-ignore
                  result.choices?.[0]?.message?.reasoning_content || ''
                : '';
              const reasoning2 = [reasoningByField, parsedAnswer.reasoning]
                .filter(Boolean)
                .join('\n');

              return {
                answer: parsedAnswer.text,
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
                  runtimeNodes: runtimeNodesWithStartOutputs.map((item) =>
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
                      toolName: toolNode.name,
                      toolAvatar: toolNode.avatar,
                      params: tool.function.arguments,
                      response: sliceStrStartEnd(stringToolResponse, 500, 500)
                    }
                  }
                });
                return { toolRunResponse, toolMsgParams, toolCall: tool };
              })
            )
          ).filter(Boolean) as ToolRunResponseType;

          const executedToolCalls = toolsRunResponse.map((i) => i.toolCall);
          const flatToolsResponseData = toolsRunResponse.map((i) => i.toolRunResponse).flat();
          if (executedToolCalls.length > 0 && !res?.closed) {
            const assistantToolMsgParams: ChatCompletionAssistantToolParam = {
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls: executedToolCalls
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
  const toolCallMap = new Map<number, ChatCompletionMessageToolCall>();
  let lastActiveToolIndex: number | undefined;
  const emittedToolCallIds = new Set<string>();
  const thinkTagParser = createThinkTagStreamParser();

  const getToolIndex = (delta: ToolCallDelta) =>
    typeof delta.index === 'number' && Number.isFinite(delta.index)
      ? delta.index
      : lastActiveToolIndex ?? 0;

  const tryEmitToolCall = (toolCall: ChatCompletionMessageToolCall) => {
    if (emittedToolCallIds.has(toolCall.id)) return;

    const functionName = toolCall.function?.name || '';
    if (!functionName) return;

    const toolNode = toolNodes.find((item) => item.nodeId === functionName);
    if (!toolNode) return;

    toolCall.toolName = toolNode.name;
    toolCall.toolAvatar = toolNode.avatar;

    workflowStreamResponse?.({
      write,
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: toolCall.id,
          toolName: toolNode.name,
          toolAvatar: toolNode.avatar,
          functionName,
          params: toolCall.function?.arguments ?? '',
          response: ''
        }
      }
    });

    emittedToolCallIds.add(toolCall.id);
  };

  for await (const part of stream) {
    if (res.closed) {
      stream.controller?.abort();
      break;
    }

    const responseChoice = part.choices?.[0]?.delta;

    // Extract reasoning content first (it may come separately from content or tool_calls)
    const parsed = thinkTagParser.push(responseChoice?.content || '');
    const reasoningByField = enableReasoning ? responseChoice?.reasoning_content || '' : '';
    const reasoningContent = [reasoningByField, parsed.reasoning].filter(Boolean).join('');
    reasoning += reasoningContent;

    if (responseChoice?.content) {
      textAnswer += parsed.text;

      if (parsed.text || reasoningContent) {
        workflowStreamResponse?.({
          write,
          event: SseResponseEventEnum.answer,
          data: textAdaptGptResponse({
            text: parsed.text,
            reasoning_content: reasoningContent
          })
        });
      }
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
    } else if (responseChoice?.tool_calls?.length) {
      const deltas = responseChoice.tool_calls as unknown as ToolCallDelta[];

      for (const delta of deltas) {
        let idx = getToolIndex(delta);

        const namePart = delta.function?.name || '';
        const argPart = delta.function?.arguments || '';

        let existing = toolCallMap.get(idx);
        if (!namePart && !delta.id && argPart && lastActiveToolIndex !== undefined) {
          const activeToolCall = toolCallMap.get(lastActiveToolIndex);
          if (activeToolCall?.function?.name) {
            idx = lastActiveToolIndex;
            existing = activeToolCall;
          }
        }

        if (!existing) {
          const toolId = getNanoid();
          const newToolCall: ChatCompletionMessageToolCall = {
            id: delta.id || toolId,
            type: 'function',
            function: {
              name: namePart,
              arguments: argPart
            }
          };
          toolCallMap.set(idx, newToolCall);
          if (namePart) lastActiveToolIndex = idx;
          tryEmitToolCall(newToolCall);
        } else {
          if (namePart) {
            existing.function.name = `${existing.function.name || ''}${namePart}`;
            lastActiveToolIndex = idx;
          }
          if (delta.id && !existing.id) {
            existing.id = delta.id;
          }
          if (argPart) {
            existing.function.arguments = `${existing.function.arguments || ''}${argPart}`;
          }

          if (argPart) {
            workflowStreamResponse?.({
              write,
              event: SseResponseEventEnum.toolParams,
              data: {
                tool: {
                  id: existing.id,
                  toolName: '',
                  toolAvatar: '',
                  params: argPart,
                  response: ''
                }
              }
            });
          }

          tryEmitToolCall(existing);
        }
      }
    }
  }

  const rest = thinkTagParser.flush();
  textAnswer += rest.text;
  reasoning += rest.reasoning;
  if (rest.text || rest.reasoning) {
    workflowStreamResponse?.({
      write,
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text: rest.text,
        reasoning_content: rest.reasoning
      })
    });
  }

  const toolCalls = normalizeToolCalls({
    toolCalls: Array.from(toolCallMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([, tool]) => tool),
    toolNodes,
    source: 'stream'
  });

  if (!textAnswer && toolCalls.length === 0 && !reasoning) {
    return Promise.reject('LLM api response empty');
  }

  return { answer: textAnswer, toolCalls, reasoning };
}
