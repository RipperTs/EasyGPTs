import { MongoSchema } from '@fastgpt/global/common/system/types';

export interface LLMModelSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  model: string; // 模型名(对应OneAPI中渠道的模型名)
  name: string; // 模型别名
  avatar: string; // 模型的logo
  maxContext: number; // 最大上下文
  maxResponse: number; // 最大回复
  quoteMaxToken: number; // 最大引用内容
  maxTemperature: number; // 最大温度
  charsPointsPrice: number; // n积分/1k token（商业版）
  censor: boolean; // 是否开启敏感校验（商业版）
  vision: boolean; // 是否支持图片输入
  reasoning: boolean; // 是否支持推理
  datasetProcess: boolean; // 是否设置为知识库处理模型（QA）
  usedInClassify: boolean; // 是否用于问题分类
  usedInExtractFields: boolean; // 是否用于内容提取
  usedInToolCall: boolean; // 是否用于工具调用
  usedInQueryExtension: boolean; // 是否用于问题优化
  toolChoice: boolean; // 是否支持工具选择
  functionCall: boolean; // 是否支持函数调用
  customCQPrompt: string; // 自定义文本分类提示词
  customExtractPrompt: string; // 自定义内容提取提示词
  defaultSystemChatPrompt: string; // 对话默认携带的系统提示词
  defaultConfig: Record<string, any>; // 请求API时，挟带一些默认配置
  isActive: boolean; // 是否启用
}

export interface ReRankModelSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  requestUrl: string; // 请求地址
  requestAuth: string; // 请求认证
  isActive: boolean; // 是否启用
}

export interface TTSModelSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  voices: Array<{
    label: string;
    value: string;
    bufferId: string;
  }>; // 语音配置
  isActive: boolean; // 是否启用
}

export interface WhisperModelSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  isActive: boolean; // 是否启用
}

export interface OCRModelSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  requestUrl: string; // 请求地址
  requestAuth: string; // 请求认证
  isActive: boolean; // 是否启用
}

export interface SystemConfigSchema extends MongoSchema {
  teamId: string;
  tmbId: string;
  configKey: string; // 配置键名
  configValue: Record<string, any>; // 配置值
  description: string; // 配置描述
  isActive: boolean; // 是否启用
}

// API请求和响应类型
export interface CreateLLMModelParams {
  model: string;
  name: string;
  avatar?: string;
  maxContext: number;
  maxResponse: number;
  quoteMaxToken: number;
  maxTemperature: number;
  charsPointsPrice?: number;
  censor?: boolean;
  vision?: boolean;
  reasoning?: boolean;
  datasetProcess?: boolean;
  usedInClassify?: boolean;
  usedInExtractFields?: boolean;
  usedInToolCall?: boolean;
  usedInQueryExtension?: boolean;
  toolChoice?: boolean;
  functionCall?: boolean;
  customCQPrompt?: string;
  customExtractPrompt?: string;
  defaultSystemChatPrompt?: string;
  defaultConfig?: Record<string, any>;
}

export interface UpdateLLMModelParams extends Partial<CreateLLMModelParams> {
  id: string;
}

export interface CreateReRankModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  requestUrl: string;
  requestAuth: string;
}

export interface UpdateReRankModelParams extends Partial<CreateReRankModelParams> {
  id: string;
}

export interface CreateTTSModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  voices: Array<{
    label: string;
    value: string;
    bufferId: string;
  }>;
}

export interface UpdateTTSModelParams extends Partial<CreateTTSModelParams> {
  id: string;
}

export interface CreateWhisperModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
}

export interface UpdateWhisperModelParams extends Partial<CreateWhisperModelParams> {
  id: string;
}

export interface CreateOCRModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  requestUrl: string;
  requestAuth: string;
}

export interface UpdateOCRModelParams extends Partial<CreateOCRModelParams> {
  id: string;
}

export interface CreateSystemConfigParams {
  configKey: string;
  configValue: Record<string, any>;
  description?: string;
}

export interface UpdateSystemConfigParams extends Partial<CreateSystemConfigParams> {
  id: string;
}

export interface ModelListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}
