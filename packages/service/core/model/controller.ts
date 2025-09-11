import {
  MongoLLMModel,
  MongoReRankModel,
  MongoTTSModel,
  MongoWhisperModel,
  MongoOCRModel,
  MongoSystemConfig
} from './schema';
import type {
  LLMModelSchema,
  ReRankModelSchema,
  TTSModelSchema,
  WhisperModelSchema,
  OCRModelSchema,
  SystemConfigSchema
} from '@fastgpt/global/core/model/type.d';

// 缓存对象
interface ModelCache {
  llmModels: LLMModelSchema[];
  reRankModels: ReRankModelSchema[];
  ttsModels: TTSModelSchema[];
  whisperModels: WhisperModelSchema[];
  ocrModels: OCRModelSchema[];
  systemConfigs: Record<string, any>;
  lastUpdated: Date;
}

let modelCache: ModelCache | null = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

// 检查缓存是否有效
function isCacheValid(): boolean {
  if (!modelCache) return false;
  const now = new Date();
  return now.getTime() - modelCache.lastUpdated.getTime() < CACHE_DURATION;
}

// 清除缓存
export function clearModelCache(): void {
  modelCache = null;
}

// 获取所有活跃的LLM模型（系统级）
export async function getAllLLMModels(): Promise<LLMModelSchema[]> {
  try {
    // 如果有缓存且有效，直接返回
    if (isCacheValid() && modelCache?.llmModels) {
      return modelCache.llmModels;
    }

    const models = await MongoLLMModel.find({ isActive: true })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    // 更新缓存
    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    modelCache.llmModels = models;
    modelCache.lastUpdated = new Date();

    return models;
  } catch (error) {
    console.error('获取LLM模型失败:', error);
    return [];
  }
}

// 根据功能获取LLM模型（系统级）
export async function getLLMModelsByFeature(
  feature: keyof LLMModelSchema
): Promise<LLMModelSchema[]> {
  const allModels = await getAllLLMModels();
  return allModels.filter((model) => model[feature] === true);
}

// 获取支持数据集处理的模型（系统级）
export async function getDatasetProcessModels(): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('datasetProcess');
}

// 获取支持分类的模型（系统级）
export async function getClassifyModels(): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInClassify');
}

// 获取支持内容提取的模型（系统级）
export async function getExtractFieldsModels(): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInExtractFields');
}

// 获取支持工具调用的模型（系统级）
export async function getToolCallModels(): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInToolCall');
}

// 获取支持查询扩展的模型（系统级）
export async function getQueryExtensionModels(): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInQueryExtension');
}

// 获取特定LLM模型（系统级）
export async function getLLMModel(modelName: string): Promise<LLMModelSchema | null> {
  const allModels = await getAllLLMModels();
  return allModels.find((model) => model.model === modelName) || null;
}

// 获取所有重排模型（系统级）
export async function getAllReRankModels(): Promise<ReRankModelSchema[]> {
  try {
    if (isCacheValid() && modelCache?.reRankModels) {
      return modelCache.reRankModels;
    }

    const models = await MongoReRankModel.find({ isActive: true })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    modelCache.reRankModels = models;
    modelCache.lastUpdated = new Date();

    return models;
  } catch (error) {
    console.error('获取重排模型失败:', error);
    return [];
  }
}

// 获取所有TTS模型（系统级）
export async function getAllTTSModels(): Promise<TTSModelSchema[]> {
  try {
    if (isCacheValid() && modelCache?.ttsModels) {
      return modelCache.ttsModels;
    }

    const models = await MongoTTSModel.find({ isActive: true })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    modelCache.ttsModels = models;
    modelCache.lastUpdated = new Date();

    return models;
  } catch (error) {
    console.error('获取TTS模型失败:', error);
    return [];
  }
}

// 获取Whisper模型（系统级）
export async function getWhisperModel(): Promise<WhisperModelSchema | null> {
  try {
    if (isCacheValid() && modelCache?.whisperModels && modelCache.whisperModels.length > 0) {
      return modelCache.whisperModels[0];
    }

    const model = await MongoWhisperModel.findOne({ isActive: true }).lean();

    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    modelCache.whisperModels = model ? [model] : [];
    modelCache.lastUpdated = new Date();

    return model;
  } catch (error) {
    console.error('获取Whisper模型失败:', error);
    return null;
  }
}

