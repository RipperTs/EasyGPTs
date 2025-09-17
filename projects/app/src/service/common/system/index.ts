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
import { initAllConfigs } from '@fastgpt/service/core/model/controller';

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
    // 初始化所有模型配置（从配置文件导入到数据库）
    initAllConfigs(),

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
  // load config - 仅加载非模型相关的配置
  const [dbModelConfig, fileConfig] = await Promise.all([
    // 从数据库获取所有模型配置
    getLegacyConfig(),
    readConfigData('config.json')
  ]);
  const fileRes = json5.parse(fileConfig) as FastGPTConfigFileType;

  // 完全使用数据库配置，不再回退到本地文件
  const config: FastGPTConfigFileType = {
    feConfigs: {
      ...defaultFeConfigs,
      ...fileRes?.feConfigs, // 仅保留前端配置使用文件
      isPlus: !!FastGPTProUrl
    },
    systemEnv: {
      ...fileRes.systemEnv // 系统环境变量仍使用文件
    },
    subPlans: fileRes.subPlans, // 订阅计划仍使用文件
    // 所有模型配置完全从数据库读取，不再使用本地文件
    llmModels: dbModelConfig?.llmModels || [],
    vectorModels: dbModelConfig?.vectorModels || [],
    reRankModels: dbModelConfig?.reRankModels || [],
    audioSpeechModels: dbModelConfig?.audioSpeechModels || [],
    whisperModel: dbModelConfig?.whisperModel || null,
    ocrModel: dbModelConfig?.ocrModel || null
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
