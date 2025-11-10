import { MongoSchema } from '@fastgpt/global/common/system/types';

export interface LLMModelSchema extends MongoSchema {
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
  sort: number; // 排序字段，数字越小越靠前
}

export interface ReRankModelSchema extends MongoSchema {
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  requestUrl: string; // 请求地址
  apiKey: string; // API密钥
  isActive: boolean; // 是否启用
}

export interface TTSModelSchema extends MongoSchema {
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  avatar: string; // 模型图标
  sort: number; // 排序字段，数字越小越靠前
  requestUrl?: string; // 请求地址（可选）
  requestHeader?: Record<string, any>; // 请求头（可选）
  defaultConfig?: Record<string, any>; // 默认配置（可选）
  voices: Array<{
    label: string;
    value: string;
    bufferId: string;
  }>; // 语音配置
  isActive: boolean; // 是否启用
}

export interface WhisperModelSchema extends MongoSchema {
  model: string; // 模型名
  name: string; // 模型显示名
  charsPointsPrice: number; // 价格配置
  isActive: boolean; // 是否启用
}

export interface OCRModelSchema extends MongoSchema {
  model: string; // 模型名
  name: string; // 模型显示名
  avatar: string; // 模型图标
  charsPointsPrice: number; // 价格配置
  requestUrl?: string; // 请求地址（兼容旧字段，可选）
  requestAuth?: string; // 请求认证（兼容旧字段，可选）
  isActive: boolean; // 是否启用
}

export interface PDFModelSchema extends MongoSchema {
  model: string; // 模型名
  name: string; // 显示名
  avatar: string; // 图标
  charsPointsPrice: number; // 价格配置
  type: 'mineru' | 'doc2x' | 'mineru-local'; // 解析类型
  requestUrl?: string; // 请求地址
  apiKey?: string; // 接口鉴权秘钥
  defaultConfig?: Record<string, any>; // 默认请求参数
  isActive: boolean; // 是否启用
}

export interface EmbeddingModelSchema extends MongoSchema {
  model: string; // 模型名（与OneAPI对应）
  name: string; // 模型展示名
  avatar: string; // logo
  charsPointsPrice: number; // n积分/1k token
  defaultToken: number; // 默认文本分割时候的 token
  maxToken: number; // 最大 token
  weight: number; // 优先训练权重
  defaultConfig: Record<string, any>; // 自定义额外参数
  dbConfig: Record<string, any>; // 存储时的额外参数
  queryConfig: Record<string, any>; // 查询时的额外参数
  isActive: boolean; // 是否启用
  sort: number; // 排序字段，数字越小越靠前
}

// 已移除数据库系统配置，统一从本地配置文件读取

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
  sort?: number;
}

export interface UpdateLLMModelParams extends Partial<CreateLLMModelParams> {
  id: string;
}

export interface CreateReRankModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  requestUrl: string;
  apiKey: string;
}

export interface UpdateReRankModelParams extends Partial<CreateReRankModelParams> {
  id: string;
}

export interface CreateTTSModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  avatar?: string;
  sort?: number;
  requestUrl?: string;
  requestHeader?: Record<string, any>;
  defaultConfig?: Record<string, any>;
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
  avatar?: string;
}

export interface UpdateOCRModelParams extends Partial<CreateOCRModelParams> {
  id: string;
}

export interface CreateEmbeddingModelParams {
  model: string;
  name: string;
  avatar?: string;
  charsPointsPrice?: number;
  defaultToken: number;
  maxToken: number;
  weight?: number;
  defaultConfig?: Record<string, any>;
  dbConfig?: Record<string, any>;
  queryConfig?: Record<string, any>;
  sort?: number;
}

export interface UpdateEmbeddingModelParams extends Partial<CreateEmbeddingModelParams> {
  id: string;
}

export interface CreatePDFModelParams {
  model: string;
  name: string;
  charsPointsPrice?: number;
  avatar?: string;
  type: 'mineru' | 'doc2x' | 'mineru-local';
  requestUrl?: string;
  apiKey?: string;
  defaultConfig?: Record<string, any>;
}

export interface UpdatePDFModelParams extends Partial<CreatePDFModelParams> {
  id: string;
}

// 已移除：CreateSystemConfigParams / UpdateSystemConfigParams

export interface ModelListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}
