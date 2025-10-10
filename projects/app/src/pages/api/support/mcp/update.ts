import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authMcp } from '@fastgpt/service/support/permission/mcp/auth';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { type McpAppType } from '@fastgpt/global/support/mcp/type';

export type updateQuery = {};
export type updateBody = {
  id: string;
  name: string;
  apps: McpAppType[];
};
export type updateResponse = {};

async function handler(
  req: ApiRequestProps<updateBody, updateQuery>,
  _res: ApiResponseType<updateResponse>
): Promise<updateResponse> {
  let { id: mcpId, name, apps } = req.body;

  const { tmbId } = await authMcp({
    req,
    authToken: true,
    authApiKey: true,
    mcpId,
    per: WritePermissionVal
  });

  // 去重 appId
  const seen = new Set<string>();
  apps = apps.filter((app) => (seen.has(app.appId) ? false : (seen.add(app.appId), true)));

  // 校验读取权限
  await Promise.all(
    apps.map((app) =>
      authAppByTmbId({
        tmbId,
        appId: app.appId,
        per: ReadPermissionVal
      })
    )
  );

  await MongoMcpKey.updateOne(
    { _id: mcpId },
    {
      $set: {
        ...(name && { name }),
        apps
      }
    }
  );

  return {};
}

export default NextAPI(handler);
