import type {
  ChatHistoryItemResType,
  AIChatItemValueItemType
} from '@fastgpt/global/core/chat/type';

export type AgentOrchestrationMode = 'plan_execute' | 'react';
export type AgentToolAccess = 'readOnly' | 'standard' | 'full';
export type ToolPreferenceMode = 'none' | 'light' | 'strong';

export type AgentPlanStep = {
  id: string;
  title: string;
  intent?: string;
  toolHints?: string[];
  expectedOutput?: string;
  acceptanceCriteria?: string[];
  inputs?: Record<string, unknown>;
};

export type AgentPastStep = {
  step: AgentPlanStep;
  result: string;
  toolText?: string;
  memory?: {
    facts?: string[];
    numbers?: Array<{ name: string; value: string; unit?: string }>;
    assumptions?: string[];
    sources?: string[];
    openQuestions?: string[];
  };
  critic?: {
    score: number;
    issues: string[];
    suggestion: string;
  };
};

export type WorkingMemory = {
  summary: string;
  constraints: string[];
  knownFacts: string[];
  openQuestions: string[];
};

export type ClarifyResult = {
  needClarify: boolean;
  reason: string;
  questions: string[];
  tokens: number;
};

export type CriticResult = {
  score: number;
  issues: string[];
  suggestion: string;
  tokens: number;
};

export type AgentTraceEvent = {
  at: string;
  type: 'mission' | 'scene' | 'policy' | 'plan' | 'act' | 'observe' | 'report' | 'error';
  message: string;
  data?: Record<string, unknown>;
};

export type RawResponse = {
  traceId: string;
  orchestration: {
    mode: AgentOrchestrationMode;
    toolAccess: AgentToolAccess;
    toolPreference: ToolPreferenceMode;
  };
  trace: AgentTraceEvent[];
  plan: string[];
  pastSteps: { step: string; result: string }[];
  finalDecision: 'response' | 'fallback';
  planSteps?: AgentPlanStep[];
  toolsCatalogText?: string;
  toolPolicy?: {
    allowedToolNodeIds: string[];
    blockedToolNodeIds: string[];
    blockedReason: string;
  };
  workingMemory?: WorkingMemory;
  clarify?: {
    needClarify: boolean;
    reason: string;
    questions: string[];
  };
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
  toolDetail?: ChatHistoryItemResType[];
  toolPreviewItems?: AIChatItemValueItemType[];
};
