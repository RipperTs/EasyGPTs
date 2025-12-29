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
import { randomUUID } from 'crypto';

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
  traceId: string;
  plan: string[];
  pastSteps: { step: string; result: string }[];
  finalDecision: 'response' | 'fallback';
  planSteps?: AgentPlanStep[];
  replanHistory?: Array<{
    loop: number;
    changeSummary: string;
    reason: string;
    beforeRemaining: string[];
    afterRemaining: string[];
  }>;
  usage?: {
    totalTokens: number;
    totalRunTimes: number;
  };
};

type AgentPlanStep = {
  id: string;
  title: string;
  intent?: string;
  toolHints?: string[];
  expectedOutput?: string;
  acceptanceCriteria?: string[];
  inputs?: Record<string, unknown>;
};

type AgentPastStep = {
  step: AgentPlanStep;
  result: string;
  toolText?: string;
  critic?: {
    score: number;
    issues: string[];
    suggestion: string;
  };
};

// Task Analyzer result type
type TaskAnalysisResult = {
  complexity: 'simple' | 'complex';
  reason: string;
  tokens: number;
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
const TASK_PREFIX = '\n> 任务：';

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

const normalizePlannerPlanSteps = (
  steps: AgentPlanStep[],
  maxPlanSteps: number,
  reservedIds?: Set<string>
) => {
  const seenTitle = new Set<string>();
  const seenId = new Set<string>();
  const result: AgentPlanStep[] = [];

  for (const step of steps) {
    const title = normalizeStepText(step.title);
    if (!title) continue;
    if (isReplyLikeStep(title)) continue;

    const titleKey = normalizeStepText(title);
    if (!titleKey) continue;
    if (seenTitle.has(titleKey)) continue;

    let id = isNonEmptyString(step.id) ? step.id.trim() : '';
    if (!id) id = `S${result.length + 1}`;
    if (reservedIds?.has(id) || seenId.has(id)) {
      let idx = 2;
      while (reservedIds?.has(`${id}_${idx}`) || seenId.has(`${id}_${idx}`)) idx++;
      id = `${id}_${idx}`;
    }

    const toolHints = step.toolHints?.map((s) => s.trim()).filter(Boolean);
    const acceptanceCriteria = step.acceptanceCriteria?.map((s) => s.trim()).filter(Boolean);
    const normalized: AgentPlanStep = {
      ...step,
      id,
      title,
      ...(toolHints?.length ? { toolHints } : {}),
      ...(acceptanceCriteria?.length ? { acceptanceCriteria } : {})
    };

    result.push(normalized);
    seenTitle.add(titleKey);
    seenId.add(id);
    if (result.length >= maxPlanSteps) break;
  }

  return result;
};

const parsePlanStepsFromModelText = (text: string, maxPlanSteps: number): AgentPlanStep[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonStr = extractFirstJsonValue(trimmed) || trimmed;

  const normalizeCriteria = (value: unknown, maxLen: number) => {
    if (isNonEmptyString(value)) return [value.trim()].slice(0, maxLen);
    return normalizeStringArray(value, maxLen);
  };

  const normalizeOne = (value: unknown, index: number): AgentPlanStep | undefined => {
    if (isNonEmptyString(value)) {
      const title = normalizeStepText(value);
      if (!title) return;
      return { id: `S${index + 1}`, title };
    }

    const obj = getRecord(value);
    if (!obj) return;

    const rawTitle =
      (typeof obj.title === 'string' && obj.title) ||
      (typeof obj.step === 'string' && obj.step) ||
      '';
    const title = normalizeStepText(rawTitle);
    if (!title) return;

    const id = isNonEmptyString(obj.id) ? obj.id.trim() : `S${index + 1}`;
    const intent = isNonEmptyString(obj.intent) ? obj.intent.trim() : undefined;
    const toolHints = normalizeStringArray(obj.toolHints ?? obj.tools, 6);
    const expectedOutput = isNonEmptyString(obj.expectedOutput)
      ? obj.expectedOutput.trim()
      : undefined;
    const acceptanceCriteria = normalizeCriteria(obj.acceptanceCriteria, 8);
    const inputs = getRecord(obj.inputs);

    return {
      id,
      title,
      ...(intent ? { intent } : {}),
      ...(toolHints.length ? { toolHints } : {}),
      ...(expectedOutput ? { expectedOutput } : {}),
      ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
      ...(inputs ? { inputs } : {})
    };
  };

  try {
    const parsed = json5.parse(jsonStr) as unknown;

    const rawSteps = (() => {
      if (Array.isArray(parsed)) return parsed;
      const obj = getRecord(parsed);
      if (!obj) return [];
      const steps = obj.steps ?? obj.plan;
      return Array.isArray(steps) ? steps : [];
    })();

    const steps = rawSteps
      .map((item, index) => normalizeOne(item, index))
      .filter((s): s is AgentPlanStep => !!s);

    return normalizePlannerPlanSteps(steps, maxPlanSteps);
  } catch {
    return [];
  }
};

const parsePlanStepsFromUnknown = (params: {
  value: unknown;
  maxPlanSteps: number;
  reservedIds?: Set<string>;
  defaultIdPrefix: string;
}): AgentPlanStep[] => {
  const { value, maxPlanSteps, reservedIds, defaultIdPrefix } = params;
  if (!Array.isArray(value)) return [];

  const normalizeCriteria = (v: unknown, maxLen: number) => {
    if (isNonEmptyString(v)) return [v.trim()].slice(0, maxLen);
    return normalizeStringArray(v, maxLen);
  };

  const steps = value
    .map((item, index) => {
      if (isNonEmptyString(item)) {
        const title = normalizeStepText(item);
        if (!title) return;
        return { id: `${defaultIdPrefix}${index + 1}`, title };
      }
      const obj = getRecord(item);
      if (!obj) return;
      const rawTitle =
        (typeof obj.title === 'string' && obj.title) ||
        (typeof obj.step === 'string' && obj.step) ||
        '';
      const title = normalizeStepText(rawTitle);
      if (!title) return;

      const id = isNonEmptyString(obj.id) ? obj.id.trim() : `${defaultIdPrefix}${index + 1}`;
      const intent = isNonEmptyString(obj.intent) ? obj.intent.trim() : undefined;
      const toolHints = normalizeStringArray(obj.toolHints ?? obj.tools, 6);
      const expectedOutput = isNonEmptyString(obj.expectedOutput)
        ? obj.expectedOutput.trim()
        : undefined;
      const acceptanceCriteria = normalizeCriteria(obj.acceptanceCriteria, 8);
      const inputs = getRecord(obj.inputs);

      const step: AgentPlanStep = {
        id,
        title,
        ...(intent ? { intent } : {}),
        ...(toolHints.length ? { toolHints } : {}),
        ...(expectedOutput ? { expectedOutput } : {}),
        ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
        ...(inputs ? { inputs } : {})
      };
      return step;
    })
    .filter((s): s is AgentPlanStep => !!s);

  return normalizePlannerPlanSteps(steps, maxPlanSteps, reservedIds);
};

// Planner may include "summary/final reply" steps, but these should not be executable sub-tasks
const isReplyLikeStep = (step: string) => {
  const s = normalizeStepText(step).toLowerCase();
  if (!s) return false;
  // Chinese patterns
  const chinesePattern =
    /(回复用户|面向用户|总结以上|汇总以上|整理以上|(?:输出|给出|生成|整理|撰写|形成).*(?:最终)?.*(?:答复|回复|回答|答案|结果|总结|方案|报告|行程|计划)|最终.*(?:答复|回复|回答|答案|结果|总结|输出))/;
  // English patterns
  const englishPattern =
    /(summarize|summarise|summary|conclude|conclusion|final\s*(answer|response|reply)|respond\s*to\s*user|present\s*(findings|results)|compile\s*results)/i;
  return chinesePattern.test(s) || englishPattern.test(s);
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

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const normalizeStringArray = (value: unknown, maxLen: number) => {
  if (!Array.isArray(value)) return [];
  const arr = value
    .filter(isNonEmptyString)
    .map((s) => normalizeStepText(s))
    .filter(Boolean);
  return arr.slice(0, maxLen);
};

const extractToolPreviewText = (assistant: AIChatItemValueItemType[], maxChars = 2400) => {
  const lines: string[] = [];

  for (const item of assistant) {
    if (item.type !== ChatItemValueTypeEnum.tool || !item.tools) continue;
    for (const tool of item.tools) {
      const toolObj = getRecord(tool);
      const toolName =
        (toolObj && typeof toolObj.toolName === 'string' && toolObj.toolName) ||
        (toolObj && typeof toolObj.name === 'string' && toolObj.name) ||
        (toolObj && typeof toolObj.functionName === 'string' && toolObj.functionName) ||
        'tool';
      const response =
        (toolObj && typeof toolObj.response === 'string' && toolObj.response) ||
        (toolObj && typeof toolObj.result === 'string' && toolObj.result) ||
        '';
      const responseText = truncateText(response, 900);
      lines.push(`- ${toolName}：${responseText || '（无返回）'}`);
    }
  }

  const text = lines.join('\n').trim();
  return truncateText(text, maxChars);
};

const buildStepResultSynthesisPrompt = (params: {
  goal: string;
  step: AgentPlanStep;
  toolText: string;
}) => {
  const { goal, step, toolText } = params;
  return `Goal: ${goal}\n\nCurrent step: ${step.title}\n\nExpected output: ${step.expectedOutput || '(Not specified)'}\n\nTool results (excerpt):\n${toolText || '(None)'}\n\nOutput the result of this step (1-4 sentences, concrete facts only, no JSON/code blocks):`;
};

// Task Analyzer: Determine if task is simple (direct answer) or complex (needs planning)
const callTaskAnalyzer = async (params: {
  modelKey: string;
  goal: string;
  toolNodes: RuntimeNodeItemType[];
}): Promise<TaskAnalysisResult> => {
  const { modelKey, goal, toolNodes } = params;
  const model = getLLMModel(modelKey);
  if (!model) return { complexity: 'simple', reason: 'No model available', tokens: 0 };

  const toolsText =
    toolNodes.length === 0
      ? '(No tools available)'
      : toolNodes
          .map((t, i) => `${i + 1}. ${t.name || t.nodeId}: ${t.intro || 'No description'}`)
          .join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `You are a Task Complexity Analyzer. Analyze if a user's goal requires simple or complex planning.

**SIMPLE tasks** (output: "simple"):
- Direct questions with clear, immediate answers
- Single-step operations or lookups
- Questions answerable with general knowledge alone
- Tasks requiring only ONE tool call

**COMPLEX tasks** (output: "complex"):
- Multi-step reasoning or sequential operations
- Multiple tools or data sources needed
- Tasks with dependencies between steps
- Comparative analysis or synthesis required

Output JSON only: {"complexity": "simple"|"complex", "reason": "brief explanation"}`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `## User Goal
${goal}

## Available Tools
${toolsText}

Analyze complexity and output JSON:`
    }
  ];

  const ai = getAIApi({ timeout: 60000 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: 0,
    max_tokens: 150,
    stream: false,
    messages
  };

  try {
    const resp = (await ai.chat.completions.create(
      requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
    )) as unknown as ChatCompletion;

    const content = resp.choices?.[0]?.message?.content || '';
    const assistantMsg: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content
    };
    const tokens =
      resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

    const jsonStr = extractFirstJsonValue(content) || content.trim();
    const parsed = json5.parse(jsonStr) as unknown;

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { complexity?: unknown; reason?: unknown };
      return {
        complexity: obj.complexity === 'complex' ? 'complex' : 'simple',
        reason: typeof obj.reason === 'string' ? obj.reason : '',
        tokens
      };
    }
  } catch {
    // Default to simple on parse failure
  }

  return { complexity: 'simple', reason: 'Analysis failed, defaulting to simple', tokens: 0 };
};

