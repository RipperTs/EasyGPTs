import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

// LLM模型配置
export const LLMModelCollectionName = 'llm_models';

const LLMModelSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  model: {
    type: String,
    required: true,
    comment: '模型名(对应OneAPI中渠道的模型名)'
  },
  name: {
    type: String,
    required: true,
    comment: '模型别名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/openai.svg',
    comment: '模型的logo'
  },
  maxContext: {
    type: Number,
    required: true,
    comment: '最大上下文'
  },
  maxResponse: {
    type: Number,
    required: true,
    comment: '最大回复'
  },
  quoteMaxToken: {
    type: Number,
    required: true,
    comment: '最大引用内容'
  },
  maxTemperature: {
    type: Number,
    required: true,
    comment: '最大温度'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: 'n积分/1k token（商业版）'
  },
  censor: {
    type: Boolean,
    default: false,
    comment: '是否开启敏感校验（商业版）'
  },
  vision: {
    type: Boolean,
    default: false,
    comment: '是否支持图片输入'
  },
  reasoning: {
    type: Boolean,
    default: false,
    comment: '是否支持推理'
  },
  datasetProcess: {
    type: Boolean,
    default: false,
    comment: '是否设置为知识库处理模型（QA）'
  },
  usedInClassify: {
    type: Boolean,
    default: false,
    comment: '是否用于问题分类'
  },
  usedInExtractFields: {
    type: Boolean,
    default: false,
    comment: '是否用于内容提取'
  },
  usedInToolCall: {
    type: Boolean,
    default: false,
    comment: '是否用于工具调用'
  },
  usedInQueryExtension: {
    type: Boolean,
    default: false,
    comment: '是否用于问题优化'
  },
  toolChoice: {
    type: Boolean,
    default: false,
    comment: '是否支持工具选择'
  },
  functionCall: {
    type: Boolean,
    default: false,
    comment: '是否支持函数调用'
  },
  customCQPrompt: {
    type: String,
    default: '',
    comment: '自定义文本分类提示词'
  },
  customExtractPrompt: {
    type: String,
    default: '',
    comment: '自定义内容提取提示词'
  },
  defaultSystemChatPrompt: {
    type: String,
    default: '',
    comment: '对话默认携带的系统提示词'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '请求API时，挟带一些默认配置'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

LLMModelSchema.index({ teamId: 1, updateTime: -1 });
LLMModelSchema.index({ teamId: 1, isActive: 1 });

export const MongoLLMModel = getMongoModel(LLMModelCollectionName, LLMModelSchema);

// 重排模型配置
export const ReRankModelCollectionName = 'rerank_models';

const ReRankModelSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  model: {
    type: String,
    required: true,
    comment: '模型名'
  },
  name: {
    type: String,
    required: true,
    comment: '模型显示名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/rerank.svg',
    comment: '模型图标'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: '价格配置'
  },
  requestUrl: {
    type: String,
    comment: '请求地址'
  },
  requestHeader: {
    type: Object,
    default: {},
    comment: '请求头'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '默认配置'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

ReRankModelSchema.index({ teamId: 1, updateTime: -1 });
ReRankModelSchema.index({ teamId: 1, isActive: 1 });

export const MongoReRankModel = getMongoModel(ReRankModelCollectionName, ReRankModelSchema);

// TTS模型配置
export const TTSModelCollectionName = 'tts_models';

const TTSModelSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  model: {
    type: String,
    required: true,
    comment: '模型名'
  },
  name: {
    type: String,
    required: true,
    comment: '模型显示名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/tts.svg',
    comment: '模型图标'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: '价格配置'
  },
  requestUrl: {
    type: String,
    comment: '请求地址'
  },
  requestHeader: {
    type: Object,
    default: {},
    comment: '请求头'
  },
  voices: {
    type: Array,
    default: [],
    comment: '语音配置'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '默认配置'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

TTSModelSchema.index({ teamId: 1, updateTime: -1 });
TTSModelSchema.index({ teamId: 1, isActive: 1 });

export const MongoTTSModel = getMongoModel(TTSModelCollectionName, TTSModelSchema);

// 语音识别模型配置
export const WhisperModelCollectionName = 'whisper_models';

const WhisperModelSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  model: {
    type: String,
    required: true,
    comment: '模型名'
  },
  name: {
    type: String,
    required: true,
    comment: '模型显示名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/whisper.svg',
    comment: '模型图标'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: '价格配置'
  },
  requestUrl: {
    type: String,
    comment: '请求地址'
  },
  requestHeader: {
    type: Object,
    default: {},
    comment: '请求头'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '默认配置'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

WhisperModelSchema.index({ teamId: 1, updateTime: -1 });
WhisperModelSchema.index({ teamId: 1, isActive: 1 });

export const MongoWhisperModel = getMongoModel(WhisperModelCollectionName, WhisperModelSchema);

// OCR模型配置
export const OCRModelCollectionName = 'ocr_models';

const OCRModelSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  model: {
    type: String,
    required: true,
    comment: '模型名'
  },
  name: {
    type: String,
    required: true,
    comment: '模型显示名'
  },
  avatar: {
    type: String,
    default: '/imgs/model/ocr.svg',
    comment: '模型图标'
  },
  charsPointsPrice: {
    type: Number,
    default: 0,
    comment: '价格配置'
  },
  requestUrl: {
    type: String,
    comment: '请求地址'
  },
  requestHeader: {
    type: Object,
    default: {},
    comment: '请求头'
  },
  defaultConfig: {
    type: Object,
    default: {},
    comment: '默认配置'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

OCRModelSchema.index({ teamId: 1, updateTime: -1 });
OCRModelSchema.index({ teamId: 1, isActive: 1 });

export const MongoOCRModel = getMongoModel(OCRModelCollectionName, OCRModelSchema);

// 系统配置
export const SystemConfigCollectionName = 'system_configs';

const SystemConfigSchema = new Schema({
  teamId: {
    type: Schema.Types.ObjectId,
    ref: TeamCollectionName,
    required: true
  },
  tmbId: {
    type: Schema.Types.ObjectId,
    ref: TeamMemberCollectionName,
    required: true
  },
  configKey: {
    type: String,
    required: true,
    comment: '配置键名'
  },
  configValue: {
    type: Object,
    required: true,
    comment: '配置值'
  },
  description: {
    type: String,
    default: '',
    comment: '配置描述'
  },
  isActive: {
    type: Boolean,
    default: true,
    comment: '是否启用'
  },
  createTime: {
    type: Date,
    default: () => new Date()
  },
  updateTime: {
    type: Date,
    default: () => new Date()
  }
});

SystemConfigSchema.index({ teamId: 1, configKey: 1 });
SystemConfigSchema.index({ teamId: 1, isActive: 1 });

export const MongoSystemConfig = getMongoModel(SystemConfigCollectionName, SystemConfigSchema);
