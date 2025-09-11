import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { ReRankModelSchema } from '@fastgpt/global/core/model/type.d';

const CollectionName = 'rerank_models';

const ReRankModelSchemaObj = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'teams',
      required: true
    },
    tmbId: {
      type: Schema.Types.ObjectId,
      ref: 'team_members',
      required: true
    },
    model: {
      type: String,
      required: true
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
    requestAuth: {
      type: String,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// 添加索引
ReRankModelSchemaObj.index({ teamId: 1, model: 1 });
ReRankModelSchemaObj.index({ teamId: 1, isActive: 1 });

export const MongoReRankModel: Model<ReRankModelSchema> = getMongoModel(
  CollectionName,
  ReRankModelSchemaObj
);
