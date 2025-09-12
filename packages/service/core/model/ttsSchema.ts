import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

// TTS模型配置
export const TTSModelCollectionName = 'tts_models';

const TTSModelSchema = new Schema({
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

// 创建索引
TTSModelSchema.index({ updateTime: -1 });
TTSModelSchema.index({ isActive: 1, sort: 1 });
TTSModelSchema.index({ model: 1 });

export const MongoTTSModel = getMongoModel(TTSModelCollectionName, TTSModelSchema);
