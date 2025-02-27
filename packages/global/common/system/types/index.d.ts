import { StandSubPlanLevelMapType, SubPlanType } from '../../../support/wallet/sub/type';
import type {
  ChatModelItemType,
  FunctionModelItemType,
  LLMModelItemType,
  VectorModelItemType,
  AudioSpeechModels,
  WhisperModelType,
  ReRankModelItemType
} from '../../../core/ai/model.d';
import { SubTypeEnum } from '../../../support/wallet/sub/constants';

/* fastgpt main */
export type FastGPTConfigFileType = {
  feConfigs?: FastGPTFeConfigsType;
  systemEnv?: Record<string, any>;
  subPlans?: Record<string, any>;
  llmModels?: Record<string, any>[];
  vectorModels?: Record<string, any>[];
  reRankModels?: Record<string, any>[];
  audioSpeechModels?: Record<string, any>[];
  whisperModel?: Record<string, any>;
  ocrModel?: Record<string, any>;
};

export type FastGPTFeConfigsType = {
  show_emptyChat?: boolean;
  register_method?: ['email' | 'phone'];
  login_method?: ['email' | 'phone']; // Attention: login method is diffrent with oauth
  find_password_method?: ['email' | 'phone'];
  bind_notification_method?: ['email' | 'phone'];
  show_appStore?: boolean;
  show_git?: boolean;
  show_pay?: boolean;
  show_openai_account?: boolean;
  show_promotion?: boolean;
  show_team_chat?: boolean;
  concatMd?: string;

  docUrl?: string;
  chatbotUrl?: string;
  openAPIDocUrl?: string;
  systemPluginCourseUrl?: string;
  appTemplateCourse?: string;

  systemTitle?: string;
  systemDescription?: string;
  googleClientVerKey?: string;
  isPlus?: boolean;
  sso?: {
    icon?: string;
    title?: string;
    url?: string;
  };
  oauth?: {
    github?: string;
    google?: string;
    wechat?: string;
  };
  limit?: {
    exportDatasetLimitMinutes?: number;
    websiteSyncLimitMinuted?: number;
  };
  scripts?: { [key: string]: string }[];
  favicon?: string;
  customApiDomain?: string;
  customSharePageDomain?: string;

  uploadFileMaxAmount?: number;
  uploadFileMaxSize?: number;
  lafEnv?: string;
};

export type SystemEnvType = {
  openapiPrefix?: string;
  vectorMaxProcess: number;
  qaMaxProcess: number;
  pgHNSWEfSearch: number;
  tokenWorkers: number; // token count max worker

  oneapiUrl?: string;
  chatApiKey?: string;
};
