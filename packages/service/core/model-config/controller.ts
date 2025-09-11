import fs from 'fs';
import path from 'path';
import json5 from 'json5';
import { MongoLLMModel } from './llm/schema';
import { MongoReRankModel } from './rerank/schema';
import { MongoTTSModel } from './tts/schema';
import { MongoWhisperModel } from './whisper/schema';
import { MongoOCRModel } from './ocr/schema';
import { MongoSystemConfig } from './system/schema';
import type {
  LLMModelSchema,
  ReRankModelSchema,
  TTSModelSchema,
  WhisperModelSchema,
  OCRModelSchema,
  SystemConfigSchema
} from '@fastgpt/global/core/model/type.d';

// 配置文件路径
const CONFIG_FILE_PATH =
  process.env.CONFIG_PATH || path.join(process.cwd(), 'data/config.local.json');

// 缓存配置
let configCache: any = null;
let lastLoadTime = 0;
const CACHE_DURATION = 5000; // 5秒缓存

// 读取配置文件
export const loadConfigFile = () => {
  const now = Date.now();
  if (configCache && now - lastLoadTime < CACHE_DURATION) {
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
export const initWhisperModels = async () => {
  const config = loadConfigFile();
  if (!config?.whisperModel) return;

  const existingModel = await MongoWhisperModel.findOne({
    model: config.whisperModel.model
  });

  if (!existingModel) {
    await MongoWhisperModel.create({
      ...config.whisperModel,
      isActive: true
    });
  }
};

// 初始化OCR模型配置（系统级）
export const initOCRModels = async () => {
  const config = loadConfigFile();
  if (!config?.ocrModel) return;

  const existingModel = await MongoOCRModel.findOne({ model: config.ocrModel.model });

  if (!existingModel) {
    await MongoOCRModel.create({
      ...config.ocrModel,
      isActive: true
    });
  }
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
    initReRankModels(),
    initTTSModels(),
    initWhisperModels(),
    initOCRModels(),
    initSystemConfigs()
  ]);
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

// 获取系统配置（系统级）
export const getSystemConfig = async (configKey: string): Promise<SystemConfigSchema | null> => {
  return MongoSystemConfig.findOne({ configKey, isActive: true }).lean();
};

// 刷新配置缓存
export const refreshConfigCache = () => {
  configCache = null;
  lastLoadTime = 0;
  return loadConfigFile();
};
