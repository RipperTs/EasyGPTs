import { MongoReRankModel } from '../model/rerankSchema';
import { getDefaultEmbeddingModel, getEmbeddingModel } from '../model/controller';

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

// 异步版本的向量模型获取函数（用于需要直接从数据库获取的场景）
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

// 兼容的同步版本，从全局变量获取，用于过渡期间
export const getVectorModelSync = (model?: string) => {
  // 如果全局变量还存在，使用旧逻辑
  if (global.vectorModels && global.vectorModels.length > 0) {
    return (
      global.vectorModels.find((item) => item.model === model || item.name === model) ||
      global.vectorModels[0]
    );
  }
  return null;
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
