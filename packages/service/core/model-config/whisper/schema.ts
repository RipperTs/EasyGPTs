import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { WhisperModelSchema } from '@fastgpt/global/core/model/type.d';

const CollectionName = 'whisper_models';

const WhisperModelSchemaObj = new Schema(
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
WhisperModelSchemaObj.index({ teamId: 1, model: 1 });
WhisperModelSchemaObj.index({ teamId: 1, isActive: 1 });

export const MongoWhisperModel: Model<WhisperModelSchema> = getMongoModel(
  CollectionName,
  WhisperModelSchemaObj
);