// 获取OCR模型（系统级）
export async function getOCRModel(): Promise<OCRModelSchema | null> {
  try {
    if (isCacheValid() && modelCache?.ocrModels && modelCache.ocrModels.length > 0) {
      return modelCache.ocrModels[0];
    }

    const model = await MongoOCRModel.findOne({ isActive: true }).lean();

    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    modelCache.ocrModels = model ? [model] : [];
    modelCache.lastUpdated = new Date();

    return model;
  } catch (error) {
    console.error('获取OCR模型失败:', error);
    return null;
  }
}

// 获取系统配置（系统级）
export async function getSystemConfig(configKey: string): Promise<any> {
  try {
    if (isCacheValid() && modelCache?.systemConfigs && modelCache.systemConfigs[configKey]) {
      return modelCache.systemConfigs[configKey];
    }

    const config = await MongoSystemConfig.findOne({ configKey, isActive: true }).lean();

    if (!modelCache) {
      modelCache = {
        llmModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }

    if (config) {
      modelCache.systemConfigs[configKey] = config.configValue;
    }
    modelCache.lastUpdated = new Date();

    return config?.configValue || null;
  } catch (error) {
    console.error(`获取系统配置 ${configKey} 失败:`, error);
    return null;
  }
}

// 获取前端配置（系统级）
export async function getFeConfigs(): Promise<any> {
  return getSystemConfig('feConfigs');
}

// 获取系统环境配置（系统级）
export async function getSystemEnv(): Promise<any> {
  return getSystemConfig('systemEnv');
}

// 获取向量模型配置（系统级）
export async function getVectorModels(): Promise<any[]> {
  const vectorModels = await getSystemConfig('vectorModels');
  return vectorModels || [];
}

// 更新缓存（当模型配置发生变化时调用）
export function updateModelCache(): void {
  clearModelCache();
}

// 获取兼容的旧格式配置（用于过渡期间，系统级）
export async function getLegacyConfig(): Promise<any> {
  try {
    const [
      llmModels,
      reRankModels,
      ttsModels,
      whisperModel,
      ocrModel,
      feConfigs,
      systemEnv,
      vectorModels
    ] = await Promise.all([
      getAllLLMModels(),
      getAllReRankModels(),
      getAllTTSModels(),
      getWhisperModel(),
      getOCRModel(),
      getFeConfigs(),
      getSystemEnv(),
      getVectorModels()
    ]);

    return {
      llmModels: llmModels.map((model) => ({
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        maxContext: model.maxContext,
        maxResponse: model.maxResponse,
        quoteMaxToken: model.quoteMaxToken,
        maxTemperature: model.maxTemperature,
        charsPointsPrice: model.charsPointsPrice,
        censor: model.censor,
        vision: model.vision,
        reasoning: model.reasoning,
        datasetProcess: model.datasetProcess,
        usedInClassify: model.usedInClassify,
        usedInExtractFields: model.usedInExtractFields,
        usedInToolCall: model.usedInToolCall,
        usedInQueryExtension: model.usedInQueryExtension,
        toolChoice: model.toolChoice,
        functionCall: model.functionCall,
        customCQPrompt: model.customCQPrompt,
        customExtractPrompt: model.customExtractPrompt,
        defaultSystemChatPrompt: model.defaultSystemChatPrompt,
        defaultConfig: model.defaultConfig
      })),
      reRankModels: reRankModels.map((model) => ({
        model: model.model,
        name: model.name,
        charsPointsPrice: model.charsPointsPrice,
        requestUrl: model.requestUrl,
        requestAuth: model.requestAuth
      })),
      audioSpeechModels: ttsModels.map((model) => ({
        model: model.model,
        name: model.name,
        charsPointsPrice: model.charsPointsPrice,
        voices: model.voices
      })),
      whisperModel: whisperModel
        ? {
            model: whisperModel.model,
            name: whisperModel.name,
            charsPointsPrice: whisperModel.charsPointsPrice
          }
        : null,
      ocrModel: ocrModel
        ? {
            model: ocrModel.model,
            name: ocrModel.name,
            charsPointsPrice: ocrModel.charsPointsPrice,
            requestUrl: ocrModel.requestUrl,
            requestAuth: ocrModel.requestAuth
          }
        : null,
      feConfigs: feConfigs || {},
      systemEnv: systemEnv || {},
      vectorModels: vectorModels || []
    };
  } catch (error) {
    console.error('获取兼容配置失败:', error);
    return {};
  }
}
