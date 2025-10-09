import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { authAppByTmbId } from '@fastgpt/service/support/permission/app/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoMcpKey } from '@fastgpt/service/support/mcp/schema';

export type createQuery = {};
export type createBody = {
  name: string;
  apps: { appId: string; appName?: string; toolName: string; description: string }[];
};
export type createResponse = {};

async function handler(
  req: ApiRequestProps<createBody, createQuery>,
  _res: ApiResponseType<any>
): Promise<createResponse> {
  const { teamId, tmbId, permission } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true
  } as any);

  if (!permission.hasReadPer) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  let { name, apps } = req.body;
  if (!apps?.length) return Promise.reject(CommonErrEnum.missingParams);

  // 去重
  const uniq = new Set<string>();
  apps = apps.filter((a) => (uniq.has(a.appId) ? false : (uniq.add(a.appId), true)));

  // 校验读取权限
  await Promise.all(
    apps.map((app) => authAppByTmbId({ tmbId, appId: app.appId, per: ReadPermissionVal }))
  );

  await MongoMcpKey.create({ teamId, tmbId, name, apps });
  return {};
}

export default NextAPI(handler);