const callStepResultSynthesis = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  step: AgentPlanStep;
  toolText: string;
  stream: boolean;
  workflowStreamResponse?: Props['workflowStreamResponse'];
}): Promise<{ text: string; tokens: number }> => {
  const { modelKey, systemPrompt, goal, step, toolText, stream, workflowStreamResponse } = params;
  const model = getLLMModel(modelKey);
  if (!model) return { text: '', tokens: 0 };

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are a Step Result Synthesizer. Output ONLY the final result of the current step, with concrete facts only. Do NOT output reasoning. Output must be in Simplified Chinese.`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: buildStepResultSynthesisPrompt({ goal, step, toolText })
    }
  ];

  const ai = getAIApi({ timeout: 480000 });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature: 0.2 }),
    max_tokens: computedMaxToken({ model, maxToken: 256 }),
    stream,
    messages
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
  )) as unknown;

  if (!stream) {
    const unStreamResponse = resp as ChatCompletion;
    const text = (unStreamResponse.choices?.[0]?.message?.content || '').trim();
    const assistantMsg: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: text
    };
    const tokens =
      unStreamResponse.usage?.total_tokens ??
      (await countGptMessagesTokens(messages.concat(assistantMsg)));
    return { text, tokens };
  }

  const streamResp = resp as StreamChatType;
  let text = '';

  for await (const part of streamResp) {
    const delta = part.choices?.[0]?.delta?.content || '';
    if (!delta) continue;
    text += delta;
    workflowStreamResponse?.({
      event: SseResponseEventEnum.fastAnswer,
      data: textAdaptGptResponse({
        text: delta,
        reasoning_content: '',
        model: model.model
      })
    });
  }

  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: text
  };
  const tokens = await countGptMessagesTokens(messages.concat(assistantMsg));

  return { text: text.trim(), tokens };
};

type PlannerResult = {
  steps: AgentPlanStep[];
  tokens: number;
  reasoningText?: string;
};

const callPlanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  complexity: 'simple' | 'complex';
  maxPlanSteps: number;
  toolNodes: RuntimeNodeItemType[];
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<PlannerResult> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    complexity,
    maxPlanSteps,
    toolNodes,
    enableReasoning,
    reasoningEffort
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) return { steps: [], tokens: 0 };

  // Build detailed tool descriptions
  const toolsText =
    toolNodes.length === 0
      ? '(No tools available - plan based on general knowledge)'
      : toolNodes
          .map((t, i) => {
            const toolName = t.name || t.nodeId;
            const toolIntro = t.intro || '';
            return `${i + 1}. **${toolName}**${toolIntro ? `: ${toolIntro}` : ''}`;
          })
          .join('\n');

  // Adaptive step limits based on complexity
  const stepRange = complexity === 'simple' ? '1-2' : `2-${maxPlanSteps}`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are an Advanced Task Planner. Your role is to decompose user goals into clear, actionable execution steps.

## Planning Principles

1. **Tool-Aware Planning**: Match each step to available tool capabilities. If a tool can accomplish the step, reference it explicitly.

2. **Dependency Analysis**: Identify which steps depend on outputs from previous steps. Ensure logical ordering.

3. **Adaptive Granularity**:
   - SIMPLE tasks: ${stepRange} steps maximum
   - Each step should be atomic and executable

4. **Actionable Steps**: Each step must:
   - Start with an action verb (搜索, 查询, 计算, 对比, 提取, 分析, etc.)
   - Specify the target data or operation clearly
   - Be self-contained with necessary context

## Anti-patterns to AVOID
- "总结结果" / "回复用户" / "汇总发现" (handled by system)
- Redundant steps that repeat earlier work
- Overly granular steps that should be combined
- Steps without clear actions or outputs

## Language Requirement
**IMPORTANT: All step descriptions MUST be written in Chinese (简体中文).**

## Output Format
Respond with JSON only:
{
  "steps": [
    {
      "id": "S1",
      "title": "步骤标题（可执行动作）",
      "intent": "为什么要做这步（可选）",
      "toolHints": ["建议使用的工具/节点名（可选）"],
      "expectedOutput": "这步期望产出（可选）",
      "acceptanceCriteria": ["验收标准1", "验收标准2（可选）"]
    }
  ]
}`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `## User goal
${goal}

## Task complexity
${complexity.toUpperCase()} - plan with ${stepRange} steps

## Available tools
${toolsText}

Generate an execution plan (JSON only). IMPORTANT: step titles MUST be in Simplified Chinese:`
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

  const structuredSteps = parsePlanStepsFromModelText(content, maxPlanSteps);
  const fallbackSteps = normalizePlannerSteps(
    parseStepsFromModelText(content, maxPlanSteps),
    maxPlanSteps
  ).map((title, index) => ({ id: `S${index + 1}`, title }));

  return {
    steps: structuredSteps.length > 0 ? structuredSteps : fallbackSteps,
    tokens,
    reasoningText: reasoning
  };
};

