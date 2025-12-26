import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ChatCompletion, ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { getAIApi } from '../../../ai/config';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import { computedMaxToken, computedTemperature } from '../../../ai/utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import json5 from 'json5';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { sliceJsonStr } from '@fastgpt/global/common/string/tools';
import { filterToolNodeIdByEdges } from '../utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { dispatchRunTools } from './runTool';
import { filterToolResponseToPreview } from './runTool/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: string;

  [NodeInputKeyEnum.agentMaxPlanSteps]?: number;
  [NodeInputKeyEnum.agentMaxLoops]?: number;
}>;

type RawResponse = {
  plan: string[];
  pastSteps: { step: string; result: string }[];
  finalDecision: 'response' | 'fallback';
};

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.reasoningText]?: string;
  [NodeOutputKeyEnum.rawResponse]: RawResponse;
}>;

const clampInt = (value: unknown, defaultValue: number, min: number, max: number) => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : defaultValue;

  if (!Number.isFinite(n)) return defaultValue;
  const rounded = Math.round(n);
  return Math.min(Math.max(rounded, min), max);
};

const normalizeSteps = (value: unknown, maxSteps: number): string[] => {
  if (!Array.isArray(value)) return [];
  const steps = value
    .filter((item): item is string => typeof item === 'string')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxSteps);

  return steps;
};

const parseStepsFromModelText = (text: string, maxSteps: number): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonStr = sliceJsonStr(trimmed) || trimmed;

  try {
    const parsed = json5.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) return normalizeSteps(parsed, maxSteps);
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { steps?: unknown; plan?: unknown };
      return normalizeSteps(obj.steps ?? obj.plan, maxSteps);
    }
  } catch {}

  return [];
};

type PlannerResult = {
  steps: string[];
  tokens: number;
  reasoningText?: string;
};

const callPlanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  maxPlanSteps: number;
  toolNodes: RuntimeNodeItemType[];
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<PlannerResult> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    maxPlanSteps,
    toolNodes,
    enableReasoning,
    reasoningEffort
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) return { steps: [], tokens: 0 };

  const toolsText =
    toolNodes.length === 0
      ? '（无）'
      : toolNodes
          .map((t, i) => `${i + 1}. ${t.name || t.nodeId}${t.intro ? `：${t.intro}` : ''}`)
          .join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个规划器（Planner）。请把用户目标拆成可执行的多步计划，便于后续逐步调用工具完成。
要求：
- 只输出严格 JSON，不要输出其它文字
- JSON 格式：{"steps":["..."]}
- 步骤用中文，一步一句，尽量具体、可执行
- 步数 1~${maxPlanSteps}，优先 3~${Math.min(maxPlanSteps, 6)} 步`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `用户目标：${goal}\n\n可用工具：\n${toolsText}\n\n请输出 JSON：`
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const max_tokens = computedMaxToken({ model, maxToken: 800 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
    max_tokens,
    stream: false,
    messages,
    ...(enableReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
  )) as unknown as ChatCompletion;
  const content = resp.choices?.[0]?.message?.content || '';
  const reasoning = enableReasoning
    ? // @ts-ignore
      resp.choices?.[0]?.message?.reasoning_content || ''
    : '';

  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content
  };

  const tokens =
    resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

  return {
    steps: parseStepsFromModelText(content, maxPlanSteps),
    tokens,
    reasoningText: reasoning
  };
};

type ReplanResult =
  | { action: 'response'; response: string; tokens: number; reasoningText?: string }
  | { action: 'plan'; steps: string[]; tokens: number; reasoningText?: string };

const callReplanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  currentPlan: string[];
  pastSteps: { step: string; result: string }[];
  maxPlanSteps: number;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<ReplanResult> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    currentPlan,
    pastSteps,
    maxPlanSteps,
    enableReasoning,
    reasoningEffort
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) {
    return {
      action: 'response',
      response: pastSteps[pastSteps.length - 1]?.result || '',
      tokens: 0
    };
  }

  const pastText =
    pastSteps.length === 0
      ? '（无）'
      : pastSteps.map((p, i) => `#${i + 1} 步骤：${p.step}\n结果：${p.result}`).join('\n\n');

  const planText =
    currentPlan.length === 0 ? '（无）' : currentPlan.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个 Replanner/Responder。根据目标、剩余计划、已完成步骤的结果，决定下一步。
