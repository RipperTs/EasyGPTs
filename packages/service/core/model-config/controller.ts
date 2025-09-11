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

// 初始化LLM模型配置
export const initLLMModels = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config?.llmModels) return;

  const existingModels = await MongoLLMModel.find({ teamId });
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.llmModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoLLMModel.create({
        ...modelConfig,
        teamId,
        tmbId,
        isActive: true
      });
    }
  }
};

// 初始化ReRank模型配置
export const initReRankModels = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config?.reRankModels) return;

  const existingModels = await MongoReRankModel.find({ teamId });
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.reRankModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoReRankModel.create({
        ...modelConfig,
        teamId,
        tmbId,
        isActive: true
      });
    }
  }
};

// 初始化TTS模型配置
export const initTTSModels = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config?.audioSpeechModels) return;

  const existingModels = await MongoTTSModel.find({ teamId });
  const existingModelKeys = new Set(existingModels.map((m) => m.model));

  for (const modelConfig of config.audioSpeechModels) {
    if (!existingModelKeys.has(modelConfig.model)) {
      await MongoTTSModel.create({
        ...modelConfig,
        teamId,
        tmbId,
        isActive: true
      });
    }
  }
};

// 初始化Whisper模型配置
export const initWhisperModels = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config?.whisperModel) return;

  const existingModel = await MongoWhisperModel.findOne({
    teamId,
    model: config.whisperModel.model
  });

  if (!existingModel) {
    await MongoWhisperModel.create({
      ...config.whisperModel,
      teamId,
      tmbId,
      isActive: true
    });
  }
};

// 初始化OCR模型配置
export const initOCRModels = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config?.ocrModel) return;

  const existingModel = await MongoOCRModel.findOne({ teamId, model: config.ocrModel.model });

  if (!existingModel) {
    await MongoOCRModel.create({
      ...config.ocrModel,
      teamId,
      tmbId,
      isActive: true
    });
  }
};

// 初始化系统配置
export const initSystemConfigs = async (teamId: string, tmbId: string) => {
  const config = loadConfigFile();
  if (!config) return;

  // 初始化系统环境配置
  if (config.systemEnv) {
    const existingConfig = await MongoSystemConfig.findOne({ teamId, configKey: 'systemEnv' });
    if (!existingConfig) {
      await MongoSystemConfig.create({
        teamId,
        tmbId,
        configKey: 'systemEnv',
        configValue: config.systemEnv,
        description: '系统环境配置',
        isActive: true
      });
    }
  }

  // 初始化前端配置
  if (config.feConfigs) {
    const existingConfig = await MongoSystemConfig.findOne({ teamId, configKey: 'feConfigs' });
    if (!existingConfig) {
      await MongoSystemConfig.create({
        teamId,
        tmbId,
        configKey: 'feConfigs',
        configValue: config.feConfigs,
        description: '前端配置',
        isActive: true
      });
    }
  }
};

// 初始化所有配置
export const initAllConfigs = async (teamId: string, tmbId: string) => {
  await Promise.all([
    initLLMModels(teamId, tmbId),
    initReRankModels(teamId, tmbId),
    initTTSModels(teamId, tmbId),
    initWhisperModels(teamId, tmbId),
    initOCRModels(teamId, tmbId),
    initSystemConfigs(teamId, tmbId)
  ]);
};

// 获取当前活跃的LLM模型配置
export const getActiveLLMModels = async (teamId: string): Promise<LLMModelSchema[]> => {
  return MongoLLMModel.find({ teamId, isActive: true }).lean();
};

// 获取当前活跃的ReRank模型配置
export const getActiveReRankModels = async (teamId: string): Promise<ReRankModelSchema[]> => {
  return MongoReRankModel.find({ teamId, isActive: true }).lean();
};

// 获取当前活跃的TTS模型配置
export const getActiveTTSModels = async (teamId: string): Promise<TTSModelSchema[]> => {
  return MongoTTSModel.find({ teamId, isActive: true }).lean();
};

// 获取当前活跃的Whisper模型配置
export const getActiveWhisperModel = async (teamId: string): Promise<WhisperModelSchema | null> => {
  return MongoWhisperModel.findOne({ teamId, isActive: true }).lean();
};

// 获取当前活跃的OCR模型配置
export const getActiveOCRModel = async (teamId: string): Promise<OCRModelSchema | null> => {
  return MongoOCRModel.findOne({ teamId, isActive: true }).lean();
};

// 获取系统配置
export const getSystemConfig = async (
  teamId: string,
  configKey: string
): Promise<SystemConfigSchema | null> => {
  return MongoSystemConfig.findOne({ teamId, configKey, isActive: true }).lean();
};

// 刷新配置缓存
export const refreshConfigCache = () => {
  configCache = null;
  lastLoadTime = 0;
  return loadConfigFile();
};