type ReplanResult =
  | {
      action: 'respond';
      response: string;
      reason: string;
      tokens: number;
      reasoningText?: string;
    }
  | {
      action: 'continue';
      remainingSteps: AgentPlanStep[];
      progress: string;
      changeSummary: string;
      reason: string;
      tokens: number;
      reasoningText?: string;
    };

const callReplanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  originalPlan: AgentPlanStep[];
  remainingSteps: AgentPlanStep[];
  pastSteps: AgentPastStep[];
  maxPlanSteps: number;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<ReplanResult> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    originalPlan,
    remainingSteps,
    pastSteps,
    maxPlanSteps,
    enableReasoning,
    reasoningEffort
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) {
    return {
      action: 'respond',
      response: pastSteps[pastSteps.length - 1]?.result || '',
      reason: '',
      tokens: 0
    };
  }

  // Calculate progress
  const completionRate =
    originalPlan.length > 0
      ? Math.round((pastSteps.length / originalPlan.length) * 100)
      : pastSteps.length > 0
        ? 100
        : 0;

  const pastText =
    pastSteps.length === 0
      ? '(No completed steps)'
      : pastSteps
          .map(
            (p, i) =>
              `✓ Step ${i + 1}: [${p.step.id}] ${p.step.title}\n   Result: ${truncateText(p.result, 500)}`
          )
          .join('\n\n');

  const planText =
    remainingSteps.length === 0
      ? '(All planned steps complete)'
      : remainingSteps
          .map((s, i) => {
            const meta: string[] = [];
            if (s.expectedOutput) meta.push(`Expected: ${truncateText(s.expectedOutput, 80)}`);
            if (s.acceptanceCriteria?.length) {
              meta.push(`AC: ${truncateText(s.acceptanceCriteria.join('；'), 120)}`);
            }
            return `○ ${i + 1}. [${s.id}] ${s.title}${meta.length ? `\n   ${meta.join(' | ')}` : ''}`;
          })
          .join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are the Progress Evaluator and Replanner of a Plan-and-Execute agent. After each step, decide whether to RESPOND to the user now or CONTINUE execution.

