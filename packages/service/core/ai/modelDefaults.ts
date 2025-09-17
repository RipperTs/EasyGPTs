import type { LLMModelItemType, VectorModelItemType } from '@fastgpt/global/core/ai/model.d';

export const DEFAULT_VECTOR_MODEL: VectorModelItemType = {
  model: '',
  name: '',
  defaultToken: 512,
  charsPointsPrice: 0,
  maxToken: 3000,
  weight: 100
};

export const DEFAULT_LLM_MODEL: LLMModelItemType = {
  model: '',
  name: '',
  avatar: '',
  maxContext: 16000,
  maxResponse: 4000,
  quoteMaxToken: 13000,
  charsPointsPrice: 0,
  functionCall: false,
  toolChoice: false,
  customCQPrompt: '',
  customExtractPrompt: '',
  defaultSystemChatPrompt: ''
};
