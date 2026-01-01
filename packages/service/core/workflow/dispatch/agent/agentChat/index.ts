import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import {
  DispatchNodeResponseKeyEnum,
  SseResponseEventEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';
import { randomUUID } from 'crypto';
import { getLLMModel, ModelTypeEnum } from '../../../../ai/model';
import { formatModelChars2Points } from '../../../../../support/wallet/usage/utils';
import { filterToolNodeIdByEdges } from '../../utils';
import { dispatchRunTools } from '../runTool';
import { filterToolResponseToPreview } from '../runTool/utils';
import { getHistoryPreview } from '@fastgpt/global/core/chat/utils';
import { chatValue2RuntimePrompt, GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';

import type {
  AgentOrchestrationMode,
  AgentToolAccess,
  RawResponse,
  ToolPreferenceMode
} from './types';
import type {
  AgentPastStep,
  AgentPlanStep,
  ClarifyResult,
  CriticResult,
  WorkingMemory
} from './types';
import {
  clampInt,
  normalizePlannerPlanSteps,
  normalizePlannerSteps,
  normalizeStepText,
  nowIso,
  parsePlanStepsFromModelText,
  parsePlanStepsFromUnknown,
  parseStepsFromModelText,
  pickToolItems,
  renderTodoMarkdown,
  truncateText
} from './utils';
import {
  applyToolAccessPolicy,
  extractToolPreviewText,
  filterRuntimeEdgesByToolAllowList,
  renderToolsCatalogText,
  withToolPreference
} from './tools';
import {
  buildClarifierSystemPrompt,
  buildCriticSystemPrompt,
  buildExecutorPrompt,
  buildFinalSynthesisSystemPrompt,
  buildPlannerSystemPrompt,
  buildReplannerSystemPrompt,
  buildStepMemoryExtractorSystemPrompt,
  buildStepResultSynthesisPrompt,
  buildWorkingMemorySystemPrompt,
  renderWorkingMemoryText,
  SUMMARY_SEPARATOR,
  TASK_PREFIX
} from './prompts';
import { callChatCompletionJson, callChatCompletionText } from './llm';

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
  [NodeInputKeyEnum.agentOrchestrationMode]?: string;
  [NodeInputKeyEnum.agentToolAccess]?: string;
  [NodeInputKeyEnum.agentToolPreference]?: string;
  [NodeInputKeyEnum.agentEnableClarify]?: boolean;
  [NodeInputKeyEnum.agentEnableWorkingMemory]?: boolean;
  [NodeInputKeyEnum.agentEnableStepMemory]?: boolean;
  [NodeInputKeyEnum.agentEnableCritic]?: boolean;
  [NodeInputKeyEnum.agentCriticThreshold]?: number;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.answerText]: string;
  [NodeOutputKeyEnum.reasoningText]?: string;
  [NodeOutputKeyEnum.rawResponse]: RawResponse;
}>;

const parseOrchestrationMode = (value: unknown): AgentOrchestrationMode => {
  if (value === 'react') return 'react';
  return 'plan_execute';
};
const parseToolAccess = (value: unknown): AgentToolAccess => {
  if (value === 'readOnly') return 'readOnly';
  if (value === 'full') return 'full';
  return 'standard';
};
const parseToolPreference = (value: unknown): ToolPreferenceMode => {
  if (value === 'none') return 'none';
  if (value === 'light') return 'light';
  if (value === 'strong') return 'strong';
  return 'strong';
};

const isObviouslySimple = (input: string, toolCount: number, hasHistory: boolean) => {
  const trimmed = input.trim();
  // 即使没有工具，也可能需要“规划-执行”来拆解复杂目标（对齐白皮书 Level 0/1 的差异）
  if (hasHistory) return false;
  if (trimmed.length < 15 && /^(你好|hi|hello|谢谢|thanks|帮我|请问|什么是)/i.test(trimmed)) {
    return true;
  }
  if (trimmed.length < 30 && !/[，,、；;]|(并且|而且|同时|另外|还要|以及|和.*和)/.test(trimmed)) {
    return true;
  }
  // 没有工具时，短且单一的问题通常不需要 todo
  if (toolCount === 0 && trimmed.length < 40) return true;
  return false;
};

const isTrivialChitChat = (input: string) => {
  const s = input.trim();
  if (!s) return true;
  return /^(好|好的|ok|okay|嗯|恩|行|可以|收到|了解|明白|谢谢|thanks|thx|继续|开始吧)[!！。.\s]*$/i.test(
    s
  );
};

// 追问通常很短，但强依赖上下文；为了更稳定触发 todo，这里做确定性升级到 complex
const shouldForceComplexWithHistory = (params: { input: string; hasHistory: boolean }) => {
  const { input, hasHistory } = params;
  if (!hasHistory) return false;
  if (isTrivialChitChat(input)) return false;

  // 有历史对话且非寒暄/确认语时，统一升级为 complex，保证追问能稳定触发 todo 规划
  return true;
};

const shouldCallCritic = (params: {
  enabled: boolean;
  stepAnswer: string;
  isLastStep: boolean;
  hasToolCalls: boolean;
}) => {
  const { enabled, stepAnswer, isLastStep, hasToolCalls } = params;
  if (!enabled) return false;
  if (isLastStep) return true;
  if (!stepAnswer || stepAnswer.trim().length < 30) return true;
  if (/error|fail|exception|无法|失败|抱歉|出错|不能|找不到/i.test(stepAnswer)) return true;
  if (hasToolCalls && stepAnswer.trim().length < 100) return true;
  return false;
};

