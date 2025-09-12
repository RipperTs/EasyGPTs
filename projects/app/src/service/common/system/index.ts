import { initHttpAgent } from '@fastgpt/service/common/middle/httpAgent';
import { existsSync, readdirSync, readFileSync } from 'fs';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import type { FastGPTConfigFileType } from '@fastgpt/global/common/system/types/index.d';
import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { getFastGPTConfigFromDB } from '@fastgpt/service/common/system/config/controller';
import { getLegacyConfig } from '@fastgpt/service/core/model/controller';
import { PluginTemplateType } from '@fastgpt/global/core/plugin/type';
import { FastGPTProUrl } from '@fastgpt/service/common/system/constants';
import { initFastGPTConfig } from '@fastgpt/service/common/system/tools';
import json5 from 'json5';
import { SystemPluginTemplateItemType } from '@fastgpt/global/core/workflow/type';

export const readConfigData = (name: string) => {
  const isDev = process.env.NODE_ENV === 'development';

  const splitName = name.split('.');
  const devName = `${splitName[0]}.local.${splitName[1]}`;

  const filename = (() => {
    if (isDev) {
      // check local file exists
      const hasLocalFile = existsSync(`data/${devName}`);
      if (hasLocalFile) {
        return `data/${devName}`;
      }
      return `data/${name}`;
    }
    // production path
    return `/app/data/${name}`;
  })();

  const content = readFileSync(filename, 'utf-8');

  return content;
};

/* Init global variables */
export function initGlobal() {
  if (global.communityPlugins) return;

  global.communityPlugins = [];
  global.qaQueueLen = global.qaQueueLen ?? 0;
  global.vectorQueueLen = global.vectorQueueLen ?? 0;
  initHttpAgent();
}

/* Init system data(Need to connected db). It only needs to run once */
export async function getInitConfig() {
  return Promise.all([
    initSystemConfig(),
    getSystemVersion(),

    // abandon
    getSystemPlugin(),
    getSystemPluginV1()
  ]);
}

const defaultFeConfigs: FastGPTFeConfigsType = {
  show_emptyChat: true,
  show_git: true,
  docUrl: '/docs',
  openAPIDocUrl: '/openapi',
  systemPluginCourseUrl: '/wiki',
  systemTitle: 'LLM应用开发平台',
  concatMd: '',
  limit: {
    exportDatasetLimitMinutes: 0,
    websiteSyncLimitMinuted: 0
  },
  scripts: [],
  favicon: '/favicon.ico',
  uploadFileMaxSize: 500
};

export async function initSystemConfig() {
  // load config
  const [dbModelConfig, fileConfig] = await Promise.all([
    // 使用getLegacyConfig从MongoLLMModel等表中读取模型配置
    getLegacyConfig(),
    readConfigData('config.json')
  ]);
  const fileRes = json5.parse(fileConfig) as FastGPTConfigFileType;

  // 优先使用数据库配置，如果没有则使用文件配置
  const config: FastGPTConfigFileType = {
    feConfigs: {
      ...fileRes?.feConfigs,
      ...defaultFeConfigs,
      ...(dbModelConfig?.feConfigs || {}),
      isPlus: !!FastGPTProUrl
    },
    systemEnv: {
      ...fileRes.systemEnv,
      ...(dbModelConfig?.systemEnv || {})
    },
    subPlans: dbModelConfig?.subPlans || fileRes.subPlans,
    // 如果数据库有模型配置则使用数据库的，否则使用文件的
    llmModels:
      dbModelConfig?.llmModels && dbModelConfig.llmModels.length > 0
        ? dbModelConfig.llmModels
        : fileRes.llmModels || [],
    vectorModels:
      dbModelConfig?.vectorModels && dbModelConfig.vectorModels.length > 0
        ? dbModelConfig.vectorModels
        : fileRes.vectorModels || [],
    reRankModels:
      dbModelConfig?.reRankModels && dbModelConfig.reRankModels.length > 0
        ? dbModelConfig.reRankModels
        : fileRes.reRankModels || [],
    audioSpeechModels:
      dbModelConfig?.audioSpeechModels && dbModelConfig.audioSpeechModels.length > 0
        ? dbModelConfig.audioSpeechModels
        : fileRes.audioSpeechModels || [],
    whisperModel: dbModelConfig?.whisperModel || fileRes.whisperModel,
    ocrModel: dbModelConfig?.ocrModel || fileRes.ocrModel
  };

  // set config
  initFastGPTConfig(config);
}

function getSystemVersion() {
  if (global.systemVersion) return;
  try {
    if (process.env.NODE_ENV === 'development') {
      global.systemVersion = process.env.npm_package_version || '0.0.0';
    } else {
      const packageJson = json5.parse(readFileSync('/app/package.json', 'utf-8'));

      global.systemVersion = packageJson?.version;
    }
  } catch (error) {
    console.log(error);

    global.systemVersion = '0.0.0';
  }
}

function getSystemPlugin() {
  if (global.communityPlugins && global.communityPlugins.length > 0) return;

  const basePath =
    process.env.NODE_ENV === 'development' ? 'data/pluginTemplates' : '/app/data/pluginTemplates';
  // read data/pluginTemplates directory, get all json file
  const files = readdirSync(basePath);
  // filter json file
  const filterFiles = files.filter((item) => item.endsWith('.json'));

  // read json file
  const fileTemplates = filterFiles.map<SystemPluginTemplateItemType>((filename) => {
    const content = readFileSync(`${basePath}/${filename}`, 'utf-8');
    return {
      ...json5.parse(content),
      originCost: 0,
      currentCost: 0,
      id: `${PluginSourceEnum.community}-${filename.replace('.json', '')}`
    };
  });

  fileTemplates.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  global.communityPlugins = fileTemplates;
}
function getSystemPluginV1() {
  if (global.communityPluginsV1 && global.communityPluginsV1.length > 0) return;

  const basePath =
    process.env.NODE_ENV === 'development'
      ? 'data/pluginTemplates/v1'
      : '/app/data/pluginTemplates/v1';
  // read data/pluginTemplates directory, get all json file
  const files = readdirSync(basePath);
  // filter json file
  const filterFiles = files.filter((item) => item.endsWith('.json'));

  // read json file
  const fileTemplates: (PluginTemplateType & { weight: number })[] = filterFiles.map((filename) => {
    const content = readFileSync(`${basePath}/${filename}`, 'utf-8');
    return {
      ...JSON.parse(content),
      id: `${PluginSourceEnum.community}-${filename.replace('.json', '')}`,
      source: PluginSourceEnum.community
    };
  });

  fileTemplates.sort((a, b) => b.weight - a.weight);

  global.communityPluginsV1 = fileTemplates;
}
