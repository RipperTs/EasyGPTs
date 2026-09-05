import { Schema, getMongoModel, type ClientSession } from '../../../common/mongo';
import type { WeKnoraConnectionConfig } from '@fastgpt/global/core/dataset/weknora';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

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

export const copyWeKnoraConnections = async ({
  nodes,
  sourceAppId,
  targetAppId,
  teamId,
  session
}: {
  nodes: StoreNodeItemType[];
  sourceAppId: string;
  targetAppId: string;
  teamId: string;
  session: ClientSession;
}): Promise<StoreNodeItemType[]> => {
  const connectionIds = new Map<string, string>();
  const copiedNodes: StoreNodeItemType[] = [];

  for (const node of nodes) {
    if (node.flowNodeType !== FlowNodeTypeEnum.weknoraSearch) {
      copiedNodes.push(node);
      continue;
    }
    const connectionInput = node.inputs.find(
      (input) => input.key === NodeInputKeyEnum.weknoraConnectionId
    );
    if (!connectionInput?.value) {
      copiedNodes.push(node);
      continue;
    }
    const sourceConnectionId: unknown = connectionInput.value;
    if (typeof sourceConnectionId !== 'string') {
      throw new Error('WeKnora 连接 ID 格式错误');
    }

    let targetConnectionId = connectionIds.get(sourceConnectionId);
    if (!targetConnectionId) {
      const connection = await getWeKnoraConnection({
        connectionId: sourceConnectionId,
        appId: sourceAppId,
        teamId
      });
      const [copiedConnection] = await MongoWeKnoraConnection.create(
        [{ ...connection, appId: targetAppId, teamId }],
        { session }
      );
      targetConnectionId = String(copiedConnection._id);
      connectionIds.set(sourceConnectionId, targetConnectionId);
    }
    copiedNodes.push({
      ...node,
      inputs: node.inputs.map((input) =>
        input === connectionInput ? { ...input, value: targetConnectionId } : input
      )
    });
  }

  return copiedNodes;
};