const mergeWorkingMemory = (params: {
  workingMemory: WorkingMemory;
  stepMemory?: AgentPastStep['memory'];
}) => {
  const { workingMemory, stepMemory } = params;
  if (!stepMemory) return workingMemory;

  const next: WorkingMemory = {
    ...workingMemory,
    knownFacts: [...workingMemory.knownFacts],
    openQuestions: [...workingMemory.openQuestions]
  };

  const pushUnique = (arr: string[], items: string[], max: number) => {
    const set = new Set(arr.map((s) => s.trim()).filter(Boolean));
    for (const it of items) {
      const t = it.trim();
      if (!t) continue;
      if (set.has(t)) continue;
      set.add(t);
      arr.push(t);
      if (arr.length >= max) break;
    }
  };

  if (stepMemory.facts?.length) pushUnique(next.knownFacts, stepMemory.facts, 12);
  if (stepMemory.numbers?.length) {
    pushUnique(
      next.knownFacts,
      stepMemory.numbers.map((n) => `${n.name}=${n.value}${n.unit || ''}`),
      12
    );
  }
  if (stepMemory.openQuestions?.length)
    pushUnique(next.openQuestions, stepMemory.openQuestions, 12);
  return next;
};

const callClarifier = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  toolNodes: RuntimeNodeItemType[];
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<ClarifyResult> => {
  const { modelKey, systemPrompt, goal, toolNodes, enableReasoning, reasoningEffort } = params;

  const toolsText = renderToolsCatalogText(toolNodes, 5200);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildClarifierSystemPrompt(systemPrompt)
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal:\n${goal}\n\nAvailable tools:\n${toolsText}\n\nOutput JSON:`
    }
  ];

  const { json, tokens } = await callChatCompletionJson<{
    needClarify?: unknown;
    reason?: unknown;
    questions?: unknown;
  }>({ modelKey, messages, enableReasoning, reasoningEffort, maxToken: 220 });

  const needClarify = json?.needClarify === true;
  const reason = typeof json?.reason === 'string' ? json.reason.trim() : '';
  const questions =
    json && Array.isArray(json.questions)
      ? (json.questions as unknown[])
          .filter((q): q is string => typeof q === 'string')
          .map((q) => q.trim())
          .filter(Boolean)
          .slice(0, 3)
      : [];

  return { needClarify, reason, questions, tokens };
};

const callWorkingMemory = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  toolNodes: RuntimeNodeItemType[];
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<{ memory: WorkingMemory; tokens: number }> => {
  const { modelKey, systemPrompt, goal, toolNodes, enableReasoning, reasoningEffort } = params;
  const toolsText = renderToolsCatalogText(toolNodes, 2600);
  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildWorkingMemorySystemPrompt(systemPrompt)
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal:\n${goal}\n\nAvailable tools (summary):\n${toolsText}\n\nOutput JSON:`
    }
  ];

  const { json, tokens } = await callChatCompletionJson<WorkingMemory>({
    modelKey,
    messages,
    enableReasoning,
    reasoningEffort,
    maxToken: 320
  });

  const memory: WorkingMemory = {
    summary: typeof json?.summary === 'string' ? json.summary.trim() : '',
    constraints:
      json && Array.isArray(json.constraints)
        ? (json.constraints as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
    knownFacts:
      json && Array.isArray(json.knownFacts)
        ? (json.knownFacts as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [],
    openQuestions:
      json && Array.isArray(json.openQuestions)
        ? (json.openQuestions as unknown[])
            .filter((s): s is string => typeof s === 'string')
            .map((s) => s.trim())
            .filter(Boolean)
            .slice(0, 6)
        : []
  };

  return { memory, tokens };
};

const callTaskAnalyzer = async (params: {
  modelKey: string;
  goal: string;
  toolNodes: RuntimeNodeItemType[];
  histories?: ChatItemType[];
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<{ complexity: 'simple' | 'complex'; reason: string; tokens: number }> => {
  const { modelKey, goal, toolNodes, histories, enableReasoning, reasoningEffort } = params;

  const toolsText = renderToolsCatalogText(toolNodes, 3200);
  const recentHistory =
    Array.isArray(histories) && histories.length > 0
      ? histories
          .slice(-3)
          .map((h) => {
            const text = chatValue2RuntimePrompt(h.value).text;
            return text ? `- ${truncateText(text, 200)}` : '';
          })
          .filter(Boolean)
          .join('\n')
      : '';

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: `You are a Task Complexity Analyzer.
Classify whether the goal is simple or complex for an agent with tools.

SIMPLE:
- Direct questions with clear, immediate answers
- Single-step operations or lookups
- Requires at most ONE tool call

COMPLEX:
- Multi-step reasoning or sequential operations
- Multiple tools/data sources, or dependencies between steps
- Comparative analysis or synthesis
- Follow-up questions that need context from conversation history

Output JSON only: {"complexity":"simple"|"complex","reason":"brief"}`
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `${recentHistory ? `Recent history:\n${recentHistory}\n\n` : ''}Current goal:\n${goal}\n\nAvailable tools:\n${toolsText}\n\nOutput JSON:`
    }
  ];

  const { json, tokens } = await callChatCompletionJson<{ complexity?: unknown; reason?: unknown }>(
    {
      modelKey,
      messages,
      enableReasoning,
      reasoningEffort,
      maxToken: 150
    }
  );

  return {
    complexity: json?.complexity === 'complex' ? 'complex' : 'simple',
    reason: typeof json?.reason === 'string' ? json.reason : '',
    tokens
  };
};

const callPlanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  complexity: 'simple' | 'complex';
  maxPlanSteps: number;
  toolNodes: RuntimeNodeItemType[];
  toolPreference: ToolPreferenceMode;
  enableReasoning: boolean;
  reasoningEffort?: string;
  histories?: ChatItemType[];
}): Promise<{ steps: AgentPlanStep[]; tokens: number; reasoningText: string }> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    complexity,
    maxPlanSteps,
    toolNodes,
    toolPreference,
    enableReasoning,
    reasoningEffort,
    histories
  } = params;

  const stepRange = complexity === 'simple' ? '1-2' : `2-${maxPlanSteps}`;
  const toolsText =
    toolNodes.length === 0
      ? '(No tools available - plan based on general knowledge)'
      : renderToolsCatalogText(toolNodes, 5200);
  const recentHistory =
    Array.isArray(histories) && histories.length > 0
      ? histories
          .slice(-3)
          .map((h) => {
            const text = chatValue2RuntimePrompt(h.value).text;
            return text ? `- ${truncateText(text, 200)}` : '';
          })
          .filter(Boolean)
          .join('\n')
      : '';

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildPlannerSystemPrompt({ systemPrompt, toolNodes, toolPreference, stepRange })
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `${recentHistory ? `Recent conversation history:\n${recentHistory}\n\n` : ''}User goal:\n${goal}\n\nTask complexity:\n${complexity.toUpperCase()} (plan ${stepRange} steps)\n\nAvailable tools:\n${toolsText}\n\nGenerate plan JSON:`
    }
  ];

  const { text, tokens, reasoningText } = await callChatCompletionText({
    modelKey,
    messages,
    temperature: 0.2,
    timeout: 480000,
    enableReasoning,
    reasoningEffort
  });

  const structuredSteps = parsePlanStepsFromModelText(text, maxPlanSteps);
  const fallbackSteps = normalizePlannerSteps(
    parseStepsFromModelText(text, maxPlanSteps),
    maxPlanSteps
  ).map((title, index) => ({ id: `S${index + 1}`, title }));

  return {
    steps: structuredSteps.length > 0 ? structuredSteps : fallbackSteps,
    tokens,
    reasoningText
  };
};

