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

// Task Analyzer result type
type TaskAnalysisResult = {
  complexity: 'simple' | 'complex';
  reason: string;
  tokens: number;
};

// Task type for Summarizer adaptation
type TaskType = 'code' | 'research' | 'data' | 'general';

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
const SUMMARY_START_HINT = '\n\n> 总结\n';

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

// Infer task type from goal for Summarizer adaptation
const inferTaskType = (goal: string): TaskType => {
  const lowerGoal = goal.toLowerCase();

  // Code/Engineering patterns
  if (
    /code|implement|fix|bug|develop|api|function|class|module|build|deploy|代码|编程|实现|开发|功能|接口/.test(
      lowerGoal
    )
  ) {
    return 'code';
  }

  // Research patterns
  if (
    /research|investigate|explore|study|compare|review|analyze\s+.*\s+(?:options|approaches)|研究|调查|了解|查找|搜索/.test(
      lowerGoal
    )
  ) {
    return 'research';
  }

  // Data patterns
  if (
    /data|statistics|numbers|calculate|trend|metric|analytics|report|chart|数据|分析|统计|查询|计算/.test(
      lowerGoal
    )
  ) {
    return 'data';
  }

  return 'general';
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
  step: string;
  toolText: string;
}) => {
  const { goal, step, toolText } = params;
  return `Goal: ${goal}\n\nCurrent step: ${step}\n\nTool results (excerpt):\n${toolText || '(None)'}\n\nOutput the result of this step (1-4 sentences, concrete facts only, no JSON/code blocks):`;
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
  step: string;
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
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个结果整理器。只输出“本步骤的最终结果”，不要输出思考过程。`
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

const buildSummarizerUserPrompt = (params: {
  goal: string;
  taskType: TaskType;
  baseResponse: string;
  pastSteps: { step: string; result: string }[];
}) => {
  const { goal, taskType, baseResponse, pastSteps } = params;

  const pastText =
    pastSteps.length === 0
      ? '(No execution steps)'
      : pastSteps
          .map((p, i) => {
            const truncatedResult = truncateText(p.result, 800);
            return `**Step ${i + 1}**: ${normalizeStepText(p.step)}\n${truncatedResult || '(No result)'}`;
          })
          .join('\n\n');

  const formatGuidance: Record<TaskType, string> = {
    code: `**Code/Engineering Task Guidelines**:
- What changed: files/modules modified, core changes
- Technical approach: stack, patterns, key implementation details
- Verification: how to test/run, expected behavior
- Caveats: deployment requirements, risks, future improvements`,

    research: `**Research/Investigation Task Guidelines**:
- Key findings: important facts and discoveries
- Source reliability: authority and credibility of sources
- Multiple perspectives: compare different viewpoints
- Recommendations: actionable suggestions based on research`,

    data: `**Data Analysis Task Guidelines**:
- Core insights: key numbers, trends, anomalies
- Analysis conclusions: what the data tells us
- Data quality: reliability and timeliness notes
- Limitations: scope, data constraints, uncertainties`,

    general: `**General Task Guidelines**:
- Core answer: direct response to user's question
- Key evidence: main supporting facts and reasoning
- Additional context: relevant background or suggestions
- Limitations: note any information gaps`
  };

  return `You are a Response Synthesizer. Transform execution results into a polished, user-facing response.

## User's Original Question
${goal}

## Task Type
${taskType.toUpperCase()}

${formatGuidance[taskType]}

## Execution Details
${pastText}

## Preliminary Response
${truncateText(baseResponse, 1200)}

## Synthesis Requirements

1. **User-Centric**: Write for the user, not as an execution report
2. **Information Hierarchy**: Lead with core answer, follow with supporting details
3. **No Repetition**: Don't restate the question or echo step-by-step narrative
4. **Appropriate Length**: 200-500 words (adjust based on complexity)

## Prohibited
- JSON output or code blocks (unless user specifically requested code)
- To-do lists or execution plans
- Using H1 markdown headers (#)
- Repeating the preliminary response verbatim

Synthesize a professional response:`;
};

const callSummarizer = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  taskType: TaskType;
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
    taskType,
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
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are a Response Synthesizer for a Plan-and-Execute agent. Your role is to transform execution results into a polished, user-facing response.

## Core Capabilities
1. **Information Distillation**: Extract core value from execution details
2. **Logical Restructuring**: Reorganize information to match user's mental model
3. **Adaptive Expression**: Adjust style and focus based on task type
4. **Objective Accuracy**: Don't add unverified information, acknowledge limitations

## Synthesis Principles
- **User Perspective**: Provide decision support from user's viewpoint
- **Value First**: Highlight the most valuable information and recommendations
- **Professional Brevity**: Avoid redundancy and jargon
- **Honest Transparency**: Clearly state when information is incomplete`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: buildSummarizerUserPrompt({ goal, taskType, baseResponse, pastSteps })
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
  const stepRange = complexity === 'simple' ? '1-2' : `2-${Math.min(maxPlanSteps, 6)}`;

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
Respond with JSON only: {"steps": ["步骤1描述", "步骤2描述", ...]}`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `## 用户目标
${goal}

## 任务复杂度
${complexity.toUpperCase()} - 相应规划 (${stepRange} 步)

## 可用工具
${toolsText}

生成执行计划 (仅输出JSON，步骤描述必须使用中文):`
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

// Simplified Replanner: only 2 decisions (respond or continue)
type ReplanResult =
  | { action: 'respond'; response: string; tokens: number; reasoningText?: string }
  | {
      action: 'continue';
      steps: string[];
      progress: string;
      tokens: number;
      reasoningText?: string;
    };

const callReplanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  originalPlan: string[];
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
    originalPlan,
    currentPlan,
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
          .map((p, i) => `✓ Step ${i + 1}: ${p.step}\n   Result: ${truncateText(p.result, 500)}`)
          .join('\n\n');

  const planText =
    currentPlan.length === 0
      ? '(All planned steps complete)'
      : currentPlan.map((s, i) => `○ ${i + 1}. ${s}`).join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `${systemPrompt ? `${systemPrompt}\n\n` : ''}You are a Progress Evaluator for a Plan-and-Execute agent. After each step, decide whether to RESPOND to the user or CONTINUE execution.

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

## Output Format (JSON only)

**To respond to user:**
{"action": "respond", "response": "Your complete, user-facing answer..."}

**To continue execution:**
{"action": "continue", "steps": ["Remaining or adjusted steps..."], "progress": "X% complete, need Y"}

## Critical Rules
- "response" must be a direct, user-facing answer (NOT JSON, NOT code blocks unless requested)
- "steps" should only contain REMAINING steps, never completed ones
- If "steps" array is empty but action is "continue", use the original remaining plan
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
        steps?: unknown;
        plan?: unknown;
        progress?: unknown;
      };
      const action = typeof obj.action === 'string' ? obj.action : '';

      if (action === 'respond' && typeof obj.response === 'string') {
        return {
          action: 'respond',
          response: obj.response.trim(),
          tokens,
          reasoningText: reasoning
        };
      }

      if (action === 'continue') {
        const steps = normalizeSteps(obj.steps ?? obj.plan, maxPlanSteps);
        const progress =
          typeof obj.progress === 'string' ? obj.progress : `${completionRate}% complete`;
        return { action: 'continue', steps, progress, tokens, reasoningText: reasoning };
      }
    }
  } catch {}

  // Parse failure: default to continue with current plan
  return {
    action: 'continue',
    steps: [],
    progress: `${completionRate}% complete`,
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
  step: string;
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
${step}

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
  step: string;
  stepNumber: number;
  totalSteps: number;
  remainingPlan: string[];
  pastSteps: { step: string; result: string }[];
}) => {
  const { goal, step, stepNumber, totalSteps, remainingPlan, pastSteps } = params;

  const remainingText =
    remainingPlan.length === 0
      ? '(This is the final step)'
      : remainingPlan.map((s, i) => `${i + 1}. ${s}`).join('\n');

  const pastForPrompt = pastSteps.slice(-4);
  const pastText =
    pastForPrompt.length === 0
      ? '(None)'
      : pastForPrompt
          .map(
            (p, i) =>
              `✓ Step ${i + 1}: ${p.step}\n   Result: ${truncateText(p.result || '', 800) || '(No result)'}`
          )
          .join('\n\n');

  return `You are a Task Executor within a Plan-and-Execute agent. Complete the current step efficiently and accurately.

## Execution Rules

1. **Tool-First Approach**:
   - ALWAYS use available tools when they can provide accurate information
   - NEVER guess or fabricate data that tools could retrieve
   - If unsure, use tools to verify before responding

2. **Step Focus**:
   - Complete ONLY the current step, not future steps
   - Use context from past steps, but don't repeat their work
   - Stay within the scope of this step's objective

3. **Self-Verification**:
   - Validate tool outputs before accepting them
   - If tool returns empty/error, report clearly
   - Cross-check data when multiple sources available

4. **Clear Reporting**:
   - State what was accomplished with specific data
   - Include key numbers, facts, or findings
   - Keep response focused (under 300 words unless complex data)
   - Report failures honestly with specifics

## Context

**Overall Goal**: ${goal}

**Progress**: Step ${stepNumber} of ${totalSteps}

**Completed Steps**:
${pastText}

**Remaining Steps**:
${remainingText}

## Current Step (EXECUTE THIS)
${step}

## Output Requirements
- Provide concrete results, not just "completed" or "done"
- Include relevant data points and facts discovered
- If blocked, explain exactly what went wrong

Execute the current step now:`;
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

const applyReplannerPlanUpdate = (params: {
  suggestedSteps: string[];
  maxPlanSteps: number;
  pastSteps: { step: string }[];
  todoAllSteps: string[];
}) => {
  const { suggestedSteps, maxPlanSteps, pastSteps } = params;
  const todoAllSteps = params.todoAllSteps.map(normalizeStepText).filter(Boolean);

  const doneSet = new Set(pastSteps.map((p) => normalizeStepText(p.step)).filter(Boolean));
  const todoSet = new Set(todoAllSteps.map(normalizeStepText));

  const candidates = uniqueOrderedSteps(suggestedSteps)
    .map(normalizeStepText)
    .filter(Boolean)
    .filter((s) => !doneSet.has(s))
    .filter((s) => !todoSet.has(s))
    .filter((s) => !isReplyLikeStep(s));

  for (const s of candidates) {
    if (todoAllSteps.length >= maxPlanSteps) break;
    todoAllSteps.push(s);
    todoSet.add(s);
  }

  return todoAllSteps;
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

  // Infer task type for Summarizer
  const taskType = inferTaskType(userChatInput);

  // Step 1: Analyze task complexity
  const analysis = await callTaskAnalyzer({
    modelKey,
    goal: userChatInput,
    toolNodes
  });

  let totalTokens = analysis.tokens;
  let totalRunTimes = 1;
  let reasoningText = '';

  // For SIMPLE tasks, directly execute without full plan-execute loop
  if (analysis.complexity === 'simple') {
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
        plan: [],
        pastSteps: [{ step: userChatInput, result: simpleAnswer }],
        finalDecision: 'response'
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
  // Adaptive step limits based on complexity
  const adaptiveMaxSteps = Math.min(6, maxPlanSteps);

  const planner = await callPlanner({
    modelKey,
    systemPrompt,
    goal: userChatInput,
    complexity: analysis.complexity,
    maxPlanSteps: adaptiveMaxSteps,
    toolNodes,
    enableReasoning,
    reasoningEffort
  });

  totalTokens += planner.tokens;
  totalRunTimes += 1;
  reasoningText = (planner.reasoningText || '').trim();

  const initialPlanRaw = planner.steps.length > 0 ? planner.steps : [userChatInput];
  let todoAllSteps = normalizePlannerSteps(initialPlanRaw, adaptiveMaxSteps);
  if (todoAllSteps.length === 0) {
    todoAllSteps = [normalizeStepText(userChatInput)].filter(Boolean);
  }
  const originalPlan = [...todoAllSteps]; // Keep original plan for progress tracking
  let planQueue = [...todoAllSteps];
  const pastSteps: { step: string; result: string }[] = [];

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
          text: `${TASK_PREFIX}${normalizeStepText(step)}\n\n`,
          reasoning_content: '',
          model: model.model
        })
      });
    }

    const stepPrompt = buildExecutorPrompt({
      goal: userChatInput,
      step,
      stepNumber: pastSteps.length + 1,
      totalSteps: originalPlan.length,
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
        // 子任务共享对话历史（由卡片“历史记录”控制），增强连续性与工具调用智能
        history,
        systemPrompt: `${systemPrompt ? `${systemPrompt}\n\n` : ''}你是一个 Plan-and-Execute Agent：会先规划，再逐步执行；每次只解决“当前步骤”。`,
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
    toolItems = toolItems.concat(pickToolItems(stepAssistant));

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

    pastSteps.push({ step, result: stepAnswer });

    // Critic: Evaluate step execution quality
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

    // Output quality warning if score is low
    if (criticResult.score < 6 && stream) {
      const qualityNote =
        criticResult.issues.length > 0
          ? `⚠️ Quality: ${criticResult.score}/10 - ${criticResult.issues.slice(0, 2).join('; ')}`
          : `⚠️ Quality: ${criticResult.score}/10`;
      workflowStreamResponse?.({
        event: SseResponseEventEnum.fastAnswer,
        data: textAdaptGptResponse({
          text: `\n${qualityNote}\n`,
          reasoning_content: '',
          model: model.model
        })
      });
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

    // 强制：只要 todo 还有未完成，就不允许结束（哪怕模型说 respond）
    const remainingTodo = getRemainingTodoSteps();
    if (decision.action === 'respond' && remainingTodo.length > 0) {
      decision = {
        action: 'continue',
        steps: mergeRemainingPlan({ current: remainingTodo, suggested: [] }),
        progress: `${pastSteps.length}/${originalPlan.length} completed`,
        tokens: decision.tokens,
        reasoningText: decision.reasoningText
      } as ReplanResult;
    }

    if (decision.action === 'respond') {
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
            taskType,
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
            taskType,
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

    if (decision.action === 'continue') {
      // 只允许追加新步骤（受 maxPlanSteps 限制），执行顺序始终以待办清单顺序为准
      if (decision.steps.length > 0) {
        todoAllSteps = applyReplannerPlanUpdate({
          suggestedSteps: decision.steps,
          maxPlanSteps,
          pastSteps,
          todoAllSteps
        });
      }
      planQueue = getRemainingTodoSteps();
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