你必须二选一输出（只输出严格 JSON，不要输出其它文字）：
1) {"action":"response","response":"..."}：已经可以直接回答用户
2) {"action":"plan","steps":["..."]}：还需要继续执行；steps 只包含“剩余需要做的步骤”，不要重复已完成的步骤；步数 1~${maxPlanSteps}`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `用户目标：${goal}\n\n当前剩余计划：\n${planText}\n\n已完成步骤：\n${pastText}\n\n请输出 JSON：`
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const max_tokens = computedMaxToken({ model, maxToken: 800 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
    max_tokens,
    stream: false,
    messages,
    ...(enableReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
  )) as unknown as ChatCompletion;
  const content = resp.choices?.[0]?.message?.content || '';
  const reasoning = enableReasoning
    ? // @ts-ignore
      resp.choices?.[0]?.message?.reasoning_content || ''
    : '';

  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content
  };

  const tokens =
    resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

  const jsonStr = sliceJsonStr(content) || content.trim();
  try {
    const parsed = json5.parse(jsonStr) as unknown;
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as {
        action?: unknown;
        response?: unknown;
        steps?: unknown;
        plan?: unknown;
      };
      const action = typeof obj.action === 'string' ? obj.action : '';
      if (action === 'response' && typeof obj.response === 'string') {
        return {
          action: 'response',
          response: obj.response.trim(),
          tokens,
          reasoningText: reasoning
        };
      }
      if (action === 'plan') {
        const steps = normalizeSteps(obj.steps ?? obj.plan, maxPlanSteps);
        return { action: 'plan', steps, tokens, reasoningText: reasoning };
      }
    }
  } catch {}

  return {
    action: 'response',
    response: content.trim(),
    tokens,
    reasoningText: reasoning
  };
};

const buildExecutorPrompt = (params: {
  goal: string;
  step: string;
  remainingPlan: string[];
  pastSteps: { step: string; result: string }[];
}) => {
  const { goal, step, remainingPlan, pastSteps } = params;

  const remainingText =
    remainingPlan.length === 0
      ? '（无）'
      : remainingPlan.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const pastText =
    pastSteps.length === 0
      ? '（无）'
      : pastSteps.map((p, i) => `#${i + 1} ${p.step}\n结果：${p.result}`).join('\n\n');

  return `你是一个执行器（Executor），只需要完成“当前步骤”，必要时可以调用工具。请用简洁中文输出本步骤结果（建议 <=200 字），不要输出计划本身。

用户目标：${goal}

已完成步骤：
${pastText}

剩余计划：
${remainingText}

当前步骤：${step}
`;
};

const renderTodoMarkdown = (params: {
  pastSteps: { step: string; result: string }[];
  plan: string[];
}) => {
  const { pastSteps, plan } = params;
  const items = [
    ...pastSteps.map((p) => ({ step: p.step, done: true })),
    ...plan.map((s) => ({ step: s, done: false }))
  ];

  const lines = items.map((item) => {
    const step = item.step.replace(/\s+/g, ' ').trim();
    if (!step) return '';
    if (item.done) return `- ☑ ~~${step}~~`;
    return `- ☐ ${step}`;
  });

  return `${lines.filter(Boolean).join('\n')}\n`;
};

const pickToolItems = (items: AIChatItemValueItemType[]) =>
  items.filter((i) => i.type === ChatItemValueTypeEnum.tool);

