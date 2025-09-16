import fs from 'fs';
import path from 'path';
import json5 from 'json5';
import { MongoLLMModel } from './llmSchema';
import { MongoEmbeddingModel } from './embeddingSchema';
import { MongoReRankModel } from './rerankSchema';
import { MongoTTSModel } from './ttsSchema';
import { MongoWhisperModel } from './whisperSchema';
import { MongoOCRModel } from './ocrSchema';
import { MongoSystemConfig } from './systemConfigSchema';
import type {
  LLMModelSchema,
  EmbeddingModelSchema,
  ReRankModelSchema,
  TTSModelSchema,
  WhisperModelSchema,
  OCRModelSchema,
  SystemConfigSchema
} from '@fastgpt/global/core/model/type.d';

// 配置文件路径
const CONFIG_FILE_PATH =
  process.env.CONFIG_PATH || path.join(process.cwd(), 'data/config.local.json');

// 配置文件缓存
let configCache: any = null;
let lastLoadTime = 0;
const CONFIG_CACHE_DURATION = 5000; // 5秒缓存

// 模型缓存对象
interface ModelCache {
  llmModels: LLMModelSchema[];
  embeddingModels: EmbeddingModelSchema[];
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
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    // @ts-ignore
    modelCache.llmModels = models;
    modelCache.lastUpdated = new Date();

    // @ts-ignore
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

// 获取所有活跃的向量模型（系统级）
export async function getAllEmbeddingModels(): Promise<EmbeddingModelSchema[]> {
  try {
    // 如果有缓存且有效，直接返回
    if (isCacheValid() && modelCache?.embeddingModels) {
      return modelCache.embeddingModels;
    }

    const models = await MongoEmbeddingModel.find({ isActive: true })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    // 更新缓存
    if (!modelCache) {
      modelCache = {
        llmModels: [],
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    // @ts-ignore
    modelCache.embeddingModels = models;
    modelCache.lastUpdated = new Date();

    // @ts-ignore
    return models;
  } catch (error) {
    console.error('获取向量模型失败:', error);
    return [];
  }
}

// 获取特定向量模型（系统级）
export async function getEmbeddingModel(modelName: string): Promise<EmbeddingModelSchema | null> {
  const allModels = await getAllEmbeddingModels();
  return allModels.find((model) => model.model === modelName || model.name === modelName) || null;
}

// 获取默认向量模型（系统级）
export async function getDefaultEmbeddingModel(): Promise<EmbeddingModelSchema | null> {
  const allModels = await getAllEmbeddingModels();
  return allModels.length > 0 ? allModels[0] : null;
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
        embeddingModels: [],
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
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    // @ts-ignore
    modelCache.ttsModels = models;
    modelCache.lastUpdated = new Date();

    // @ts-ignore
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
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    // @ts-ignore
    modelCache.whisperModels = model ? [model] : [];
    modelCache.lastUpdated = new Date();

    // @ts-ignore
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
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }
    // @ts-ignore
    modelCache.ocrModels = model ? [model] : [];
    modelCache.lastUpdated = new Date();

    // @ts-ignore
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
        embeddingModels: [],
        reRankModels: [],
        ttsModels: [],
        whisperModels: [],
        ocrModels: [],
        systemConfigs: {},
        lastUpdated: new Date()
      };
    }

    if (config) {
      // @ts-ignore
      modelCache.systemConfigs[configKey] = config.configValue;
    }
    modelCache.lastUpdated = new Date();

    // @ts-ignore
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
  const embeddingModels = await getAllEmbeddingModels();
  // 转换为旧格式兼容
  return embeddingModels.map((model) => ({
    model: model.model,
    name: model.name,
    avatar: model.avatar,
    charsPointsPrice: model.charsPointsPrice,
    defaultToken: model.defaultToken,
    maxToken: model.maxToken,
    weight: model.weight,
    defaultConfig: model.defaultConfig,
    dbConfig: model.dbConfig,
    queryConfig: model.queryConfig
  }));
}

// 更新缓存（当模型配置发生变化时调用）
export function updateModelCache(): void {
  clearModelCache();
}

// 读取配置文件
export const loadConfigFile = () => {
  const now = Date.now();
  if (configCache && now - lastLoadTime < CONFIG_CACHE_DURATION) {
    return configCache;
  }

  try {
    const configContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
    configCache = json5.parse(configContent);
    lastLoadTime = now;
    return configCache;
  } catch (error) {
    console.error('读取配置文件失败:', error);
    return null;
  }
};

// 初始化LLM模型配置（系统级）
export const initLLMModels = async () => {
  const config = loadConfigFile();
  if (!config?.llmModels) return;

  const existingModels = await MongoLLMModel.find({});
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.llmModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoLLMModel.create({
        ...modelConfig,
        isActive: true
      });
    }
  }
};