## Decision Framework

### Choose "respond" when:
- The user's question has been FULLY answered
- Sufficient information has been gathered for a complete response
- All critical steps are complete AND goal is achieved
- Continuing would provide diminishing returns

### Choose "continue" when:
- Critical information is still missing
- More steps are needed to achieve the goal
- Current results are incomplete or insufficient
- Plan needs adjustment based on new findings

## Remaining Plan Update Rules (when continuing)
- 允许对“剩余步骤”做最小必要修改：重排 / 删除 / 替换 / 新增
- 禁止把已完成步骤加回（必须确保 remainingSteps 仅包含未完成步骤）
- 必须遵守步数上限：已完成步数 + remainingSteps.length <= maxPlanSteps
- 必须输出 changeSummary（变化摘要）与 reason（理由），便于审计与前端展示

## Output Format (JSON only)

**To respond to user:**
{"action": "respond", "response": "Your complete, user-facing answer...", "reason": "why can respond now"}

**To continue execution:**
{
  "action": "continue",
  "remainingSteps": [
    {
      "id": "S3",
      "title": "下一步要做什么（可执行动作）",
      "intent": "可选",
      "toolHints": ["可选"],
      "expectedOutput": "可选",
      "acceptanceCriteria": ["可选"]
    }
  ],
  "progress": "X% complete, need Y",
  "changeSummary": "简述你做了哪些修改",
  "reason": "为什么需要继续/为什么要这样修改"
}

## Critical Rules
- "response" must be a direct, user-facing answer in Simplified Chinese (NOT JSON, NOT code blocks unless requested)
- "remainingSteps" should only contain REMAINING steps, never completed ones
- If "remainingSteps" is empty but action is "continue", keep the original remaining plan
- Evaluate "can we answer the user NOW?" not "have we completed all steps?"`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `## User Goal
${goal}

## Execution Progress (${completionRate}% of plan complete)

### Completed Steps
${pastText}

### Remaining Steps
${planText}

## Constraints
- maxPlanSteps: ${maxPlanSteps}
- completedSteps: ${pastSteps.length}
- remainingSteps: ${remainingSteps.length}

## Decision Required
Based on the completed steps, can you provide a satisfactory answer to the user?
Or is more execution needed?

