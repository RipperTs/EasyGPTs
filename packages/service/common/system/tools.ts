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
