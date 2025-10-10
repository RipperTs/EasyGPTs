import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';
import { type McpKeyType } from '@fastgpt/global/support/mcp/type';

export type listQuery = {};
export type listBody = {};
export type listResponse = McpKeyType[];

async function handler(
  req: ApiRequestProps<listBody, listQuery>,
  _res: ApiResponseType<listResponse>
): Promise<listResponse> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  } as any);

  const query = permission.hasManagePer ? { teamId } : { teamId, tmbId };

  const list = (await MongoMcpKey.find(query).lean().sort({ _id: -1 })) as any as McpKeyType[];
  return list;
}

export default NextAPI(handler);
