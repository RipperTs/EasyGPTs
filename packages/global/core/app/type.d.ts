import type { FlowNodeTemplateType, StoreNodeItemType } from '../workflow/type/node';
import { AppTypeEnum } from './constants';
import { PermissionTypeEnum } from '../../support/permission/constant';
import {
  NodeInputKeyEnum,
  VariableInputEnum,
  WorkflowIOValueTypeEnum,
  ReasoningEffortLevel
} from '../workflow/constants';
import { SelectedDatasetType } from '../workflow/api';
import { DatasetSearchModeEnum } from '../dataset/constants';
import { TeamTagSchema as TeamTagsSchemaType } from '@fastgpt/global/support/user/team/type.d';
import { StoreEdgeItemType } from '../workflow/type/edge';
import { PermissionSchemaType, PermissionValueType } from '../../support/permission/type';
import { AppPermission } from '../../support/permission/app/controller';
import { ParentIdType } from '../../common/parentFolder/type';
import type { WeKnoraSearchSettings } from '../dataset/weknora';

export type AppSchema = {
  _id: string;
  parentId?: ParentIdType;
  teamId: string;
  tmbId: string;
  type: AppTypeEnum;
  version?: 'v1' | 'v2';

  name: string;
  avatar: string;
  intro: string;

  updateTime: Date;

  modules: StoreNodeItemType[];
  edges: StoreEdgeItemType[];
  pluginData?: {
    nodeVersion?: string;
    pluginUniId?: string; // plugin unique id(plugin name)
    apiSchemaStr?: string; // api schema string
    customHeaders?: string;
  };

  // App system config
  chatConfig: AppChatConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType | null;
  scheduledTriggerNextTime?: Date;

  inited?: boolean;
  teamTags: string[];
  pluginOrder?: number;
} & PermissionSchemaType;

export type AppListItemType = {
  _id: string;
  tmbId: string;
  name: string;
  avatar: string;
  intro: string;
  type: AppTypeEnum;
  updateTime: Date;
  pluginData?: AppSchema['pluginData'];
  permission: AppPermission;
} & PermissionSchemaType;

export type AppDetailType = AppSchema & {
  permission: AppPermission;
};

export type AppSimpleEditFormType = {
  weknora: WeKnoraSearchSettings;
  // templateId: string;
  aiSettings: {
    model: string;
    systemPrompt?: string | undefined;
    temperature?: number;
    maxToken?: number;
    isResponseAnswerText: boolean;
    maxHistories: number;
    [NodeInputKeyEnum.aiChatReasoning]?: boolean;
    [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffortLevel;
  };
  dataset: {
    datasets: SelectedDatasetType;
    searchMode: `${DatasetSearchModeEnum}`;
    similarity?: number;
    limit?: number;
    usingReRank?: boolean;
    datasetSearchUsingExtensionQuery?: boolean;
    datasetSearchExtensionModel?: string;
    datasetSearchExtensionBg?: string;
  };
  selectedTools: FlowNodeTemplateType[];
  chatConfig: AppChatConfigType;
};

/* app chat config type */
export type AppChatConfigType = {
  welcomeText?: string;
  variables?: VariableItemType[];
  questionGuide?: boolean;
  ttsConfig?: AppTTSConfigType;
  whisperConfig?: AppWhisperConfigType;
  scheduledTriggerConfig?: AppScheduledTriggerConfigType;
  chatInputGuide?: ChatInputGuideConfigType;
  fileSelectConfig?: AppFileSelectConfigType;

  // plugin
  instruction?: string;
};
export type SettingAIDataType = {
  model: string;
  temperature?: number;
  maxToken?: number;
  isResponseAnswerText?: boolean;
  maxHistories?: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean; // Is open vision mode
  [NodeInputKeyEnum.aiChatReasoning]?: boolean; // Is open reasoning mode
  [NodeInputKeyEnum.aiChatReasoningEffort]?: ReasoningEffortLevel; // Reasoning effort level
};

// variable
export type VariableItemType = {
  id: string;
  key: string;
  label: string;
  type: `${VariableInputEnum}`;
  required: boolean;
  maxLen: number;
  enums: { value: string }[];
  valueType: WorkflowIOValueTypeEnum;
};
// tts
export type AppTTSConfigType = {
  type: 'none' | 'web' | 'model';
  model?: string;
  voice?: string;
  speed?: number;
};
// whisper
export type AppWhisperConfigType = {
  open: boolean;
  autoSend: boolean;
  autoTTSResponse: boolean;
};
// question guide text
export type ChatInputGuideConfigType = {
  open: boolean;
  customUrl: string;
};
// interval timer
export type AppScheduledTriggerConfigType = {
  cronString: string;
  timezone: string;
  defaultPrompt: string;
};
// File
export type AppFileSelectConfigType = {
  canSelectFile: boolean;
  canSelectImg: boolean;
  maxFiles: number;
  /** 指定 PDF 解析模型；为空则走本地解析 */
  pdfModel?: string;
};

export type TemplateTypeSchemaType = {
  typeName: string;
  typeId: string;
  typeOrder: number;
};

export type SystemPluginListItemType = {
  _id: string;
  name: string;
  avatar: string;
};