type ReplanResult =
  | { action: 'respond'; response: string; reason: string; tokens: number; reasoningText: string }
  | {
      action: 'continue';
      remainingSteps: AgentPlanStep[];
      progress: string;
      changeSummary: string;
      reason: string;
      tokens: number;
      reasoningText: string;
    };

const callReplanner = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  originalPlan: AgentPlanStep[];
  remainingSteps: AgentPlanStep[];
  pastSteps: AgentPastStep[];
  maxPlanSteps: number;
  toolNodes: RuntimeNodeItemType[];
  toolPreference: ToolPreferenceMode;
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
    toolNodes,
    toolPreference,
    enableReasoning,
    reasoningEffort
  } = params;

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
      : remainingSteps.map((s, i) => `○ ${i + 1}. [${s.id}] ${s.title}`).join('\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildReplannerSystemPrompt({ systemPrompt, toolNodes, toolPreference })
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal:\n${goal}\n\nExecution progress: ${completionRate}%\n\nCompleted:\n${pastText}\n\nRemaining:\n${planText}\n\nConstraints:\n- maxPlanSteps: ${maxPlanSteps}\n- completedSteps: ${pastSteps.length}\n- remainingSteps: ${remainingSteps.length}\n\nOutput decision JSON:`
    }
  ];

  const { json, tokens, reasoningText } = await callChatCompletionJson<{
    action?: unknown;
    response?: unknown;
    remainingSteps?: unknown;
    steps?: unknown;
    plan?: unknown;
    progress?: unknown;
    changeSummary?: unknown;
    reason?: unknown;
  }>({
    modelKey,
    messages,
    timeout: 480000,
    enableReasoning,
    reasoningEffort,
    temperature: 0.2
  });

  const action = typeof json?.action === 'string' ? json.action : '';

  if (action === 'respond' && typeof json?.response === 'string') {
    return {
      action: 'respond',
      response: json.response.trim(),
      reason: typeof json?.reason === 'string' ? json.reason.trim() : '',
      tokens,
      reasoningText
    };
  }

  if (action === 'continue') {
    const reservedIds = new Set(pastSteps.map((p) => p.step.id));
    const steps = parsePlanStepsFromUnknown({
      value: json?.remainingSteps ?? json?.steps ?? json?.plan,
      maxPlanSteps,
      reservedIds,
      defaultIdPrefix: 'R'
    });
    return {
      action: 'continue',
      remainingSteps: steps,
      progress: typeof json?.progress === 'string' ? json.progress : `${completionRate}% complete`,
      changeSummary: typeof json?.changeSummary === 'string' ? json.changeSummary.trim() : '',
      reason: typeof json?.reason === 'string' ? json.reason.trim() : '',
      tokens,
      reasoningText
    };
  }

  return {
    action: 'continue',
    remainingSteps: [],
    progress: `${completionRate}% complete`,
    changeSummary: '模型输出解析失败，保持原剩余计划不变',
    reason: '模型输出无法解析为 JSON',
    tokens,
    reasoningText
  };
};

const callCritic = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  step: AgentPlanStep;
  result: string;
  toolText: string;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<CriticResult> => {
  const { modelKey, systemPrompt, goal, step, result, toolText, enableReasoning, reasoningEffort } =
    params;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildCriticSystemPrompt(systemPrompt)
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal:\n${goal}\n\nCurrent step:\n${step.title}\n\nExpected output:\n${step.expectedOutput || '(Not specified)'}\n\nAcceptance criteria:\n${
        step.acceptanceCriteria?.length
          ? step.acceptanceCriteria.map((s) => `- ${s}`).join('\n')
          : '(Not specified)'
      }\n\nExecution result:\n${truncateText(result, 800)}\n\nTool usage:\n${toolText || '(No tools used)'}\n\nEvaluate and output JSON:`
    }
  ];

  const { json, tokens } = await callChatCompletionJson<{
    score?: unknown;
    issues?: unknown;
    suggestion?: unknown;
  }>({
    modelKey,
    messages,
    timeout: 240000,
    enableReasoning,
    reasoningEffort,
    maxToken: 400,
    temperature: 0.1
  });

  const score =
    typeof json?.score === 'number'
      ? Math.max(0, Math.min(10, json.score))
      : typeof json?.score === 'string'
        ? Math.max(0, Math.min(10, Number.parseFloat(json.score) || 5))
        : 5;
  const issues =
    json && Array.isArray(json.issues)
      ? (json.issues as unknown[])
          .filter((i): i is string => typeof i === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 8)
      : [];
  const suggestion = typeof json?.suggestion === 'string' ? json.suggestion.trim() : '';
  return { score, issues, suggestion, tokens };
};

