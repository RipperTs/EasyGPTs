import { connectionMongo, getMongoModel, type Model } from '../../common/mongo';
import { ReRankModelSchema } from '@fastgpt/global/core/model/type.d';

const { Schema } = connectionMongo;

// 重排模型配置
export const ReRankModelCollectionName = 'rerank_models';

const ReRankModelSchemaObj = new Schema({
  model: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  charsPointsPrice: {
    type: Number,
    default: 0
  },
  requestUrl: {
    type: String,
    required: true
  },
  apiKey: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
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

// 添加索引
ReRankModelSchemaObj.index({ model: 1 }, { unique: true });
ReRankModelSchemaObj.index({ isActive: 1 });

export const MongoReRankModel: Model<ReRankModelSchema> = getMongoModel(
  ReRankModelCollectionName,
  ReRankModelSchemaObj
);
