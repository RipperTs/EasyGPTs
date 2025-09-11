import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { TTSModelSchema } from '@fastgpt/global/core/model/type.d';

const CollectionName = 'tts_models';

const TTSModelSchemaObj = new Schema(
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
    voices: [
      {
        label: String,
        value: String,
        bufferId: String
      }
    ],
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
TTSModelSchemaObj.index({ teamId: 1, model: 1 });
TTSModelSchemaObj.index({ teamId: 1, isActive: 1 });

export const MongoTTSModel: Model<TTSModelSchema> = getMongoModel(
  CollectionName,
  TTSModelSchemaObj
);
