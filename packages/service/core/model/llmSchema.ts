import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

// LLM模型配置
export const LLMModelCollectionName = 'llm_models';

const LLMModelSchema = new Schema({
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
  sort: {
    type: Number,
    default: 100,
    comment: '排序值，数字越小越靠前'
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

// 创建索引
LLMModelSchema.index({ updateTime: -1 });
LLMModelSchema.index({ isActive: 1, sort: 1 });
LLMModelSchema.index({ model: 1 });

export const MongoLLMModel = getMongoModel(LLMModelCollectionName, LLMModelSchema);
