import { Schema, getMongoModel } from '../../common/mongo';
import {
  TeamCollectionName,
  TeamMemberCollectionName
} from '@fastgpt/global/support/user/team/constant';

// 系统配置
export const SystemConfigCollectionName = 'system_configs';

const SystemConfigSchema = new Schema({
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

// 创建索引
SystemConfigSchema.index({ teamId: 1, configKey: 1 });
SystemConfigSchema.index({ teamId: 1, isActive: 1 });

export const MongoSystemConfig = getMongoModel(SystemConfigCollectionName, SystemConfigSchema);