Output your decision (JSON only):`
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
        remainingSteps?: unknown;
        steps?: unknown;
        plan?: unknown;
        progress?: unknown;
        changeSummary?: unknown;
        reason?: unknown;
      };
      const action = typeof obj.action === 'string' ? obj.action : '';

      if (action === 'respond' && typeof obj.response === 'string') {
        return {
          action: 'respond',
          response: obj.response.trim(),
          reason: typeof obj.reason === 'string' ? obj.reason.trim() : '',
          tokens,
          reasoningText: reasoning
        };
      }

      if (action === 'continue') {
        const reservedIds = new Set(pastSteps.map((p) => p.step.id));
        const steps = parsePlanStepsFromUnknown({
          value: obj.remainingSteps ?? obj.steps ?? obj.plan,
          maxPlanSteps,
          reservedIds,
          defaultIdPrefix: 'R'
        });
        const progress =
          typeof obj.progress === 'string' ? obj.progress : `${completionRate}% complete`;
        const changeSummary = typeof obj.changeSummary === 'string' ? obj.changeSummary.trim() : '';
        const reason = typeof obj.reason === 'string' ? obj.reason.trim() : '';
        return {
          action: 'continue',
          remainingSteps: steps,
          progress,
          changeSummary,
          reason,
          tokens,
          reasoningText: reasoning
        };
      }
    }
  } catch {}

  // Parse failure: default to continue with current plan
  return {
    action: 'continue',
    remainingSteps: [],
    progress: `${completionRate}% complete`,
    changeSummary: '模型输出解析失败，保持原剩余计划不变',
    reason: '模型输出无法解析为 JSON',
    tokens,
    reasoningText: reasoning
  };
};

type CriticResult = {
  score: number; // 0-10 score for execution quality
  issues: string[]; // List of identified issues
  suggestion: string; // Improvement suggestion
  tokens: number;
};

// Critic: Critical evaluation of step execution quality
const callCritic = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  step: AgentPlanStep;
  result: string;
  toolText: string;
}): Promise<CriticResult> => {
  const { modelKey, systemPrompt, goal, step, result, toolText } = params;

  const model = getLLMModel(modelKey);
  if (!model) return { score: 5, issues: [], suggestion: '', tokens: 0 };

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are a Critical Evaluator (Critic). Your role is to assess the quality of task execution.

## Evaluation Criteria

1. **Completeness**: Did it accomplish everything the step required?
2. **Accuracy**: Is the information accurate and reliable? Any obvious errors?
3. **Relevance**: Is the result relevant to the user's goal and current step?
4. **Usefulness**: Does it contain enough detail to support subsequent decisions?

## Output Format (JSON only)
{
  "score": 0-10,
  "issues": ["Issue 1", "Issue 2"],
  "suggestion": "Improvement suggestion"
}

## Scoring Guide
- 9-10: Excellent execution, complete and accurate, no issues
- 7-8: Good execution, minor flaws but doesn't affect overall quality
- 5-6: Basic completion, but has notable gaps or missing information
- 3-4: Poor execution, low quality results or off-target
- 0-2: Failed execution, no valid results or serious errors`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `## User Goal
${goal}

## Current Step
${step.title}

## Expected Output
${step.expectedOutput || '(Not specified)'}

## Acceptance Criteria
${step.acceptanceCriteria?.length ? step.acceptanceCriteria.map((s) => `- ${s}`).join('\n') : '(Not specified)'}

## Execution Result
${truncateText(result, 800)}

## Tool Usage
${toolText || '(No tools used)'}

## Task
Evaluate the quality of this step's execution. Output JSON only:`
    }
  ];

  try {
    const ai = getAIApi({ timeout: 480000 });
    const requestBody: Record<string, unknown> = {
      ...model.defaultConfig,
      model: model.model,
      temperature: computedTemperature({ model, temperature: 0.1 }),
      max_tokens: computedMaxToken({ model, maxToken: 400 }),
      stream: false,
      messages
    };

    const resp = (await ai.chat.completions.create(
      requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0]
    )) as unknown as ChatCompletion;

    const content = resp.choices?.[0]?.message?.content || '';
    const assistantMsg: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content
    };
    const tokens =
      resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

    const jsonStr = extractFirstJsonValue(content) || content.trim();
    const parsed = json5.parse(jsonStr) as unknown;

    if (parsed && typeof parsed === 'object') {
      const obj = parsed as {
        score?: unknown;
        issues?: unknown;
        suggestion?: unknown;
      };

      const score =
        typeof obj.score === 'number'
          ? Math.max(0, Math.min(10, obj.score))
          : typeof obj.score === 'string'
            ? Math.max(0, Math.min(10, parseFloat(obj.score) || 5))
            : 5;

      const issues = Array.isArray(obj.issues)
        ? obj.issues.filter((i): i is string => typeof i === 'string')
        : [];

      const suggestion = typeof obj.suggestion === 'string' ? obj.suggestion.trim() : '';

      return { score, issues, suggestion, tokens };
    }
  } catch {
    // If evaluation fails, return default medium score
    return { score: 5, issues: [], suggestion: '', tokens: 0 };
  }

  return { score: 5, issues: [], suggestion: '', tokens: 0 };
};