export async function dispatchAgentChat(props: Props): Promise<Response> {
  const {
    node: { nodeId, name },
    runtimeNodes,
    runtimeEdges,
    histories,
    params: {
      model: modelKey,
      systemPrompt,
      userChatInput,
      history = 6,
      aiChatReasoning = true,
      aiChatReasoningEffort,
      agentMaxPlanSteps,
      agentMaxLoops
    },
    workflowStreamResponse,
    stream
  } = props;

  const model = getLLMModel(modelKey);
  if (!model) return Promise.reject('LLM model not found');

  const enableReasoning = !!aiChatReasoning && !!model.reasoning;
  const reasoningEffort =
    enableReasoning && aiChatReasoningEffort ? aiChatReasoningEffort : undefined;

  const maxPlanSteps = clampInt(agentMaxPlanSteps, 6, 1, 20);
  const maxLoops = clampInt(agentMaxLoops, 12, 1, 50);

  const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });
  const toolNodes = toolNodeIds
    .map((id) => runtimeNodes.find((n) => n.nodeId === id))
    .filter((n): n is RuntimeNodeItemType => !!n);

  // planner
  const planner = await callPlanner({
    modelKey,
    systemPrompt,
    goal: userChatInput,
    maxPlanSteps,
    toolNodes,
    enableReasoning,
    reasoningEffort
  });

  let plan = planner.steps.length > 0 ? planner.steps : [userChatInput];
  const pastSteps: { step: string; result: string }[] = [];

  let totalTokens = planner.tokens;
  let totalRunTimes = 1;
  let reasoningText = (planner.reasoningText || '').trim();

  let todoContent = '';
  const pushTodoSnapshot = () => {
    const todo = renderTodoMarkdown({ pastSteps, plan });
    todoContent = todo;
    if (stream) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.todo,
        data: {
          todo: {
            content: todo,
            done: pastSteps.length,
            total: pastSteps.length + plan.length
          }
        }
      });
    }
  };

  // 首次输出 todo list（模型规划后给用户的可视化清单）
  pushTodoSnapshot();

  // collect tool logs for preview
  let toolItems: AIChatItemValueItemType[] = [];
  let toolDetail: ChatHistoryItemResType[] = [];
  let nodeUsages: ChatNodeUsageType[] = [];

  // execute + replan
  for (let loop = 0; loop < maxLoops; loop++) {
    const step = plan.shift();
    if (!step) break;

    const stepPrompt = buildExecutorPrompt({
      goal: userChatInput,
      step,
      remainingPlan: plan,
      pastSteps
    });

    const stepResult = await dispatchRunTools({
      ...props,
      params: {
        model: modelKey,
        temperature: props.params.temperature,
        maxToken: props.params.maxToken,
        aiChatVision: props.params.aiChatVision,
        aiChatReasoning: props.params.aiChatReasoning,
        aiChatReasoningEffort: props.params.aiChatReasoningEffort,
        history,
        systemPrompt: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个 Plan-and-Execute Agent：会先规划，再逐步执行；每次只解决“当前步骤”。`,
        userChatInput: stepPrompt
      },
      histories
    });

    const stepAnswer = stepResult[NodeOutputKeyEnum.answerText] || '';
    pastSteps.push({ step, result: stepAnswer });
    const stepReasoning = stepResult[NodeOutputKeyEnum.reasoningText];
    if (stepReasoning) {
      reasoningText = reasoningText ? `${reasoningText}\n${stepReasoning}` : stepReasoning;
    }

    const stepAssistant = stepResult[DispatchNodeResponseKeyEnum.assistantResponses] || [];
    toolItems = toolItems.concat(pickToolItems(stepAssistant));

    const stepNodeResponse = stepResult[DispatchNodeResponseKeyEnum.nodeResponse];
    if (stepNodeResponse && Array.isArray(stepNodeResponse.toolDetail)) {
      toolDetail = toolDetail.concat(stepNodeResponse.toolDetail);
    }

    const stepUsages = stepResult[DispatchNodeResponseKeyEnum.nodeDispatchUsages] || [];
    nodeUsages = nodeUsages.concat(stepUsages.slice(1));

    totalRunTimes += stepResult[DispatchNodeResponseKeyEnum.runTimes] || 1;
    totalTokens += stepNodeResponse?.toolCallTokens || 0;

    // replan or respond
    const decision = await callReplanner({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      currentPlan: plan,
      pastSteps,
      maxPlanSteps,
      enableReasoning,
      reasoningEffort
    });

    totalTokens += decision.tokens;
    totalRunTimes += 1;
    if (decision.reasoningText) {
      reasoningText = reasoningText
        ? `${reasoningText}\n${decision.reasoningText}`
        : decision.reasoningText;
    }

    if (decision.action === 'response') {
      const finalAnswer = decision.response || pastSteps[pastSteps.length - 1]?.result || '';
      const { totalPoints, modelName } = formatModelChars2Points({
        model: modelKey,
        tokens: totalTokens,
        modelType: ModelTypeEnum.llm
      });

      const previewToolItems = filterToolResponseToPreview(toolItems);
      const finalAssistantResponses: AIChatItemValueItemType[] = [
        ...(todoContent
          ? [
              {
                type: ChatItemValueTypeEnum.todo as AIChatItemValueItemType['type'],
                todo: {
                  content: todoContent,
                  done: pastSteps.length,
                  total: pastSteps.length + plan.length
                }
              }
            ]
          : []),
        ...(reasoningText
          ? [
              {
                type: ChatItemValueTypeEnum.reasoning as AIChatItemValueItemType['type'],
                reasoning: { content: reasoningText }
              }
            ]
          : []),
        ...previewToolItems,
        {
          type: ChatItemValueTypeEnum.text as AIChatItemValueItemType['type'],
          text: { content: finalAnswer }
        }
      ];

      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: finalAnswer,
          reasoning_content: reasoningText,
          model: model.model
        })
      });

      return {
        [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
        [NodeOutputKeyEnum.answerText]: finalAnswer,
        [NodeOutputKeyEnum.reasoningText]: reasoningText,
        [NodeOutputKeyEnum.rawResponse]: {
          plan,
          pastSteps,
          finalDecision: 'response'
        },
        [DispatchNodeResponseKeyEnum.assistantResponses]: finalAssistantResponses,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints,
          toolCallTokens: totalTokens,
          model: modelName,
          query: userChatInput,
          historyPreview: getHistoryPreview(
            GPTMessages2Chats(
              [
                {
                  role: ChatCompletionRequestMessageRoleEnum.System,
                  content: systemPrompt || ''
                },
                {
                  role: ChatCompletionRequestMessageRoleEnum.User,
                  content: userChatInput
                },
                {
                  role: ChatCompletionRequestMessageRoleEnum.Assistant,
                  content: finalAnswer
                }
              ],
              false
            ),
            10000
          ),
          toolDetail
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
          {
            moduleName: name,
            totalPoints,
            model: modelName,
            tokens: totalTokens
          },
          ...nodeUsages
        ]
      };
    }

    plan = decision.steps.length > 0 ? decision.steps : plan;
    // 每次执行完一个 step 并完成一次 replan 后，输出更新后的 todo list（含已完成勾选 + 删除线）
    pushTodoSnapshot();
    if (plan.length === 0) {
      // Let next loop exit and fallback to final summary if needed
      continue;
    }
  }

  // fallback
  const fallbackAnswer =
    pastSteps[pastSteps.length - 1]?.result ||
    (plan.length > 0 ? `未完成全部步骤，当前停在：${plan[0]}` : '未生成有效结果');

  const { totalPoints, modelName } = formatModelChars2Points({
    model: modelKey,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  const previewToolItems = filterToolResponseToPreview(toolItems);
  const finalAssistantResponses: AIChatItemValueItemType[] = [
    ...(todoContent
      ? [
          {
            type: ChatItemValueTypeEnum.todo as AIChatItemValueItemType['type'],
            todo: {
              content: todoContent,
              done: pastSteps.length,
              total: pastSteps.length + plan.length
            }
          }
        ]
      : []),
    ...(reasoningText
      ? [
          {
            type: ChatItemValueTypeEnum.reasoning as AIChatItemValueItemType['type'],
            reasoning: { content: reasoningText }
          }
        ]
      : []),
    ...previewToolItems,
    {
      type: ChatItemValueTypeEnum.text as AIChatItemValueItemType['type'],
      text: { content: fallbackAnswer }
    }
  ];

  workflowStreamResponse?.({
    event: SseResponseEventEnum.fastAnswer,
    data: textAdaptGptResponse({
      text: fallbackAnswer,
      reasoning_content: reasoningText,
      model: model.model
    })
  });

  return {
    [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
    [NodeOutputKeyEnum.answerText]: fallbackAnswer,
    [NodeOutputKeyEnum.reasoningText]: reasoningText,
    [NodeOutputKeyEnum.rawResponse]: {
      plan,
      pastSteps,
      finalDecision: 'fallback'
    },
    [DispatchNodeResponseKeyEnum.assistantResponses]: finalAssistantResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints,
      toolCallTokens: totalTokens,
      model: modelName,
      query: userChatInput,
      toolDetail
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
      {
        moduleName: name,
        totalPoints,
        model: modelName,
        tokens: totalTokens
      },
      ...nodeUsages
    ]
  };
}
