import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getGlobalVariableGroupListByTmbId } from '@fastgpt/service/support/globalVariable/controller';
import { TeamGlobalVariableGroupDetailType } from '@fastgpt/global/support/globalVariable/type';

async function handler(_req: ApiRequestProps): Promise<TeamGlobalVariableGroupDetailType[]> {
  const { teamId, tmbId } = await authUserPer({
    req: _req,
    authToken: true,
    per: ReadPermissionVal
  });

  return getGlobalVariableGroupListByTmbId({
    teamId,
    tmbId
  });
}

export default NextAPI(handler);
