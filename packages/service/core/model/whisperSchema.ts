import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

// 语音识别模型配置
export const WhisperModelCollectionName = 'whisper_models';

const WhisperModelSchema = new Schema({
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

// 创建索引
WhisperModelSchema.index({ updateTime: -1 });
WhisperModelSchema.index({ isActive: 1, sort: 1 });
WhisperModelSchema.index({ model: 1 });

export const MongoWhisperModel = getMongoModel(WhisperModelCollectionName, WhisperModelSchema);
