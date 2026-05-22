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
