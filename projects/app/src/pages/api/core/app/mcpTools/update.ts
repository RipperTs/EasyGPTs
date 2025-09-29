import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';

export type updateMCPToolsQuery = {};

export type updateMCPToolsBody = {
  appId: string;
  url: string;
  headers?: Record<string, string>;
  headerSecret?: Record<string, any>;
  toolList: { name: string; description: string; inputSchema: any }[];
};

export type updateMCPToolsResponse = {};

async function handler(
  req: ApiRequestProps<updateMCPToolsBody, updateMCPToolsQuery>,
  _res: ApiResponseType<updateMCPToolsResponse>
): Promise<updateMCPToolsResponse> {
  const { appId, url, toolList, headers = {}, headerSecret = {} } = req.body;
  const { app } = await authApp({ req, authToken: true, appId, per: ManagePermissionVal });

  const toolSetRuntimeNode = getMCPToolSetRuntimeNode({
    url,
    toolList,
    headers,
    headerSecret,
    name: app.name,
    avatar: app.avatar,
    toolId: `mcp-${appId}`
  }) as any;

  await mongoSessionRun(async (session) => {
    await MongoApp.updateOne(
      { _id: appId },
      { modules: [toolSetRuntimeNode], updateTime: new Date() },
      { session }
    );
    await MongoAppVersion.updateOne(
      { appId },
      { $set: { nodes: [toolSetRuntimeNode] } },
      { session }
    );
  });

  return {};
}

export default NextAPI(handler);
