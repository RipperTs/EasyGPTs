import { connectionMongo, getMongoModel, type Model } from '../../../common/mongo';
const { Schema } = connectionMongo;
import { SystemConfigSchema } from '@fastgpt/global/core/model/type.d';

const CollectionName = 'system_configs';

const SystemConfigSchemaObj = new Schema(
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
    configKey: {
      type: String,
      required: true
    },
    configValue: {
      type: Object,
      required: true
    },
    description: {
      type: String,
      default: ''
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
SystemConfigSchemaObj.index({ teamId: 1, configKey: 1 }, { unique: true });
SystemConfigSchemaObj.index({ teamId: 1, isActive: 1 });

export const MongoSystemConfig: Model<SystemConfigSchema> = getMongoModel(
  CollectionName,
  SystemConfigSchemaObj
);