const buildExecutorPrompt = (params: {
  goal: string;
  step: AgentPlanStep;
  stepNumber: number;
  totalSteps: number;
  remainingPlan: AgentPlanStep[];
  pastSteps: AgentPastStep[];
  retry?: {
    attempt: number;
    lastCritic?: CriticResult;
  };
}) => {
  const { goal, step, stepNumber, totalSteps, remainingPlan, pastSteps, retry } = params;

  const remainingText =
    remainingPlan.length === 0
      ? '（这是最后一步）'
      : remainingPlan.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const pastForPrompt = pastSteps.slice(-4);
  const pastText =
    pastForPrompt.length === 0
      ? '（无）'
      : pastForPrompt
          .map(
            (p, i) =>
              `✓ 步骤 ${i + 1}: ${p.step.title}\n   结果: ${truncateText(p.result || '', 800) || '（无结果）'}`
          )
          .join('\n\n');

  return `You are the EXECUTOR in a Plan-and-Execute agent. Complete the CURRENT step efficiently and accurately.

## Core Rules

1) Tool-first (no hallucination)
- Prefer using available tools to obtain accurate data.
- Do NOT guess or fabricate data that tools can provide.
- If unsure, verify via tools first.
- If a tool returns empty/error: retry with adjusted parameters → try an alternative tool → if still blocked, report the concrete reason and the best fallback approach.

2) Focus on the current step
- Only execute the current step. Do not pre-complete future steps.
- You may use results from completed steps; avoid repeating work.

3) Self-check
- Validate tool outputs before using them.
- Cross-check when multiple sources exist.

4) Output requirements (user-visible)
- Output MUST be in Simplified Chinese.
- Output ONLY the final result of THIS step (no chain-of-thought).
- Be specific: include key numbers/facts/findings.
- If blocked, state the exact blocker and what you tried.

## Context

User goal: ${goal}
Progress: Step ${stepNumber} / ${totalSteps}${retry?.attempt && retry.attempt > 1 ? ` (retry #${retry.attempt})` : ''}

Completed steps (recent):
${pastText}

Remaining steps:
${remainingText}

## Current step metadata
Title: ${step.title}
${step.intent ? `\nIntent: ${step.intent}` : ''}
${step.toolHints?.length ? `\nTool hints: ${step.toolHints.join(', ')}` : ''}
${step.expectedOutput ? `\nExpected output: ${step.expectedOutput}` : ''}
${step.acceptanceCriteria?.length ? `\nAcceptance criteria:\n- ${step.acceptanceCriteria.join('\n- ')}` : ''}

${
  retry?.lastCritic
    ? `\n## Last attempt review (Critic)\n- Score: ${retry.lastCritic.score}/10\n${
        retry.lastCritic.issues?.length
          ? `- Issues: ${retry.lastCritic.issues
              .map((s) => s.trim())
              .filter(Boolean)
              .join('；')}`
          : ''
      }\n${retry.lastCritic.suggestion ? `- Suggestion: ${retry.lastCritic.suggestion}` : ''}\n\nAdjust your execution strictly based on the issues/suggestion above.`
    : ''
}

## Execute now
Execute the current step and output the step result in Simplified Chinese:`;
};

const renderTodoMarkdown = (params: { allSteps: AgentPlanStep[]; pastSteps: AgentPastStep[] }) => {
  const { allSteps, pastSteps } = params;
  const doneIds = new Set(pastSteps.map((p) => p.step.id));

  const lines: string[] = [];
  allSteps.forEach((s) => {
    const title = normalizeStepText(s.title);
    if (!title) return;
    if (doneIds.has(s.id)) lines.push(`- ☑ ~~${title}~~`);
    else lines.push(`- ☐ ${title}`);
  });

  return `${lines.filter(Boolean).join('\n')}\n`;
};

const pickToolItems = (items: AIChatItemValueItemType[]) =>
  items.filter((i) => i.type === ChatItemValueTypeEnum.tool);

// 智能判断是否需要调用 Critic（减少不必要的 LLM 调用）
const shouldCallCritic = (stepAnswer: string, isLastStep: boolean, hasToolCalls: boolean) => {
  // 最后一步必须评估
  if (isLastStep) return true;
  // 结果为空或太短
  if (!stepAnswer || stepAnswer.trim().length < 30) return true;
  // 包含错误/失败关键词
  if (/error|fail|exception|无法|失败|抱歉|出错|不能|找不到/i.test(stepAnswer)) return true;
  // 有工具调用但结果很短（可能工具失败）
  if (hasToolCalls && stepAnswer.trim().length < 100) return true;
  return false;
};

// 简单问题快速判断（跳过 Task Analyzer）
const isObviouslySimple = (input: string, toolCount: number) => {
  const trimmed = input.trim();
  // 没有工具可用，直接走简单路径
  if (toolCount === 0) return true;
  // 很短的问候语或简单问题
  if (trimmed.length < 15 && /^(你好|hi|hello|谢谢|thanks|帮我|请问|什么是)/i.test(trimmed)) {
    return true;
  }
  // 单一明确的查询（无复杂连接词）
  if (trimmed.length < 30 && !/[，,、；;]|(并且|而且|同时|另外|还要|以及|和.*和)/.test(trimmed)) {
    return true;
  }
  return false;
};

// 判断步骤执行是否明显失败
const isStepFailed = (stepAnswer: string) => {
  if (!stepAnswer || stepAnswer.trim().length < 10) return true;
  // 严重错误关键词
  const severeErrorPattern = /^(抱歉|sorry|无法完成|执行失败|出现错误|error occurred)/i;
  if (severeErrorPattern.test(stepAnswer.trim())) return true;
  return false;
};

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

  const traceId = randomUUID();
  const replanHistory: NonNullable<RawResponse['replanHistory']> = [];

  let totalTokens = 0;
  let totalRunTimes = 0;
  let reasoningText = '';

  // 快速路径：明显简单的问题跳过 Task Analyzer
  const obviouslySimple = isObviouslySimple(userChatInput, toolNodes.length);

  // Step 1: Analyze task complexity (如果不是明显简单的问题)
  let complexity: 'simple' | 'complex' = 'simple';
  if (!obviouslySimple) {
    const analysis = await callTaskAnalyzer({
      modelKey,
      goal: userChatInput,
      toolNodes
    });
    totalTokens += analysis.tokens;
    totalRunTimes += 1;
    complexity = analysis.complexity;
  }

  // For SIMPLE tasks, directly execute without full plan-execute loop
  if (complexity === 'simple') {
    const simpleResult = await dispatchRunTools({
      ...props,
      params: {
        model: modelKey,
        temperature: props.params.temperature,
        maxToken: props.params.maxToken,
        aiChatVision: props.params.aiChatVision,
        aiChatReasoning: props.params.aiChatReasoning,
        aiChatReasoningEffort: props.params.aiChatReasoningEffort,
        history,
        systemPrompt: systemPrompt || '',
        userChatInput
      },
      histories
    });

    const simpleAnswer = (simpleResult[NodeOutputKeyEnum.answerText] || '').trim();
    const simpleReasoning = simpleResult[NodeOutputKeyEnum.reasoningText] || '';
    const simpleNodeResponse = simpleResult[DispatchNodeResponseKeyEnum.nodeResponse];
    const simpleUsages = simpleResult[DispatchNodeResponseKeyEnum.nodeDispatchUsages] || [];

    totalTokens += simpleNodeResponse?.toolCallTokens || 0;
    totalRunTimes += simpleResult[DispatchNodeResponseKeyEnum.runTimes] || 1;

    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelKey,
      tokens: totalTokens,
      modelType: ModelTypeEnum.llm
    });

    const simpleAssistant = simpleResult[DispatchNodeResponseKeyEnum.assistantResponses] || [];
    const previewToolItems = filterToolResponseToPreview(pickToolItems(simpleAssistant));

    const finalAssistantResponses: AIChatItemValueItemType[] = [
      ...(simpleReasoning
        ? [
            {
              type: ChatItemValueTypeEnum.reasoning as AIChatItemValueItemType['type'],
              reasoning: { content: simpleReasoning }
            }
          ]
        : []),
      ...previewToolItems,
      {
        type: ChatItemValueTypeEnum.text as AIChatItemValueItemType['type'],
        text: { content: simpleAnswer }
      }
    ];

    return {
      [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
      [NodeOutputKeyEnum.answerText]: simpleAnswer,
      [NodeOutputKeyEnum.reasoningText]: simpleReasoning,
      [NodeOutputKeyEnum.rawResponse]: {
        traceId,
        plan: [],
        pastSteps: [{ step: userChatInput, result: simpleAnswer }],
        finalDecision: 'response',
        planSteps: [],
        replanHistory: [],
        usage: {
          totalTokens,
          totalRunTimes
        }
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: finalAssistantResponses,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        toolCallTokens: totalTokens,
        model: modelName,
        query: userChatInput,
        toolDetail: simpleNodeResponse?.toolDetail || []
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: name,
          totalPoints,
          model: modelName,
          tokens: totalTokens
        },
        ...simpleUsages.slice(1)
      ]
    };
  }

  // Step 2: For COMPLEX tasks, use full plan-execute loop
  const adaptiveMaxSteps = maxPlanSteps;

  const planner = await callPlanner({
    modelKey,
    systemPrompt,
    goal: userChatInput,
    complexity,
    maxPlanSteps: adaptiveMaxSteps,
    toolNodes,
    enableReasoning,
    reasoningEffort
  });

  totalTokens += planner.tokens;
  totalRunTimes += 1;
  reasoningText = (planner.reasoningText || '').trim();

  const initialPlan =
    planner.steps.length > 0
      ? planner.steps
      : [
          {
            id: 'S1',
            title: normalizeStepText(userChatInput) || userChatInput.trim()
          }
        ];

  let todoAllSteps = normalizePlannerPlanSteps(initialPlan, adaptiveMaxSteps);
  if (todoAllSteps.length === 0) {
    todoAllSteps = [
      {
        id: 'S1',
        title: normalizeStepText(userChatInput) || userChatInput.trim()
      }
    ];
  }

  const originalPlan = [...todoAllSteps]; // Keep original plan for progress tracking
  let planQueue = [...todoAllSteps];
  const pastSteps: AgentPastStep[] = [];

  let todoContent = '';
  const getRemainingTodoSteps = () => {
    const doneSet = new Set(pastSteps.map((p) => p.step.id));
    return todoAllSteps.filter((s) => !doneSet.has(s.id));
  };
  const getDoneCount = () => pastSteps.length;

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

  // 容错机制：步骤重试计数器（每个步骤最多重试1次）
  const MAX_STEP_RETRY = 1;
  const stepRetryCount = new Map<string, number>();
  const lastCriticByStepId = new Map<string, CriticResult>();

  // execute + replan
  for (let loop = 0; loop < maxLoops; loop++) {
    const step = planQueue.shift();
    if (!step) break;

    if (stream) {
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: `${TASK_PREFIX}${normalizeStepText(step.title)}\n\n`,
          reasoning_content: '',
          model: model.model
        })
      });
    }

    const attempt = 1 + (stepRetryCount.get(step.id) || 0);
    const stepPrompt = buildExecutorPrompt({
      goal: userChatInput,
      step,
      stepNumber: pastSteps.length + 1,
      totalSteps: todoAllSteps.length,
      remainingPlan: planQueue,
      pastSteps,
      ...(attempt > 1
        ? {
            retry: {
              attempt,
              lastCritic: lastCriticByStepId.get(step.id)
            }
          }
        : {})
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
        // 子任务共享对话历史（由卡片“历史记录”控制），增强连续性与工具调用智能
        history,
        systemPrompt: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are a Plan-and-Execute agent. You plan first, then execute step by step. Only solve the CURRENT step. All user-visible outputs must be in Simplified Chinese.`,
        userChatInput: stepPrompt
      },
      histories
    });

    let stepAnswer = (stepResult[NodeOutputKeyEnum.answerText] || '').trim();
    const stepReasoning = stepResult[NodeOutputKeyEnum.reasoningText];
    if (stepReasoning) {
      reasoningText = reasoningText ? `${reasoningText}\n${stepReasoning}` : stepReasoning;
    }

    const stepAssistant = stepResult[DispatchNodeResponseKeyEnum.assistantResponses] || [];
    const stepToolItems = pickToolItems(stepAssistant);
    toolItems = toolItems.concat(stepToolItems);

    const stepNodeResponse = stepResult[DispatchNodeResponseKeyEnum.nodeResponse];
    if (stepNodeResponse && Array.isArray(stepNodeResponse.toolDetail)) {
      toolDetail = toolDetail.concat(stepNodeResponse.toolDetail);
    }

    const stepUsages = stepResult[DispatchNodeResponseKeyEnum.nodeDispatchUsages] || [];
    nodeUsages = nodeUsages.concat(stepUsages.slice(1));

    totalRunTimes += stepResult[DispatchNodeResponseKeyEnum.runTimes] || 1;
    totalTokens += stepNodeResponse?.toolCallTokens || 0;

    // Extract tool preview text for synthesis and critic evaluation
    const toolText = extractToolPreviewText(stepAssistant);

    // 防御：部分推理模型可能只输出 reasoning_content 导致 answerText 为空，这里基于工具结果补一段"本步骤最终结果"
    if (!stepAnswer) {
      if (toolText) {
        const synthesized = await callStepResultSynthesis({
          modelKey,
          systemPrompt,
          goal: userChatInput,
          step,
          toolText,
          stream: !!stream,
          workflowStreamResponse
        });
        stepAnswer = synthesized.text || '';
        totalTokens += synthesized.tokens;
        totalRunTimes += 1;
      }
      if (!stepAnswer) {
        stepAnswer = '（本步骤未生成可展示的文本结果）';
        if (stream) {
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: stepAnswer,
              reasoning_content: '',
              model: model.model
            })
          });
        }
      }
    }

    pastSteps.push({ step, result: stepAnswer, toolText });

    // 智能 Critic：只在必要时调用（减少 LLM 调用）
    const isLastStep = planQueue.length === 0;
    const hasToolCalls = stepToolItems.length > 0;
    let stepFailed = isStepFailed(stepAnswer);

    if (shouldCallCritic(stepAnswer, isLastStep, hasToolCalls)) {
      const criticResult = await callCritic({
        modelKey,
        systemPrompt,
        goal: userChatInput,
        step,
        result: stepAnswer,
        toolText
      });
      totalTokens += criticResult.tokens;
      totalRunTimes += 1;
      lastCriticByStepId.set(step.id, criticResult);
      pastSteps[pastSteps.length - 1].critic = {
        score: criticResult.score,
        issues: criticResult.issues,
        suggestion: criticResult.suggestion
      };

      // Critic 评分低于 4 分视为步骤失败
      if (criticResult.score < 4) {
        stepFailed = true;
      }
    }

    // 容错机制：步骤失败时尝试重试（每个步骤最多重试 MAX_STEP_RETRY 次）
    if (stepFailed) {
      const currentRetry = stepRetryCount.get(step.id) || 0;

      if (currentRetry < MAX_STEP_RETRY) {
        // 还有重试机会：移除失败记录，放回队列头部重试
        stepRetryCount.set(step.id, currentRetry + 1);
        pastSteps.pop(); // 移除刚才的失败记录
        planQueue.unshift(step); // 放回队列头部

        if (stream) {
          const lastCritic = lastCriticByStepId.get(step.id);
          workflowStreamResponse?.({
            event: SseResponseEventEnum.fastAnswer,
            data: textAdaptGptResponse({
              text: `\n> 步骤执行质量不佳，正在重试...\n${lastCritic?.suggestion ? `> 建议：${lastCritic.suggestion}\n` : ''}\n`,
              reasoning_content: '',
              model: model.model
            })
          });
        }

        // 直接进入下一次循环重试，跳过 replanner
        continue;
      }
      // 重试次数用尽，继续正常流程（让 replanner 决定如何处理）
    }

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
      originalPlan,
      remainingSteps: planQueue,
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

    // 智能强制继续逻辑（优化：不再一刀切）
    const remainingTodo = getRemainingTodoSteps();
    if (decision.action === 'respond' && remainingTodo.length > 0) {
      const completionRate = todoAllSteps.length > 0 ? pastSteps.length / todoAllSteps.length : 1;
      const responseLength = (decision.response || '').trim().length;
      const canEarlyRespond = completionRate >= 0.4 || responseLength >= 160;

      if (!canEarlyRespond) {
        decision = {
          action: 'continue',
          remainingSteps: remainingTodo,
          progress: `${Math.round(completionRate * 100)}% complete`,
          changeSummary: '阻止过早结束：继续完成剩余关键步骤',
          reason: '当前完成度与回复信息量不足',
          tokens: decision.tokens,
          reasoningText: decision.reasoningText
        };
      }
    }

    if (decision.action === 'respond') {
      // 结束前补一次最终 todo 快照（确保最后一项被勾选）
      pushTodoSnapshot();

      const finalAnswer = decision.response || pastSteps[pastSteps.length - 1]?.result || '';

      if (stream) {
        workflowStreamResponse?.({
          event: SseResponseEventEnum.fastAnswer,
          data: textAdaptGptResponse({
            text: finalAnswer,
            reasoning_content: reasoningText,
            model: model.model
          })
        });
      }

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
          traceId,
          plan: planQueue.map((s) => s.title),
          pastSteps: pastSteps.map((p) => ({ step: p.step.title, result: p.result })),
          finalDecision: 'response',
          planSteps: todoAllSteps,
          replanHistory,
          usage: {
            totalTokens,
            totalRunTimes
          }
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

    if (decision.action === 'continue') {
      const beforeRemaining = planQueue.map((s) => s.title);
      const availableRemainingSlots = Math.max(0, maxPlanSteps - pastSteps.length);
      const suggested = decision.remainingSteps.length > 0 ? decision.remainingSteps : planQueue;
      const doneTitleSet = new Set(
        pastSteps.map((p) => normalizeStepText(p.step.title)).filter(Boolean)
      );
      const filteredSuggested = suggested.filter(
        (s) => !doneTitleSet.has(normalizeStepText(s.title))
      );

      const nextQueueSource = filteredSuggested.length > 0 ? filteredSuggested : planQueue;
      planQueue = nextQueueSource.slice(0, availableRemainingSlots);
      todoAllSteps = [...pastSteps.map((p) => p.step), ...planQueue];

      const afterRemaining = planQueue.map((s) => s.title);
      replanHistory.push({
        loop,
        changeSummary: decision.changeSummary || '无变化',
        reason: decision.reason || '',
        beforeRemaining,
        afterRemaining
      });
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
    (planQueue.length > 0 ? `未完成全部步骤，当前停在：${planQueue[0].title}` : '未生成有效结果');

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
      traceId,
      plan: planQueue.map((s) => s.title),
      pastSteps: pastSteps.map((p) => ({ step: p.step.title, result: p.result })),
      finalDecision: 'fallback',
      planSteps: todoAllSteps,
      replanHistory,
      usage: {
        totalTokens,
        totalRunTimes
      }
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
