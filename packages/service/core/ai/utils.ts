import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';

export const computedMaxToken = ({
  maxToken,
  model
}: {
  maxToken: number;
  model: LLMModelItemType;
}) => {
  if (maxToken === undefined) return;

  maxToken = Math.min(maxToken, model.maxResponse);
  return maxToken;
};

// FastGPT temperature range: [0,10], ai temperature:[0,2],{0,1]……
export const computedTemperature = ({
  model,
  temperature
}: {
  model: LLMModelItemType;
  temperature: number;
}) => {
  if (typeof model.maxTemperature !== 'number') return undefined;

  temperature = +(model.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);

  return temperature;
};

const validReasoningEfforts = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const removeUndefinedValues = <T extends Record<string, unknown>>(data: T): T => {
  return Object.entries(data).reduce<Record<string, unknown>>((result, [key, value]) => {
    if (value !== undefined) result[key] = value;
    return result;
  }, {}) as T;
};

const normalizeReasoningEffort = (value?: string) => {
  const effort = value?.trim();
  return effort && validReasoningEfforts.has(effort) ? effort : undefined;
};

const isOpenAIReasoningModel = (modelName: string) => {
  const normalized = modelName.trim().toLowerCase();
  return /^(o\d|o\d-|o\d\.|o[134](?:-|$)|gpt-5(?:[.-]|$))/.test(normalized);
};

export const sanitizeReasoningChatRequestBody = <T extends Record<string, unknown>>({
  requestBody,
  model,
  reasoningEffort
}: {
  requestBody: T;
  model: LLMModelItemType;
  reasoningEffort?: string;
}): T => {
  const nextBody: Record<string, unknown> = { ...requestBody };
  const requestReasoningEffort = normalizeReasoningEffort(
    typeof nextBody.reasoning_effort === 'string' ? nextBody.reasoning_effort : reasoningEffort
  );

  delete nextBody.reasoning_effort;
  if (model.reasoning && requestReasoningEffort) {
    nextBody.reasoning_effort = requestReasoningEffort;
  }

  const useOpenAIReasoningCompatibility = model.reasoning && isOpenAIReasoningModel(model.model);

  if (!model.reasoning || (!requestReasoningEffort && !useOpenAIReasoningCompatibility)) {
    return removeUndefinedValues(nextBody) as T;
  }

  delete nextBody.temperature;
  delete nextBody.top_p;
  delete nextBody.presence_penalty;
  delete nextBody.frequency_penalty;

  if (useOpenAIReasoningCompatibility) {
    const maxCompletionTokens = nextBody.max_tokens ?? nextBody.max_completion_tokens;
    delete nextBody.max_tokens;
    if (typeof maxCompletionTokens === 'number') {
      nextBody.max_completion_tokens = maxCompletionTokens;
    }
  }

  return removeUndefinedValues(nextBody) as T;
};

export const buildChatCompletionRequestBody = ({
  model,
  messages,
  temperature,
  maxToken,
  stream,
  reasoningEffort,
  extraBody = {}
}: {
  model: LLMModelItemType;
  messages: ChatCompletionMessageParam[];
  temperature?: number;
  maxToken?: number;
  stream: boolean;
  reasoningEffort?: string;
  extraBody?: Record<string, unknown>;
}) => {
  const defaultConfig = isRecord(model.defaultConfig) ? model.defaultConfig : {};
  const computedMaxTokens =
    typeof maxToken === 'number' ? computedMaxToken({ model, maxToken }) : undefined;

  return sanitizeReasoningChatRequestBody({
    requestBody: {
      ...defaultConfig,
      model: model.model,
      temperature:
        typeof temperature === 'number' ? computedTemperature({ model, temperature }) : undefined,
      ...(typeof computedMaxTokens === 'number' ? { max_tokens: computedMaxTokens } : {}),
      stream,
      messages,
      ...extraBody
    },
    model,
    reasoningEffort
  });
};

export type ThinkTagParseResult = {
  text: string;
  reasoning: string;
};

const THINK_OPEN_TAG = '<think>';
const THINK_CLOSE_TAG = '</think>';

const getPartialThinkTagLength = (text: string, tag: string) => {
  const lowerText = text.toLowerCase();
  const maxLen = Math.min(tag.length - 1, lowerText.length);

  for (let len = maxLen; len > 0; len--) {
    if (tag.startsWith(lowerText.slice(-len))) return len;
  }

  return 0;
};

export const createThinkTagStreamParser = () => {
  let pending = '';
  let inThink = false;

  const parse = (chunk = '', flush = false): ThinkTagParseResult => {
    pending += chunk;

    let text = '';
    let reasoning = '';

    while (pending) {
      const tag = inThink ? THINK_CLOSE_TAG : THINK_OPEN_TAG;
      const tagIndex = pending.toLowerCase().indexOf(tag);

      if (tagIndex >= 0) {
        const content = pending.slice(0, tagIndex);
        if (inThink) {
          reasoning += content;
        } else {
          text += content;
        }

        pending = pending.slice(tagIndex + tag.length);
        inThink = !inThink;
        continue;
      }

      const keepLen = flush ? 0 : getPartialThinkTagLength(pending, tag);
      const emitLen = pending.length - keepLen;

      if (emitLen <= 0) break;

      const content = pending.slice(0, emitLen);
      if (inThink) {
        reasoning += content;
      } else {
        text += content;
      }
      pending = pending.slice(emitLen);
    }

    return {
      text,
      reasoning
    };
  };

  return {
    push: (chunk: string) => parse(chunk),
    flush: () => parse('', true)
  };
};

export const splitThinkTagContent = (content: string): ThinkTagParseResult => {
  const parser = createThinkTagStreamParser();
  const parsed = parser.push(content);
  const rest = parser.flush();

  return {
    text: `${parsed.text}${rest.text}`,
    reasoning: `${parsed.reasoning}${rest.reasoning}`
  };
};