const callStepMemoryExtractor = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  stepTitle: string;
  stepResult: string;
  toolText: string;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<{ memory?: AgentPastStep['memory']; tokens: number }> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    stepTitle,
    stepResult,
    toolText,
    enableReasoning,
    reasoningEffort
  } = params;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildStepMemoryExtractorSystemPrompt(systemPrompt)
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal: ${goal}\nStep: ${stepTitle}\n\nstepResult:\n${truncateText(stepResult, 1800)}\n\ntoolText (excerpt):\n${truncateText(toolText, 1800)}\n\nOutput JSON:`
    }
  ];

  const { json, tokens } = await callChatCompletionJson<Record<string, unknown>>({
    modelKey,
    messages,
    timeout: 120000,
    enableReasoning,
    reasoningEffort,
    maxToken: 360
  });

  if (!json) return { memory: undefined, tokens };

  const facts = Array.isArray(json.facts)
    ? json.facts
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const assumptions = Array.isArray(json.assumptions)
    ? json.assumptions
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const sources = Array.isArray(json.sources)
    ? json.sources
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];
  const openQuestions = Array.isArray(json.openQuestions)
    ? json.openQuestions
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const numbers = Array.isArray(json.numbers)
    ? json.numbers
        .map((n) => {
          const r = n && typeof n === 'object' ? (n as Record<string, unknown>) : undefined;
          if (!r) return;
          const name = typeof r.name === 'string' ? r.name.trim() : '';
          const value = typeof r.value === 'string' ? r.value.trim() : '';
          const unit = typeof r.unit === 'string' ? r.unit.trim() : undefined;
          if (!name || !value) return;
          return { name, value, ...(unit ? { unit } : {}) };
        })
        .filter((v): v is { name: string; value: string; unit?: string } => !!v)
        .slice(0, 6)
    : [];

  return {
    memory: {
      ...(facts.length ? { facts } : {}),
      ...(numbers.length ? { numbers } : {}),
      ...(assumptions.length ? { assumptions } : {}),
      ...(sources.length ? { sources } : {}),
      ...(openQuestions.length ? { openQuestions } : {})
    },
    tokens
  };
};

const callFinalSynthesis = async (params: {
  modelKey: string;
  systemPrompt?: string;
  goal: string;
  workingMemory?: WorkingMemory;
  pastSteps: AgentPastStep[];
  decisionResponse?: string;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<{ text: string; tokens: number }> => {
  const {
    modelKey,
    systemPrompt,
    goal,
    workingMemory,
    pastSteps,
    decisionResponse,
    enableReasoning,
    reasoningEffort
  } = params;

  const memoryText = renderWorkingMemoryText(workingMemory);
  const stepsText =
    pastSteps.length === 0
      ? '(none)'
      : pastSteps
          .slice(-10)
          .map((p, i) => {
            const mem = p.memory;
            const memLines: string[] = [];
            if (mem?.facts?.length) memLines.push(`facts: ${mem.facts.join('；')}`);
            if (mem?.numbers?.length) {
              memLines.push(
                `numbers: ${mem.numbers.map((n) => `${n.name}=${n.value}${n.unit || ''}`).join('；')}`
              );
            }
            if (mem?.assumptions?.length)
              memLines.push(`assumptions: ${mem.assumptions.join('；')}`);
            if (mem?.openQuestions?.length) memLines.push(`open: ${mem.openQuestions.join('；')}`);
            return `Step ${i + 1}: ${p.step.title}\nResult: ${truncateText(p.result, 600)}${
              memLines.length ? `\nExtracted: ${truncateText(memLines.join(' | '), 900)}` : ''
            }`;
          })
          .join('\n\n');

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: buildFinalSynthesisSystemPrompt(systemPrompt)
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: `User goal:\n${goal}\n${memoryText}\n\nCompleted steps:\n${stepsText}\n\nOptional draft response from replanner:\n${
        decisionResponse ? truncateText(decisionResponse, 1200) : '(none)'
      }\n\nOutput final answer in Simplified Chinese:`
    }
  ];

  const { text, tokens } = await callChatCompletionText({
    modelKey,
    messages,
    temperature: 0.2,
    timeout: 120000,
    enableReasoning,
    reasoningEffort
  });
  return { text: text.trim(), tokens };
};

const callStepResultSynthesis = async (params: {
  modelKey: string;
  goal: string;
  step: AgentPlanStep;
  toolText: string;
  enableReasoning: boolean;
  reasoningEffort?: string;
}): Promise<{ text: string; tokens: number }> => {
  const { modelKey, goal, step, toolText, enableReasoning, reasoningEffort } = params;
  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content:
        'You are a Step Result Synthesizer. Convert tool outputs into a short step result. Output must be Simplified Chinese.'
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: buildStepResultSynthesisPrompt({ goal, step, toolText })
    }
  ];

  const { text, tokens } = await callChatCompletionText({
    modelKey,
    messages,
    temperature: 0,
    maxToken: 220,
    timeout: 60000,
    enableReasoning,
    reasoningEffort
  });

  return { text, tokens };
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
      agentMaxLoops,
      agentOrchestrationMode,
      agentToolAccess,
      agentToolPreference,
      agentEnableClarify,
      agentEnableWorkingMemory,
      agentEnableStepMemory,
      agentEnableCritic,
      agentCriticThreshold
    },
    workflowStreamResponse,
    stream
  } = props;

  const model = getLLMModel(modelKey);
  if (!model) return Promise.reject('LLM model not found');

  const enableReasoning = !!aiChatReasoning && !!model.reasoning;
  const reasoningEffort =
    enableReasoning && aiChatReasoningEffort ? aiChatReasoningEffort : undefined;

  const orchestrationMode = parseOrchestrationMode(agentOrchestrationMode);
  const toolAccess = parseToolAccess(agentToolAccess);
  const toolPreference = parseToolPreference(agentToolPreference);

  const maxPlanSteps = clampInt(agentMaxPlanSteps, 6, 1, 20);
  const maxLoops = clampInt(agentMaxLoops, 12, 1, 50);
  const criticEnabled = agentEnableCritic !== false;
  const criticThreshold = clampInt(agentCriticThreshold, 4, 0, 10);
  const stepMemoryEnabled = agentEnableStepMemory !== false;
  const clarifyEnabled = agentEnableClarify !== false;
  const workingMemoryEnabled = agentEnableWorkingMemory !== false;

  const traceId = randomUUID();
  const trace: RawResponse['trace'] = [
    { at: nowIso(), type: 'mission', message: 'received user goal', data: { goal: userChatInput } }
  ];

  const toolNodeIds = filterToolNodeIdByEdges({ nodeId, edges: runtimeEdges });
  const connectedToolNodes = toolNodeIds
    .map((id) => runtimeNodes.find((n) => n.nodeId === id))
    .filter((n): n is RuntimeNodeItemType => !!n);

  const toolPolicy = applyToolAccessPolicy({ toolNodes: connectedToolNodes, toolAccess });
  const effectiveRuntimeEdges = filterRuntimeEdgesByToolAllowList({
    nodeId,
    runtimeEdges,
    allowedToolNodeIds: toolPolicy.allowedToolNodeIds
  });
  const toolNodes = toolPolicy.allowedToolNodes;

  trace.push({
    at: nowIso(),
    type: 'policy',
    message: 'applied tool access policy',
    data: {
      toolAccess,
      allowedToolNodeIds: toolPolicy.allowedToolNodeIds,
      blockedToolNodeIds: toolPolicy.blockedToolNodeIds
    }
  });

  const toolsCatalogText = renderToolsCatalogText(toolNodes, 5200);
  trace.push({
    at: nowIso(),
    type: 'scene',
    message: 'constructed scene',
    data: {
      toolCount: toolNodes.length,
      hasHistory: Array.isArray(histories) && histories.length > 0
    }
  });

  let totalTokens = 0;
  let totalRunTimes = 0;
  let reasoningText = '';

  const baseRawResponse: Omit<RawResponse, 'plan' | 'pastSteps' | 'finalDecision'> = {
    traceId,
    orchestration: { mode: orchestrationMode, toolAccess, toolPreference },
    trace,
    planSteps: [],
    toolsCatalogText,
    toolPolicy: {
      allowedToolNodeIds: toolPolicy.allowedToolNodeIds,
      blockedToolNodeIds: toolPolicy.blockedToolNodeIds,
      blockedReason: toolPolicy.blockedReason
    },
    workingMemory: { summary: '', constraints: [], knownFacts: [], openQuestions: [] },
    clarify: { needClarify: false, reason: '', questions: [] },
    replanHistory: [],
    usage: { totalTokens: 0, totalRunTimes: 0 },
    toolDetail: [],
    toolPreviewItems: []
  };

  // Mode: ReAct (single tool-loop run)
  if (orchestrationMode === 'react') {
    const result = await dispatchRunTools({
      ...props,
      runtimeEdges: effectiveRuntimeEdges,
      params: {
        model: modelKey,
        temperature: props.params.temperature,
        maxToken: props.params.maxToken,
        aiChatVision: props.params.aiChatVision,
        aiChatReasoning: props.params.aiChatReasoning,
        aiChatReasoningEffort: props.params.aiChatReasoningEffort,
        history,
        systemPrompt: `${withToolPreference(systemPrompt, toolNodes, toolPreference)}You are an agent following a Think-Act-Observe loop. Use tools when needed. Output all user-visible content in Simplified Chinese.`,
        userChatInput
      },
      histories
    });

    const answer = (result[NodeOutputKeyEnum.answerText] || '').trim();
    const rText = result[NodeOutputKeyEnum.reasoningText] || '';
    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    const usages = result[DispatchNodeResponseKeyEnum.nodeDispatchUsages] || [];
    totalTokens += nodeResponse?.toolCallTokens || 0;
    totalRunTimes += result[DispatchNodeResponseKeyEnum.runTimes] || 1;
    reasoningText = rText;

    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelKey,
      tokens: totalTokens,
      modelType: ModelTypeEnum.llm
    });

    const assistant = result[DispatchNodeResponseKeyEnum.assistantResponses] || [];
    const previewToolItems = filterToolResponseToPreview(pickToolItems(assistant));

    return {
      [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
      [NodeOutputKeyEnum.answerText]: answer,
      [NodeOutputKeyEnum.reasoningText]: reasoningText,
      [NodeOutputKeyEnum.rawResponse]: {
        ...baseRawResponse,
        plan: [],
        pastSteps: [{ step: userChatInput, result: answer }],
        finalDecision: 'response',
        usage: { totalTokens, totalRunTimes },
        toolDetail: nodeResponse?.toolDetail || [],
        toolPreviewItems: previewToolItems
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: [
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
          text: { content: answer }
        }
      ],
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        toolCallTokens: totalTokens,
        model: modelName,
        query: userChatInput,
        toolDetail: nodeResponse?.toolDetail || []
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        { moduleName: name, totalPoints, model: modelName, tokens: totalTokens },
        ...usages.slice(1)
      ]
    };
  }

  // Clarification gate (HITL-style)
  if (clarifyEnabled && toolNodes.length > 0) {
    const clarify = await callClarifier({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      toolNodes,
      enableReasoning,
      reasoningEffort
    });
    totalTokens += clarify.tokens;
    totalRunTimes += 1;

    if (clarify.needClarify && clarify.questions.length > 0) {
      const answer = `在继续之前，需要你补充以下信息：\n${clarify.questions
        .map((q, i) => `${i + 1}. ${q}`)
        .join('\n')}`;

      trace.push({
        at: nowIso(),
        type: 'report',
        message: 'returned clarification questions',
        data: { reason: clarify.reason, questions: clarify.questions }
      });

      const { totalPoints, modelName } = formatModelChars2Points({
        model: modelKey,
        tokens: totalTokens,
        modelType: ModelTypeEnum.llm
      });

      return {
        [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
        [NodeOutputKeyEnum.answerText]: answer,
        [NodeOutputKeyEnum.reasoningText]: '',
        [NodeOutputKeyEnum.rawResponse]: {
          ...baseRawResponse,
          plan: [],
          pastSteps: [{ step: userChatInput, result: answer }],
          finalDecision: 'response',
          clarify: { needClarify: true, reason: clarify.reason, questions: clarify.questions },
          usage: { totalTokens, totalRunTimes }
        },
        [DispatchNodeResponseKeyEnum.assistantResponses]: [
          {
            type: ChatItemValueTypeEnum.text as AIChatItemValueItemType['type'],
            text: { content: answer }
          }
        ],
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints,
          toolCallTokens: totalTokens,
          model: modelName,
          query: userChatInput,
          toolDetail: []
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
          { moduleName: name, totalPoints, model: modelName, tokens: totalTokens }
        ]
      };
    }
  }

  // Working memory (short-term memory scratchpad)
  let workingMemory: WorkingMemory = {
    summary: '',
    constraints: [],
    knownFacts: [],
    openQuestions: []
  };
  if (workingMemoryEnabled) {
    const wm = await callWorkingMemory({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      toolNodes,
      enableReasoning,
      reasoningEffort
    });
    workingMemory = wm.memory;
    totalTokens += wm.tokens;
    totalRunTimes += 1;
  }
  let workingMemoryText = renderWorkingMemoryText(workingMemory);

  // Complexity + planning (parallel)
  const hasHistory = Array.isArray(histories) && histories.length > 0;
  const obviouslySimple = isObviouslySimple(userChatInput, toolNodes.length, hasHistory);
  const forceComplex = shouldForceComplexWithHistory({ input: userChatInput, hasHistory });

  let complexity: 'simple' | 'complex' = 'simple';
  let plannerResult: { steps: AgentPlanStep[]; tokens: number; reasoningText: string } | null =
    null;

  if (forceComplex) {
    complexity = 'complex';
    trace.push({
      at: nowIso(),
      type: 'plan',
      message: 'forced complex due to follow-up context',
      data: { hasHistory, toolCount: toolNodes.length }
    });

    plannerResult = await callPlanner({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      complexity: 'complex',
      maxPlanSteps,
      toolNodes,
      toolPreference,
      enableReasoning,
      reasoningEffort,
      histories
    });

    totalTokens += plannerResult.tokens;
    totalRunTimes += 1;
    if (plannerResult.reasoningText) reasoningText = plannerResult.reasoningText.trim();
  } else if (!obviouslySimple) {
    const [analysis, planner] = await Promise.all([
      callTaskAnalyzer({
        modelKey,
        goal: userChatInput,
        toolNodes,
        histories,
        enableReasoning,
        reasoningEffort
      }),
      callPlanner({
        modelKey,
        systemPrompt,
        goal: userChatInput,
        complexity: 'complex',
        maxPlanSteps,
        toolNodes,
        toolPreference,
        enableReasoning,
        reasoningEffort,
        histories
      })
    ]);

    totalTokens += analysis.tokens;
    totalRunTimes += 1;
    complexity = analysis.complexity;

    if (complexity === 'complex') {
      plannerResult = planner;
      totalTokens += planner.tokens;
      totalRunTimes += 1;
      if (planner.reasoningText) reasoningText = planner.reasoningText.trim();
    }
  }

  // SIMPLE: run a single tool loop
  if (complexity === 'simple') {
    const simple = await dispatchRunTools({
      ...props,
      runtimeEdges: effectiveRuntimeEdges,
      params: {
        model: modelKey,
        temperature: props.params.temperature,
        maxToken: props.params.maxToken,
        aiChatVision: props.params.aiChatVision,
        aiChatReasoning: props.params.aiChatReasoning,
        aiChatReasoningEffort: props.params.aiChatReasoningEffort,
        history,
        systemPrompt: `${withToolPreference(systemPrompt, toolNodes, toolPreference)}You are a helpful assistant. Output all user-visible content in Simplified Chinese.`,
        userChatInput
      },
      histories
    });

    const answer = (simple[NodeOutputKeyEnum.answerText] || '').trim();
    const simpleReasoning = simple[NodeOutputKeyEnum.reasoningText] || '';
    const nodeResponse = simple[DispatchNodeResponseKeyEnum.nodeResponse];
    const usages = simple[DispatchNodeResponseKeyEnum.nodeDispatchUsages] || [];
    totalTokens += nodeResponse?.toolCallTokens || 0;
    totalRunTimes += simple[DispatchNodeResponseKeyEnum.runTimes] || 1;

    const { totalPoints, modelName } = formatModelChars2Points({
      model: modelKey,
      tokens: totalTokens,
      modelType: ModelTypeEnum.llm
    });

    const assistant = simple[DispatchNodeResponseKeyEnum.assistantResponses] || [];
    const previewToolItems = filterToolResponseToPreview(pickToolItems(assistant));

    return {
      [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
      [NodeOutputKeyEnum.answerText]: answer,
      [NodeOutputKeyEnum.reasoningText]: simpleReasoning,
      [NodeOutputKeyEnum.rawResponse]: {
        ...baseRawResponse,
        plan: [],
        pastSteps: [{ step: userChatInput, result: answer }],
        finalDecision: 'response',
        workingMemory,
        usage: { totalTokens, totalRunTimes },
        toolDetail: nodeResponse?.toolDetail || [],
        toolPreviewItems: previewToolItems
      },
      [DispatchNodeResponseKeyEnum.assistantResponses]: [
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
          text: { content: answer }
        }
      ],
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints,
        toolCallTokens: totalTokens,
        model: modelName,
        query: userChatInput,
        toolDetail: nodeResponse?.toolDetail || []
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        { moduleName: name, totalPoints, model: modelName, tokens: totalTokens },
        ...usages.slice(1)
      ]
    };
  }

  // COMPLEX: Plan-and-execute
  if (!plannerResult) {
    plannerResult = await callPlanner({
      modelKey,
      systemPrompt,
      goal: userChatInput,
      complexity,
      maxPlanSteps,
      toolNodes,
      toolPreference,
      enableReasoning,
      reasoningEffort,
      histories
    });
    totalTokens += plannerResult.tokens;
    totalRunTimes += 1;
    if (plannerResult.reasoningText) reasoningText = plannerResult.reasoningText.trim();
  }

  let todoAllSteps =
    plannerResult.steps.length > 0
      ? normalizePlannerPlanSteps(plannerResult.steps, maxPlanSteps)
      : [
          {
            id: 'S1',
            title: normalizeStepText(userChatInput) || userChatInput.trim()
          }
        ];
  if (todoAllSteps.length === 0) {
    todoAllSteps = [{ id: 'S1', title: normalizeStepText(userChatInput) || userChatInput.trim() }];
  }

  trace.push({
    at: nowIso(),
    type: 'plan',
    message: 'generated initial plan',
    data: { steps: todoAllSteps.map((s) => ({ id: s.id, title: s.title })) }
  });

  const originalPlan = [...todoAllSteps];
  let planQueue = [...todoAllSteps];
  const pastSteps: AgentPastStep[] = [];
  const replanHistory: NonNullable<RawResponse['replanHistory']> = [];

  const getRemainingTodoSteps = () => {
    const doneSet = new Set(pastSteps.map((p) => p.step.id));
    return todoAllSteps.filter((s) => !doneSet.has(s.id));
  };
  const getDoneCount = () => pastSteps.length;

  let todoContent = '';
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
  pushTodoSnapshot();

  let toolItems: AIChatItemValueItemType[] = [];
  let toolDetail: RawResponse['toolDetail'] = [];
  let nodeUsages: NonNullable<Response[typeof DispatchNodeResponseKeyEnum.nodeDispatchUsages]> = [];

  const MAX_STEP_RETRY = 1;
  const stepRetryCount = new Map<string, number>();
  const lastCriticByStepId = new Map<string, CriticResult>();

  for (let loop = 0; loop < maxLoops; loop++) {
    const step = planQueue.shift();
    if (!step) break;

    trace.push({ at: nowIso(), type: 'act', message: 'executing step', data: { loop, step } });

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
      workingMemoryText,
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
      runtimeEdges: effectiveRuntimeEdges,
      params: {
        model: modelKey,
        temperature: props.params.temperature,
        maxToken: props.params.maxToken,
        aiChatVision: props.params.aiChatVision,
        aiChatReasoning: props.params.aiChatReasoning,
        aiChatReasoningEffort: props.params.aiChatReasoningEffort,
        history,
        systemPrompt: `${withToolPreference(systemPrompt, toolNodes, toolPreference)}You are a Plan-and-Execute agent. Plan first, then execute step by step. Solve ONLY the current step. All user-visible outputs must be in Simplified Chinese.`,
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

    const toolText = extractToolPreviewText(stepAssistant);

    // If answer is empty (some reasoning models output reasoning-only), synthesize from tool results.
    if (!stepAnswer && toolText) {
      const synthesized = await callStepResultSynthesis({
        modelKey,
        goal: userChatInput,
        step,
        toolText,
        enableReasoning,
        reasoningEffort
      });
      totalTokens += synthesized.tokens;
      totalRunTimes += 1;
      stepAnswer = synthesized.text.trim();
    }

    const pastStep: AgentPastStep = { step, result: stepAnswer, toolText };
    pastSteps.push(pastStep);

    // Critic
    const hasToolCalls = stepToolItems.length > 0;
    const isLastStep = planQueue.length === 0;
    if (shouldCallCritic({ enabled: criticEnabled, stepAnswer, isLastStep, hasToolCalls })) {
      const critic = await callCritic({
        modelKey,
        systemPrompt,
        goal: userChatInput,
        step,
        result: stepAnswer,
        toolText,
        enableReasoning,
        reasoningEffort
      });
      totalTokens += critic.tokens;
      totalRunTimes += 1;

      lastCriticByStepId.set(step.id, critic);
      pastStep.critic = {
        score: critic.score,
        issues: critic.issues,
        suggestion: critic.suggestion
      };

      if (critic.score < criticThreshold) {
        const currentRetry = stepRetryCount.get(step.id) || 0;
        if (currentRetry < MAX_STEP_RETRY) {
          stepRetryCount.set(step.id, currentRetry + 1);
          pastSteps.pop();
          planQueue.unshift(step);
          pushTodoSnapshot();
          if (stream) {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.fastAnswer,
              data: textAdaptGptResponse({
                text: `\n> 步骤执行质量不佳，正在重试...\n${critic.suggestion ? `> 建议：${critic.suggestion}\n` : ''}\n`,
                reasoning_content: '',
                model: model.model
              })
            });
          }
          continue;
        }
      }
    }

    // Step memory extractor
    if (stepMemoryEnabled && (stepAnswer.length >= 30 || toolText.length >= 10)) {
      const extracted = await callStepMemoryExtractor({
        modelKey,
        systemPrompt,
        goal: userChatInput,
        stepTitle: step.title,
        stepResult: stepAnswer,
        toolText,
        enableReasoning,
        reasoningEffort
      });
      totalTokens += extracted.tokens;
      totalRunTimes += 1;
      pastStep.memory = extracted.memory;
      workingMemory = mergeWorkingMemory({ workingMemory, stepMemory: extracted.memory });
      workingMemoryText = renderWorkingMemoryText(workingMemory);
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

    // Replan
    let decision = await callReplanner({
      modelKey,
      systemPrompt,
      goal: `${userChatInput}${workingMemoryText}`,
      originalPlan,
      remainingSteps: planQueue,
      pastSteps,
      maxPlanSteps,
      toolNodes,
      toolPreference,
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

    if (decision.action === 'respond') {
      pushTodoSnapshot();

      const synthesized = await callFinalSynthesis({
        modelKey,
        systemPrompt,
        goal: userChatInput,
        workingMemory,
        pastSteps,
        decisionResponse: decision.response,
        enableReasoning,
        reasoningEffort
      });
      totalTokens += synthesized.tokens;
      totalRunTimes += 1;

      const finalAnswer = (
        synthesized.text ||
        decision.response ||
        pastSteps[pastSteps.length - 1]?.result ||
        ''
      ).trim();

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
                todo: { content: todoContent, done: getDoneCount(), total: todoAllSteps.length }
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

      trace.push({ at: nowIso(), type: 'report', message: 'responded', data: { finalAnswer } });

      return {
        [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
        [NodeOutputKeyEnum.answerText]: finalAnswer,
        [NodeOutputKeyEnum.reasoningText]: reasoningText,
        [NodeOutputKeyEnum.rawResponse]: {
          ...baseRawResponse,
          plan: planQueue.map((s) => s.title),
          pastSteps: pastSteps.map((p) => ({ step: p.step.title, result: p.result })),
          finalDecision: 'response',
          planSteps: todoAllSteps,
          workingMemory,
          replanHistory,
          usage: { totalTokens, totalRunTimes },
          toolDetail,
          toolPreviewItems: previewToolItems
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
                { role: ChatCompletionRequestMessageRoleEnum.System, content: systemPrompt || '' },
                { role: ChatCompletionRequestMessageRoleEnum.User, content: userChatInput },
                { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: finalAnswer }
              ],
              false
            ),
            10000
          ),
          toolDetail
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
          { moduleName: name, totalPoints, model: modelName, tokens: totalTokens },
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

      trace.push({
        at: nowIso(),
        type: 'plan',
        message: 'replanned remaining steps',
        data: { changeSummary: decision.changeSummary, reason: decision.reason, afterRemaining }
      });
    }

    if (planQueue.length === 0 && getDoneCount() < todoAllSteps.length) {
      planQueue = getRemainingTodoSteps();
    }

    pushTodoSnapshot();
  }

  // Fallback synthesis
  const fallbackAnswer =
    (
      await (async () => {
        if (pastSteps.length === 0) return '';
        const synthesized = await callFinalSynthesis({
          modelKey,
          systemPrompt,
          goal: userChatInput,
          workingMemory,
          pastSteps,
          enableReasoning,
          reasoningEffort
        });
        totalTokens += synthesized.tokens;
        totalRunTimes += 1;
        return synthesized.text;
      })()
    ).trim() ||
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
            todo: { content: todoContent, done: getDoneCount(), total: todoAllSteps.length }
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

  trace.push({ at: nowIso(), type: 'report', message: 'fallback', data: { fallbackAnswer } });

  return {
    [DispatchNodeResponseKeyEnum.runTimes]: totalRunTimes,
    [NodeOutputKeyEnum.answerText]: fallbackAnswer,
    [NodeOutputKeyEnum.reasoningText]: reasoningText,
    [NodeOutputKeyEnum.rawResponse]: {
      ...baseRawResponse,
      plan: planQueue.map((s) => s.title),
      pastSteps: pastSteps.map((p) => ({ step: p.step.title, result: p.result })),
      finalDecision: 'fallback',
      planSteps: todoAllSteps,
      workingMemory,
      replanHistory,
      usage: { totalTokens, totalRunTimes },
      toolDetail,
      toolPreviewItems: previewToolItems
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
      { moduleName: name, totalPoints, model: modelName, tokens: totalTokens },
      ...nodeUsages
    ]
  };
}
