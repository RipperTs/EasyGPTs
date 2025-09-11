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

// 获取所有活跃的LLM模型
export async function getAllLLMModels(teamId?: string): Promise<LLMModelSchema[]> {
  try {
    // 如果有缓存且有效，直接返回
    if (isCacheValid() && modelCache?.llmModels) {
      return modelCache.llmModels;
    }

    const filter: any = { isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const models = await MongoLLMModel.find(filter).sort({ updateTime: -1 }).lean();

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

// 根据功能获取LLM模型
export async function getLLMModelsByFeature(
  feature: keyof LLMModelSchema,
  teamId?: string
): Promise<LLMModelSchema[]> {
  const allModels = await getAllLLMModels(teamId);
  return allModels.filter((model) => model[feature] === true);
}

// 获取支持数据集处理的模型
export async function getDatasetProcessModels(teamId?: string): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('datasetProcess', teamId);
}

// 获取支持分类的模型
export async function getClassifyModels(teamId?: string): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInClassify', teamId);
}

// 获取支持内容提取的模型
export async function getExtractFieldsModels(teamId?: string): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInExtractFields', teamId);
}

// 获取支持工具调用的模型
export async function getToolCallModels(teamId?: string): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInToolCall', teamId);
}

// 获取支持查询扩展的模型
export async function getQueryExtensionModels(teamId?: string): Promise<LLMModelSchema[]> {
  return getLLMModelsByFeature('usedInQueryExtension', teamId);
}

// 获取特定LLM模型
export async function getLLMModel(
  modelName: string,
  teamId?: string
): Promise<LLMModelSchema | null> {
  const allModels = await getAllLLMModels(teamId);
  return allModels.find((model) => model.model === modelName) || null;
}

// 获取所有重排模型
export async function getAllReRankModels(teamId?: string): Promise<ReRankModelSchema[]> {
  try {
    if (isCacheValid() && modelCache?.reRankModels) {
      return modelCache.reRankModels;
    }

    const filter: any = { isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const models = await MongoReRankModel.find(filter).sort({ updateTime: -1 }).lean();

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

// 获取所有TTS模型
export async function getAllTTSModels(teamId?: string): Promise<TTSModelSchema[]> {
  try {
    if (isCacheValid() && modelCache?.ttsModels) {
      return modelCache.ttsModels;
    }

    const filter: any = { isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const models = await MongoTTSModel.find(filter).sort({ updateTime: -1 }).lean();

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

// 获取Whisper模型
export async function getWhisperModel(teamId?: string): Promise<WhisperModelSchema | null> {
  try {
    if (isCacheValid() && modelCache?.whisperModels && modelCache.whisperModels.length > 0) {
      return modelCache.whisperModels[0];
    }

    const filter: any = { isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const model = await MongoWhisperModel.findOne(filter).lean();

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

// 获取OCR模型
export async function getOCRModel(teamId?: string): Promise<OCRModelSchema | null> {
  try {
    if (isCacheValid() && modelCache?.ocrModels && modelCache.ocrModels.length > 0) {
      return modelCache.ocrModels[0];
    }

    const filter: any = { isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const model = await MongoOCRModel.findOne(filter).lean();

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

// 获取系统配置
export async function getSystemConfig(configKey: string, teamId?: string): Promise<any> {
  try {
    if (isCacheValid() && modelCache?.systemConfigs && modelCache.systemConfigs[configKey]) {
      return modelCache.systemConfigs[configKey];
    }

    const filter: any = { configKey, isActive: true };
    if (teamId) {
      filter.teamId = teamId;
    }

    const config = await MongoSystemConfig.findOne(filter).lean();

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

// 获取前端配置
export async function getFeConfigs(teamId?: string): Promise<any> {
  return getSystemConfig('feConfigs', teamId);
}

// 获取系统环境配置
export async function getSystemEnv(teamId?: string): Promise<any> {
  return getSystemConfig('systemEnv', teamId);
}

// 获取向量模型配置
export async function getVectorModels(teamId?: string): Promise<any[]> {
  const vectorModels = await getSystemConfig('vectorModels', teamId);
  return vectorModels || [];
}

// 更新缓存（当模型配置发生变化时调用）
export function updateModelCache(): void {
  clearModelCache();
}

// 获取兼容的旧格式配置（用于过渡期间）
export async function getLegacyConfig(teamId?: string): Promise<any> {
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
      getAllLLMModels(teamId),
      getAllReRankModels(teamId),
      getAllTTSModels(teamId),
      getWhisperModel(teamId),
      getOCRModel(teamId),
      getFeConfigs(teamId),
      getSystemEnv(teamId),
      getVectorModels(teamId)
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
