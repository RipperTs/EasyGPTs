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
import { filterToolNodeIdByEdges } from '../utils';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { dispatchRunTools } from './runTool';
import { filterToolResponseToPreview } from './runTool/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { StreamChatType } from '@fastgpt/global/core/ai/type';

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
  baseResponse?: string;
  summaryResponse?: string;
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

const normalizeStepText = (step: string) => step.replace(/\s+/g, ' ').trim();

// 注意：`---` 紧跟上一行文本会被 Markdown 解析为 Setext 标题下划线，导致上一行变成标题样式
const SUMMARY_SEPARATOR = '\n\n---\n\n';
const TASK_PREFIX = '\n> Task: ';
const SUMMARY_START_HINT = '\n> 总结\n';

// 提取第一段完整的 JSON 值（对象或数组），忽略字符串内的括号，避免 sliceJsonStr 被 braces-in-string 搞崩
const extractFirstJsonValue = (text: string): string => {
  const str = text.trim();
  if (!str) return '';

  let start = -1;
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i] as string;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (quote && ch === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch as '"' | "'";
      continue;
    }

    if (start === -1) {
      if (ch === '{' || ch === '[') {
        start = i;
        stack.push(ch as '{' | '[');
      }
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch as '{' | '[');
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      const match = (last === '{' && ch === '}') || (last === '[' && ch === ']');
      if (match) {
        stack.pop();
        if (stack.length === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }

  return '';
};

const uniqueOrderedSteps = (steps: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of steps) {
    const key = normalizeStepText(s);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
};

const parseStepsFromModelText = (text: string, maxSteps: number): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonStr = extractFirstJsonValue(trimmed) || trimmed;

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

// Planner 偶发会把“总结/最终答复”写进 steps，但它不应作为 Executor 的可执行子任务（最终交付应由 Replanner/Reply 层生成）
const isReplyLikeStep = (step: string) => {
  const s = normalizeStepText(step);
  if (!s) return false;
  return /(回复用户|面向用户|总结以上|汇总以上|整理以上|(?:输出|给出|生成|整理|撰写|形成).*(?:最终)?.*(?:答复|回复|回答|答案|结果|总结|方案|报告|行程|计划)|最终.*(?:答复|回复|回答|答案|结果|总结|输出))/.test(
    s
  );
};

const normalizePlannerSteps = (steps: string[], maxPlanSteps: number) =>
  uniqueOrderedSteps(steps)
    .filter((s) => !isReplyLikeStep(s))
    .slice(0, maxPlanSteps);

