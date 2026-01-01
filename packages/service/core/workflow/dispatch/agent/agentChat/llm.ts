import type { ChatCompletion, ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getAIApi } from '../../../../ai/config';
import { getLLMModel } from '../../../../ai/model';
import { computedMaxToken, computedTemperature } from '../../../../ai/utils';
import { countGptMessagesTokens } from '../../../../../common/string/tiktoken/index';
import { extractFirstJsonValue, getRecord } from './utils';
import json5 from 'json5';

export const getReasoningContent = (params: {
  enableReasoning: boolean;
  resp: ChatCompletion;
}): string => {
  const { enableReasoning, resp } = params;
  if (!enableReasoning) return '';

  // Some providers expose reasoning in reasoning_content (not standardized).
  const msg = resp.choices?.[0]?.message as unknown;
  const obj = getRecord(msg) || {};
  const reasoning = typeof obj.reasoning_content === 'string' ? obj.reasoning_content : '';
  return reasoning || '';
};

export const callChatCompletionText = async (params: {
  modelKey: string;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxToken?: number;
  timeout?: number;
  enableReasoning: boolean;
  reasoningEffort?: string;
  abortSignal?: AbortSignal;
}): Promise<{ text: string; tokens: number; reasoningText: string }> => {
  const {
    modelKey,
    messages,
    temperature = 0.2,
    maxToken,
    timeout = 60000,
    enableReasoning,
    reasoningEffort,
    abortSignal
  } = params;

  const model = getLLMModel(modelKey);
  if (!model) return { text: '', tokens: 0, reasoningText: '' };

  const ai = getAIApi({ timeout });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature }),
    ...(typeof maxToken === 'number' ? { max_tokens: computedMaxToken({ model, maxToken }) } : {}),
    stream: false,
    messages,
    ...(enableReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0],
    abortSignal ? { signal: abortSignal } : undefined
  )) as unknown as ChatCompletion;

  const text = (resp.choices?.[0]?.message?.content || '').trim();
  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: text
  };
  const tokens =
    resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

  const reasoningText = getReasoningContent({ enableReasoning, resp });

  return { text, tokens, reasoningText };
};

export const callChatCompletionJson = async <T extends Record<string, unknown>>(params: {
  modelKey: string;
  messages: ChatCompletionMessageParam[];
  timeout?: number;
  enableReasoning: boolean;
  reasoningEffort?: string;
  maxToken?: number;
  temperature?: number;
  abortSignal?: AbortSignal;
}): Promise<{ json: T | null; tokens: number; reasoningText: string; rawText: string }> => {
  const {
    modelKey,
    messages,
    timeout = 60000,
    enableReasoning,
    reasoningEffort,
    maxToken,
    temperature = 0,
    abortSignal
  } = params;
  const model = getLLMModel(modelKey);
  if (!model) return { json: null, tokens: 0, reasoningText: '', rawText: '' };

  const ai = getAIApi({ timeout });
  const requestBody: Record<string, unknown> = {
    ...model.defaultConfig,
    model: model.model,
    temperature: computedTemperature({ model, temperature }),
    ...(typeof maxToken === 'number' ? { max_tokens: computedMaxToken({ model, maxToken }) } : {}),
    stream: false,
    messages,
    ...(enableReasoning && reasoningEffort ? { reasoning_effort: reasoningEffort } : {})
  };

  const resp = (await ai.chat.completions.create(
    requestBody as unknown as Parameters<typeof ai.chat.completions.create>[0],
    abortSignal ? { signal: abortSignal } : undefined
  )) as unknown as ChatCompletion;

  const rawText = resp.choices?.[0]?.message?.content || '';
  const assistantMsg: ChatCompletionMessageParam = {
    role: ChatCompletionRequestMessageRoleEnum.Assistant,
    content: rawText
  };
  const tokens =
    resp.usage?.total_tokens ?? (await countGptMessagesTokens(messages.concat(assistantMsg)));

  const reasoningText = getReasoningContent({ enableReasoning, resp });

  const jsonStr = extractFirstJsonValue(rawText) || rawText.trim();
  try {
    const parsed = json5.parse(jsonStr) as unknown;
    const obj = getRecord(parsed);
    if (!obj) return { json: null, tokens, reasoningText, rawText };
    return { json: obj as T, tokens, reasoningText, rawText };
  } catch {
    return { json: null, tokens, reasoningText, rawText };
  }
};
