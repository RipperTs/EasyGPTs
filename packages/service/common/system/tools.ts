import {
  FastGPTConfigFileType,
  FastGPTFeConfigsType,
  SystemEnvType
} from '@fastgpt/global/common/system/types';
import { isIPv6 } from 'net';
import { SubPlanType } from '@fastgpt/global/support/wallet/sub/type';
import {
  AudioSpeechModelType,
  ReRankModelItemType,
  WhisperModelType,
  VectorModelItemType,
  LLMModelItemType,
  OcrModelTyoe
} from '@fastgpt/global/core/ai/model.d';
import { getLegacyConfig } from '../../core/model/controller';

export const SERVICE_LOCAL_PORT = `${process.env.PORT || 3000}`;
export const SERVICE_LOCAL_HOST =
  process.env.HOSTNAME && isIPv6(process.env.HOSTNAME)
    ? `[${process.env.HOSTNAME}]:${SERVICE_LOCAL_PORT}`
    : `${process.env.HOSTNAME || 'localhost'}:${SERVICE_LOCAL_PORT}`;

export const initFastGPTConfig = (config?: FastGPTConfigFileType) => {
  if (!config) return;

  global.feConfigs = config.feConfigs as FastGPTFeConfigsType;
  global.systemEnv = config.systemEnv as SystemEnvType;
  global.subPlans = config.subPlans as SubPlanType;

  global.llmModels = config.llmModels as LLMModelItemType[];
  global.vectorModels = config.vectorModels as VectorModelItemType[];
  global.audioSpeechModels = config.audioSpeechModels as AudioSpeechModelType[];
  global.whisperModel = config.whisperModel as WhisperModelType;
  global.reRankModels = config.reRankModels as ReRankModelItemType[];
  global.ocrModel = config.ocrModel as OcrModelTyoe;
};

// 从数据库初始化FastGPT配置（系统级）
export const initFastGPTConfigFromDB = async () => {
  try {
    console.log('开始从数据库加载模型配置...');

    const config = await getLegacyConfig();

    if (!config) {
      console.warn('数据库中未找到配置，将使用默认配置');
      return;
    }

    // 设置全局配置
    global.feConfigs = (config.feConfigs || {}) as FastGPTFeConfigsType;
    global.systemEnv = (config.systemEnv || {}) as SystemEnvType;
    global.subPlans = (config.subPlans || []) as SubPlanType;

    global.llmModels = (config.llmModels || []) as LLMModelItemType[];
    global.vectorModels = (config.vectorModels || []) as VectorModelItemType[];
    global.audioSpeechModels = (config.audioSpeechModels || []) as AudioSpeechModelType[];
    global.whisperModel = config.whisperModel as WhisperModelType;
    global.reRankModels = (config.reRankModels || []) as ReRankModelItemType[];
    global.ocrModel = config.ocrModel as OcrModelTyoe;

    console.log('数据库配置加载完成', {
      llmModels: global.llmModels.length,
      vectorModels: global.vectorModels.length,
      reRankModels: global.reRankModels.length,
      audioSpeechModels: global.audioSpeechModels.length,
      hasWhisperModel: !!global.whisperModel,
      hasOcrModel: !!global.ocrModel
    });
  } catch (error) {
    console.error('从数据库加载配置失败:', error);
    console.log('将回退使用文件配置');
  }
};

// 刷新模型配置缓存
export const refreshModelConfig = async (teamId?: string) => {
  try {
    // 清除缓存
    const { clearModelCache } = await import('../../core/model/controller');
    clearModelCache();

    // 重新加载配置
    await initFastGPTConfigFromDB(teamId);

    console.log('模型配置缓存已刷新');
  } catch (error) {
    console.error('刷新模型配置失败:', error);
  }
};

export const systemStartCb = () => {
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // process.exit(1); // 退出进程
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // process.exit(1); // 退出进程
  });
};

export const surrenderProcess = () => new Promise((resolve) => setImmediate(resolve));
