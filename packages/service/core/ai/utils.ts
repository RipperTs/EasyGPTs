import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';

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

export const sanitizeReasoningChatRequestBody = <T extends Record<string, unknown>>({
  requestBody,
  model,
  reasoningEffort
}: {
  requestBody: T;
  model: LLMModelItemType;
  reasoningEffort?: string;
}): T => {
  const nextBody = { ...requestBody };
  if (
    'reasoning_effort' in nextBody &&
    (typeof nextBody.reasoning_effort !== 'string' || !nextBody.reasoning_effort.trim())
  ) {
    delete nextBody.reasoning_effort;
  }

  const requestReasoningEffort =
    typeof nextBody.reasoning_effort === 'string' && nextBody.reasoning_effort.trim()
      ? nextBody.reasoning_effort
      : reasoningEffort;

  if (!model.reasoning || !requestReasoningEffort) return nextBody as T;

  delete nextBody.temperature;
  delete nextBody.top_p;
  delete nextBody.presence_penalty;
  delete nextBody.frequency_penalty;

  return nextBody;
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
