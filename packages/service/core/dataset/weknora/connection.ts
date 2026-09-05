import { Schema, getMongoModel } from '../../../common/mongo';
import type { WeKnoraConnectionConfig } from '@fastgpt/global/core/dataset/weknora';

type WeKnoraConnectionSchema = WeKnoraConnectionConfig & { appId: string; teamId: string };

const schema = new Schema({
  appId: { type: Schema.Types.ObjectId, required: true },
  teamId: { type: Schema.Types.ObjectId, required: true },
  apiUrl: { type: String, required: true },
  apiKey: { type: String, required: true, select: false },
  tenantId: { type: String, default: '' },
  webUrl: { type: String, default: '' }
});

export const MongoWeKnoraConnection = getMongoModel<WeKnoraConnectionSchema>(
  'app_weknora_connections',
  schema
);

export const getWeKnoraConnection = async ({
  connectionId,
  appId,
  teamId
}: {
  connectionId: string;
  appId: string;
  teamId: string;
}): Promise<WeKnoraConnectionConfig> => {
  if (!connectionId) throw new Error('请配置 WeKnora 连接');
  const connection = await MongoWeKnoraConnection.findOne({
    _id: connectionId,
    appId,
    teamId
  })
    .select('+apiKey')
    .lean();
  if (!connection) throw new Error('WeKnora 连接不存在或不属于当前应用');
  return {
    apiUrl: connection.apiUrl,
    apiKey: connection.apiKey,
    tenantId: connection.tenantId,
    webUrl: connection.webUrl
  };
};
