import { MongoReRankModel } from '../model/rerankSchema';
import {
  getDefaultEmbeddingModel,
  getEmbeddingModel,
  getAllLLMModels,
  getLLMModel as getLLMModelFromDB,
  getDatasetProcessModels,
  getAllTTSModels,
  getWhisperModel as getWhisperModelFromDB,
  getOCRModel as getOCRModelFromDB
} from '../model/controller';
import { DEFAULT_LLM_MODEL, DEFAULT_VECTOR_MODEL } from './modelDefaults';

// 获取LLM模型（异步版本 - 从数据库）
export const getLLMModelAsync = async (model?: string) => {
  const models = await getAllLLMModels();
  return models.find((item) => item.model === model || item.name === model) || models[0];
};

// 获取LLM模型（同步版本 - 从全局变量，向后兼容）
export const getLLMModel = (model?: string) => {
  // 如果全局变量还存在，使用旧逻辑
  if (global.llmModels && global.llmModels.length > 0) {
    return (
      global.llmModels.find((item) => item.model === model || item.name === model) ??
      global.llmModels[0]
    );
  }
  // 如果全局变量不存在，返回null或抛出错误
  console.warn('getLLMModel: 全局变量不存在，请使用 getLLMModelAsync');
  return null;
};

// 获取LLM模型，带默认值
export const getLLMModelWithDefault = (model?: string) => {
  return getLLMModel(model) || DEFAULT_LLM_MODEL;
};

// 获取数据集处理模型（异步版本 - 从数据库）
export const getDatasetModelAsync = async (model?: string) => {
  const models = await getDatasetProcessModels();
  return models.find((item) => item.model === model || item.name === model) || models[0];
};

// 获取数据集处理模型（同步版本 - 从全局变量，向后兼容）
export const getDatasetModel = (model?: string) => {
  if (global.llmModels && global.llmModels.length > 0) {
    return (
      global.llmModels
        ?.filter((item) => item.datasetProcess)
        ?.find((item) => item.model === model || item.name === model) ?? global.llmModels[0]
    );
  }
  console.warn('getDatasetModel: 全局变量不存在，请使用 getDatasetModelAsync');
  return null;
};

// 获取向量模型（异步版本 - 从数据库）
export const getVectorModelAsync = async (model?: string) => {
  if (model) {
    const embeddingModel = await getEmbeddingModel(model);
    if (embeddingModel) {
      // 转换为旧格式兼容
      return {
        model: embeddingModel.model,
        name: embeddingModel.name,
        avatar: embeddingModel.avatar,
        charsPointsPrice: embeddingModel.charsPointsPrice,
        defaultToken: embeddingModel.defaultToken,
        maxToken: embeddingModel.maxToken,
        weight: embeddingModel.weight,
        defaultConfig: embeddingModel.defaultConfig,
        dbConfig: embeddingModel.dbConfig,
        queryConfig: embeddingModel.queryConfig
      };
    }
  }

  // 获取默认模型
  const defaultModel = await getDefaultEmbeddingModel();
  if (defaultModel) {
    return {
      model: defaultModel.model,
      name: defaultModel.name,
      avatar: defaultModel.avatar,
      charsPointsPrice: defaultModel.charsPointsPrice,
      defaultToken: defaultModel.defaultToken,
      maxToken: defaultModel.maxToken,
      weight: defaultModel.weight,
      defaultConfig: defaultModel.defaultConfig,
      dbConfig: defaultModel.dbConfig,
      queryConfig: defaultModel.queryConfig
    };
  }

  return null;
};

// 获取向量模型（同步版本 - 从全局变量，向后兼容）
export const getVectorModel = (model?: string) => {
  if (global.vectorModels && global.vectorModels.length > 0) {
    return (
      global.vectorModels.find((item) => item.model === model || item.name === model) ||
      global.vectorModels[0]
    );
  }
  console.warn('getVectorModel: 全局变量不存在，请使用 getVectorModelAsync');
  return null;
};

// 获取向量模型，带默认值
export const getVectorModelWithDefault = (model?: string) => {
  return getVectorModel(model) || DEFAULT_VECTOR_MODEL;
};

// 兼容的同步版本，从全局变量获取，用于过渡期间（将被弃用）
export const getVectorModelSync = getVectorModel;

// 获取TTS模型（异步版本 - 从数据库）
export const getAudioSpeechModelAsync = async (model?: string) => {
  const models = await getAllTTSModels();
  return models.find((item) => item.model === model || item.name === model) || models[0];
};

// 获取TTS模型（同步版本 - 从全局变量，向后兼容）
export function getAudioSpeechModel(model?: string) {
  if (global.audioSpeechModels && global.audioSpeechModels.length > 0) {
    return (
      global.audioSpeechModels.find((item) => item.model === model || item.name === model) ||
      global.audioSpeechModels[0]
    );
  }
  console.warn('getAudioSpeechModel: 全局变量不存在，请使用 getAudioSpeechModelAsync');
  return null;
}

// 获取Whisper模型（异步版本 - 从数据库）
export const getWhisperModelAsync = async (model?: string) => {
  return await getWhisperModelFromDB();
};

// 获取Whisper模型（同步版本 - 从全局变量，向后兼容）
export function getWhisperModel(model?: string) {
  if (global.whisperModel) {
    return global.whisperModel;
  }
  console.warn('getWhisperModel: 全局变量不存在，请使用 getWhisperModelAsync');
  return null;
}

// 获取重排模型（从数据库）
export async function getReRankModel(model?: string) {
  if (model) {
    return await MongoReRankModel.findOne({
      model: model,
      isActive: true
    });
  }
  return await MongoReRankModel.findOne({ isActive: true }, {}, { sort: { updateTime: -1 } });
}

// 获取OCR模型（异步版本 - 从数据库）
export const getOcrModelAsync = async (model?: string) => {
  return await getOCRModelFromDB();
};

// 获取OCR模型（同步版本 - 从全局变量，向后兼容）
export function getOcrModel(model?: string) {
  if (global.ocrModel) {
    return global.ocrModel;
  }
  console.warn('getOcrModel: 全局变量不存在，请使用 getOcrModelAsync');
  return null;
}

export enum ModelTypeEnum {
  llm = 'llm',
  vector = 'vector',
  audioSpeech = 'audioSpeech',
  whisper = 'whisper',
  rerank = 'rerank',
  ocr = 'ocr',
  embedding = 'embedding'
}
export const getModelMap = {
  [ModelTypeEnum.llm]: getLLMModel,
  [ModelTypeEnum.vector]: getVectorModel,
  [ModelTypeEnum.audioSpeech]: getAudioSpeechModel,
  [ModelTypeEnum.whisper]: getWhisperModel,
  [ModelTypeEnum.rerank]: getReRankModel,
  [ModelTypeEnum.ocr]: getOcrModel,
  [ModelTypeEnum.embedding]: getVectorModelSync
};