// 初始化ReRank模型配置（系统级）
export const initReRankModels = async () => {
  const config = loadConfigFile();
  if (!config?.reRankModels) return;

  const existingModels = await MongoReRankModel.find({});
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.reRankModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoReRankModel.create({
        ...modelConfig,
        isActive: true
      });
    }
  }
};

// 初始化向量模型配置（系统级）
export const initEmbeddingModels = async () => {
  const config = loadConfigFile();
  if (!config?.vectorModels) return;

  const existingModels = await MongoEmbeddingModel.find({});
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.vectorModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoEmbeddingModel.create({
        ...modelConfig,
        isActive: true
      });
    }
  }
};

// 初始化TTS模型配置（系统级）
export const initTTSModels = async () => {
  const config = loadConfigFile();
  if (!config?.audioSpeechModels) return;

  const existingModels = await MongoTTSModel.find({});
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.audioSpeechModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoTTSModel.create({
        ...modelConfig,
        isActive: true
      });
    }
  }
};

// 初始化Whisper模型配置（系统级）
// 初始化Whisper模型配置（系统级）
// 说明：已取消从本地文件导入 Whisper 配置，改为仅使用数据库中的配置。
export const initWhisperModels = async () => {
  return;
};

// 初始化OCR模型配置（系统级）
// 说明：已取消从本地文件导入 OCR 配置，此处保留空实现以兼容调用。
export const initOCRModels = async () => {
  return;
};

// 初始化系统配置（系统级）
export const initSystemConfigs = async () => {
  const config = loadConfigFile();
  if (!config) return;

  // 初始化系统环境配置
  if (config.systemEnv) {
    const existingConfig = await MongoSystemConfig.findOne({ configKey: 'systemEnv' });
    if (!existingConfig) {
      await MongoSystemConfig.create({
        configKey: 'systemEnv',
        configValue: config.systemEnv,
        description: '系统环境配置',
        isActive: true
      });
    }
  }

  // 初始化前端配置
  if (config.feConfigs) {
    const existingConfig = await MongoSystemConfig.findOne({ configKey: 'feConfigs' });
    if (!existingConfig) {
      await MongoSystemConfig.create({
        configKey: 'feConfigs',
        configValue: config.feConfigs,
        description: '前端配置',
        isActive: true
      });
    }
  }
};

// 初始化所有配置（系统级）
export const initAllConfigs = async () => {
  await Promise.all([
    initLLMModels(),
    initEmbeddingModels(),
    initReRankModels(),
    initTTSModels(),
    initWhisperModels(),
    initOCRModels(),
    initSystemConfigs()
  ]);
};

// 刷新配置缓存
export const refreshConfigCache = () => {
  configCache = null;
  lastLoadTime = 0;
  return loadConfigFile();
};

// 获取当前活跃的LLM模型配置（系统级）
export const getActiveLLMModels = async (): Promise<LLMModelSchema[]> => {
  return MongoLLMModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean();
};

// 获取当前活跃的ReRank模型配置（系统级）
export const getActiveReRankModels = async (): Promise<ReRankModelSchema[]> => {
  return MongoReRankModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean();
};

// 获取当前活跃的TTS模型配置（系统级）
export const getActiveTTSModels = async (): Promise<TTSModelSchema[]> => {
  return MongoTTSModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean();
};

// 获取当前活跃的Whisper模型配置（系统级）
export const getActiveWhisperModel = async (): Promise<WhisperModelSchema | null> => {
  return MongoWhisperModel.findOne({ isActive: true }).lean();
};

// 获取当前活跃的OCR模型配置（系统级）
export const getActiveOCRModel = async (): Promise<OCRModelSchema | null> => {
  return MongoOCRModel.findOne({ isActive: true }).lean();
};

// 获取兼容的旧格式配置（用于过渡期间，系统级）
export async function getLegacyConfig(): Promise<any> {
  try {
    const [
      llmModels,
      embeddingModels,
      reRankModels,
      ttsModels,
      whisperModel,
      ocrModel,
      feConfigs,
      systemEnv
    ] = await Promise.all([
      getAllLLMModels(),
      getAllEmbeddingModels(),
      getAllReRankModels(),
      getAllTTSModels(),
      getWhisperModel(),
      getOCRModel(),
      getFeConfigs(),
      getSystemEnv()
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
        apiKey: model.apiKey
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
      vectorModels: embeddingModels.map((model) => ({
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        charsPointsPrice: model.charsPointsPrice,
        defaultToken: model.defaultToken,
        maxToken: model.maxToken,
        weight: model.weight,
        defaultConfig: model.defaultConfig,
        dbConfig: model.dbConfig,
        queryConfig: model.queryConfig
      }))
    };
  } catch (error) {
    console.error('获取兼容配置失败:', error);
    return {};
  }
}
