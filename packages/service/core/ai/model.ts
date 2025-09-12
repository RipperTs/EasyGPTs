import { MongoReRankModel } from '../model/rerankSchema';

export const getLLMModel = (model?: string) => {
  return (
    global.llmModels.find((item) => item.model === model || item.name === model) ??
    global.llmModels[0]
  );
};
export const getDatasetModel = (model?: string) => {
  return (
    global.llmModels
      ?.filter((item) => item.datasetProcess)
      ?.find((item) => item.model === model || item.name === model) ?? global.llmModels[0]
  );
};

export const getVectorModel = (model?: string) => {
  return (
    global.vectorModels.find((item) => item.model === model || item.name === model) ||
    global.vectorModels[0]
  );
};

export function getAudioSpeechModel(model?: string) {
  return (
    global.audioSpeechModels.find((item) => item.model === model || item.name === model) ||
    global.audioSpeechModels[0]
  );
}

export function getWhisperModel(model?: string) {
  return global.whisperModel;
}

export async function getReRankModel(model?: string) {
  if (model) {
    return await MongoReRankModel.findOne({
      model: model,
      isActive: true
    });
  }
  return await MongoReRankModel.findOne({ isActive: true }, {}, { sort: { updateTime: -1 } });
}

export function getOcrModel(model?: string) {
  return global.ocrModel;
}

export enum ModelTypeEnum {
  llm = 'llm',
  vector = 'vector',
  audioSpeech = 'audioSpeech',
  whisper = 'whisper',
  rerank = 'rerank',
  ocr = 'ocr'
}
export const getModelMap = {
  [ModelTypeEnum.llm]: getLLMModel,
  [ModelTypeEnum.vector]: getVectorModel,
  [ModelTypeEnum.audioSpeech]: getAudioSpeechModel,
  [ModelTypeEnum.whisper]: getWhisperModel,
  [ModelTypeEnum.rerank]: getReRankModel,
  [ModelTypeEnum.ocr]: getOcrModel
};