const truncateText = (text: string, maxChars: number) => {
  const t = (text || '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
};

const buildSummarizerUserPrompt = (params: {
  goal: string;
  baseResponse: string;
  pastSteps: { step: string; result: string }[];
}) => {
  const { goal, baseResponse, pastSteps } = params;
  const pastText =
    pastSteps.length === 0
      ? '（无）'
      : pastSteps
          .map(
            (p, i) =>
              `#${i + 1} ${normalizeStepText(p.step)}\n结果：${truncateText(p.result, 1200) || '（无）'}`
          )
          .join('\n\n');

  return `用户问题：${goal}\n\n子任务执行结果：\n${pastText}\n\n当前已给出的答复：\n${truncateText(baseResponse, 2000)}\n\n请基于“用户问题 + 子任务结果 + 当前答复”，输出一份更专业、更结构化的总结回复（中文）。要求：\n- 不要输出待办清单、JSON、代码块\n- 不要杜撰事实；信息不足要明确说明缺口\n- 重点包括：结论/建议、关键依据、下一步（如需要）`;
};

const callSummarizer = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  baseResponse: string;
  pastSteps: { step: string; result: string }[];
  enableReasoning: boolean;
  reasoningEffort?: string;
  stream: boolean;
  workflowStreamResponse?: Props['workflowStreamResponse'];
}): Promise<{ summary: string; tokens: number; reasoningText?: string }> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    baseResponse,
    pastSteps,
    enableReasoning,
    reasoningEffort,
    stream,
    workflowStreamResponse
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) return { summary: '', tokens: 0 };

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个总结器（Summarizer）。你的任务是基于“用户问题 + 已执行步骤结果 + 当前答复”整理出一份更专业的总结回复。`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: buildSummarizerUserPrompt({ goal, baseResponse, pastSteps })
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
    max_tokens: computedMaxToken({ model, maxToken: 1200 }),
    stream,
    messages,
    ...(enableReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
  )) as unknown;

  if (!stream) {
    const unStreamResponse = resp as ChatCompletion;
    const summary = (unStreamResponse.choices?.[0]?.message?.content || '').trim();
    const reasoningText = enableReasoning
      ? // @ts-ignore
        (unStreamResponse.choices?.[0]?.message?.reasoning_content || '').trim()
      : '';
    const assistantMsg: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: summary
    };
    const tokens =
      unStreamResponse.usage?.total_tokens ??
      (await countGptMessagesTokens(messages.concat(assistantMsg)));
    return { summary, tokens, reasoningText };
  }

  const streamResp = resp as StreamChatType;
  let summary = '';
  let reasoningText = '';

  for await (const part of streamResp) {
    const delta = part.choices?.[0]?.delta?.content || '';
    // @ts-ignore
    const deltaReasoning = enableReasoning ? part.choices?.[0]?.delta?.reasoning_content || '' : '';

    if (deltaReasoning) {
      reasoningText += deltaReasoning;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: '',
          reasoning_content: deltaReasoning,
          model: model.model
        })
      });
    }

    if (delta) {
      summary += delta;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: delta,
          reasoning_content: '',
          model: model.model
        })
      });
    }
  }

  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: summary
  };
  const tokens = await countGptMessagesTokens(messages.concat(assistantMsg));

  return { summary: summary.trim(), tokens, reasoningText: reasoningText.trim() };
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
- 步数 1~${maxPlanSteps}，优先 3~${Math.min(maxPlanSteps, 6)} 步
- 不要重复同一句步骤（步骤需要去重）
- 不要包含任何“收尾/成文/面向用户输出”的步骤，例如：总结以上信息、汇总成最终答复、输出最终答案、回复用户等（最终交付由后续 Reply+总结层负责）`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `用户目标：${goal}\n\n可用工具：\n${toolsText}\n\n请输出 JSON：`
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
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
    steps: normalizePlannerSteps(parseStepsFromModelText(content, maxPlanSteps), maxPlanSteps),
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
	2) {"action":"plan","steps":["..."]}：还需要继续执行；steps 只包含“剩余需要做的步骤”，不要重复已完成的步骤；步数 1~${maxPlanSteps}
	重要规则：
	- 只有当“当前剩余计划”为（无）时，你才允许输出 action=response；否则必须输出 action=plan。
	- 当 action=response 时，response 输出“最终交付说明”：
	  - 必须包含：面向用户的最终答复
	  - 需要包含：关键依据（精简）
	  - 若目标是工程/代码类：补充改动点概述、如何运行/验证、风险与注意事项
	  - 禁止输出 JSON、代码块、Markdown 标题、以及任何以 { 或 [ 开头的内容。`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `用户目标：${goal}\n\n当前剩余计划：\n${planText}\n\n已完成步骤：\n${pastText}\n\n请输出 JSON：`
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
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

  const jsonStr = extractFirstJsonValue(content) || content.trim();
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

  // 解析失败时，不把原始内容透传给用户（很可能是半截 JSON / 杂质文本），直接继续执行
  return { action: 'plan', steps: [], tokens, reasoningText: reasoning };
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
  allSteps: string[];
  pastSteps: { step: string; result: string }[];
}) => {
  const { allSteps, pastSteps } = params;
  const doneCounts = new Map<string, number>();
  pastSteps.forEach((p) => {
    const key = normalizeStepText(p.step);
    doneCounts.set(key, (doneCounts.get(key) || 0) + 1);
  });

  const lines: string[] = [];
  allSteps.forEach((raw) => {
    const step = normalizeStepText(raw);
    if (!step) return;
    const remaining = doneCounts.get(step) || 0;
    if (remaining > 0) {
      doneCounts.set(step, remaining - 1);
      lines.push(`- ☑ ~~${step}~~`);
    } else {
      lines.push(`- ☐ ${step}`);
    }
  });

  return `${lines.filter(Boolean).join('\n')}\n`;
};

const mergeRemainingPlan = (params: { current: string[]; suggested: string[] }) => {
  const current = params.current.map(normalizeStepText).filter(Boolean);
  const suggested = params.suggested.map(normalizeStepText).filter(Boolean);

  // strict: replanner 只能重排“当前剩余计划”里的步骤，不能插入新步骤，不能把已完成步骤加回来
  const currentSet = new Set(current);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const s of suggested) {
    if (!s) continue;
    if (!currentSet.has(s)) continue;
    if (seen.has(s)) continue;
    result.push(s);
    seen.add(s);
  }

  // append any remaining steps that suggested didn't include
  for (const s of current) {
    if (!s) continue;
    if (seen.has(s)) continue;
    result.push(s);
    seen.add(s);
  }

  return result;
};

const mergeRemainingPlanWithBudget = (params: {
  current: string[];
  suggested: string[];
  pastSteps: { step: string }[];
  allSteps: string[];
  maxPlanSteps: number;
}) => {
  const doneSet = new Set(params.pastSteps.map((p) => normalizeStepText(p.step)).filter(Boolean));

  const current = params.current
    .map(normalizeStepText)
    .filter(Boolean)
    .filter((s) => !doneSet.has(s));
  const suggested = params.suggested
    .map(normalizeStepText)
    .filter(Boolean)
    .filter((s) => !doneSet.has(s))
    .filter((s) => !isReplyLikeStep(s));

  const allSteps = uniqueOrderedSteps(params.allSteps.map(normalizeStepText).filter(Boolean));
  const allSet = new Set(allSteps);

  const tryAddStep = (s: string) => {
    if (!s) return false;
    if (allSet.has(s)) return true;
    if (allSteps.length >= params.maxPlanSteps) return false;
    allSteps.push(s);
    allSet.add(s);
    return true;
  };

  const seen = new Set<string>();
  const nextPlanQueue: string[] = [];

  // 允许 replanner 插入新步骤，但严格受 maxPlanSteps 约束，避免 todo 无限增长
  for (const s of suggested) {
    if (!tryAddStep(s)) continue;
    if (seen.has(s)) continue;
    nextPlanQueue.push(s);
    seen.add(s);
  }

  // 保留原剩余步骤，避免 replanner 漏掉导致步骤丢失
  for (const s of current) {
    if (!tryAddStep(s)) continue;
    if (seen.has(s)) continue;
    nextPlanQueue.push(s);
    seen.add(s);
  }

  return {
    nextPlanQueue,
    nextAllSteps: allSteps
  };
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

  const initialPlanRaw = planner.steps.length > 0 ? planner.steps : [userChatInput];
  let todoAllSteps = normalizePlannerSteps(initialPlanRaw, maxPlanSteps);
  if (todoAllSteps.length === 0) {
    todoAllSteps = [normalizeStepText(userChatInput)].filter(Boolean);
  }
  let planQueue = [...todoAllSteps];
  const pastSteps: { step: string; result: string }[] = [];

  let totalTokens = planner.tokens;
  let totalRunTimes = 1;
  let reasoningText = (planner.reasoningText || '').trim();

  let todoContent = '';
  const getRemainingTodoSteps = () => {
    const doneSet = new Set(pastSteps.map((p) => normalizeStepText(p.step)).filter(Boolean));
    return todoAllSteps.filter((s) => !doneSet.has(normalizeStepText(s)));
  };
  const getDoneCount = () => todoAllSteps.length - getRemainingTodoSteps().length;

  const pushTodoSnapshot = () => {
    const todo = renderTodoMarkdown({ allSteps: todoAllSteps, pastSteps });
    todoContent = todo;
    if (stream) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.todo,
        data: {
          todo: {
            content: todo,
            done: getDoneCount(),
            total: todoAllSteps.length
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
    const step = planQueue.shift();
    if (!step) break;

    if (stream) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: `${TASK_PREFIX}${normalizeStepText(step)}\n`,
          reasoning_content: '',
          model: model.model
        })
      });
    }

    const stepPrompt = buildExecutorPrompt({
      goal: userChatInput,
      step,
      remainingPlan: planQueue,
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
        // 每个子任务单独执行：不携带历史，避免上下文长度影响与“串味”
        history: 0,
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

    if (stream) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: SUMMARY_SEPARATOR,
          reasoning_content: '',
          model: model.model
        })
      });
    }

    // replan or respond
    let decision = await callReplanner({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      currentPlan: planQueue,
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

    // 强制：只要 todo 还有未完成，就不允许结束（哪怕模型说 response）
    const remainingTodo = getRemainingTodoSteps();
    if (decision.action === 'response' && remainingTodo.length > 0) {
      decision = {
        action: 'plan',
        steps: mergeRemainingPlan({ current: remainingTodo, suggested: [] }),
        tokens: decision.tokens,
        reasoningText: decision.reasoningText
      };
    }

    if (decision.action === 'response') {
      // 结束前补一次最终 todo 快照（确保最后一项被勾选）
      pushTodoSnapshot();

      const baseAnswer = decision.response || pastSteps[pastSteps.length - 1]?.result || '';

      // 当 todo 全部完成后，追加“总结层”输出更专业的总结回复，并用分隔符区分
      let summaryResponse = '';
      if (stream) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.fastAnswer,
          data: textAdaptGptResponse({
            text: baseAnswer,
            reasoning_content: reasoningText,
            model: model.model
          })
        });
        try {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: SUMMARY_START_HINT,
              reasoning_content: '',
              model: model.model
            })
          });
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: SUMMARY_SEPARATOR,
              reasoning_content: '',
              model: model.model
            })
          });

          const summarizer = await callSummarizer({
            modelKey,
            systemPrompt,
            goal: userChatInput,
            baseResponse: baseAnswer,
            pastSteps,
            enableReasoning,
            reasoningEffort,
            stream: true,
            workflowStreamResponse
          });
          summaryResponse = summarizer.summary;
          if (summarizer.reasoningText) {
            reasoningText = reasoningText
              ? `${reasoningText}\n${summarizer.reasoningText}`
              : summarizer.reasoningText;
          }
          totalTokens += summarizer.tokens;
          totalRunTimes += 1;
        } catch (err) {
          summaryResponse = '（总结生成失败，可重试）';
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: summaryResponse,
              reasoning_content: '',
              model: model.model
            })
          });
        }
      } else {
        try {
          const summarizer = await callSummarizer({
            modelKey,
            systemPrompt,
            goal: userChatInput,
            baseResponse: baseAnswer,
            pastSteps,
            enableReasoning,
            reasoningEffort,
            stream: false,
            workflowStreamResponse
          });
          summaryResponse = summarizer.summary;
          if (summarizer.reasoningText) {
            reasoningText = reasoningText
              ? `${reasoningText}\n${summarizer.reasoningText}`
              : summarizer.reasoningText;
          }
          totalTokens += summarizer.tokens;
          totalRunTimes += 1;
        } catch {
          summaryResponse = '';
        }
      }

      const finalAnswer = summaryResponse
        ? `${baseAnswer}${SUMMARY_START_HINT}${SUMMARY_SEPARATOR}${summaryResponse}`
        : baseAnswer;
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
                  done: getDoneCount(),
                  total: todoAllSteps.length
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

      return {
        [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
        [NodeOutputKeyEnum.answerText]: finalAnswer,
        [NodeOutputKeyEnum.reasoningText]: reasoningText,
        [NodeOutputKeyEnum.rawResponse]: {
          plan: planQueue,
          pastSteps,
          finalDecision: 'response',
          baseResponse: baseAnswer,
          summaryResponse
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

    if (decision.action === 'plan') {
      const suggested = decision.steps.length > 0 ? decision.steps : planQueue;
      const merged = mergeRemainingPlanWithBudget({
        current: planQueue,
        suggested,
        pastSteps,
        allSteps: todoAllSteps,
        maxPlanSteps
      });
      planQueue = merged.nextPlanQueue;
      todoAllSteps = merged.nextAllSteps;
    }

    // 防御：若剩余计划意外为空但 todo 仍未全部完成，则按 todoAllSteps 补齐剩余步骤
    if (planQueue.length === 0 && getDoneCount() < todoAllSteps.length) {
      planQueue = getRemainingTodoSteps();
    }
    // 每次执行完一个 step 并完成一次 replan 后，输出更新后的 todo list（含已完成勾选 + 删除线）
    pushTodoSnapshot();
  }

  // fallback
  const fallbackAnswer =
    pastSteps[pastSteps.length - 1]?.result ||
    (planQueue.length > 0 ? `未完成全部步骤，当前停在：${planQueue[0]}` : '未生成有效结果');

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
              done: getDoneCount(),
              total: todoAllSteps.length
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
      plan: planQueue,
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
