import type {
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  WhisperModelType,
  ReRankModelItemType,
  PdfModelItemType
} from '@fastgpt/global/core/ai/model.d';

import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';

export type InitDateResponse = {
  llmModels: LLMModelItemType[];
  vectorModels: VectorModelItemType[];
  audioSpeechModels: AudioSpeechModels[];
  reRankModels: ReRankModelItemType[];
  whisperModel: WhisperModelType;
  ocrModels: { model: string; name: string; charsPointsPrice: number; avatar?: string }[];
  pdfModels: PdfModelItemType[];
  feConfigs: FastGPTFeConfigsType;
  subPlans?: SubPlanType;
  systemVersion: string;
};
