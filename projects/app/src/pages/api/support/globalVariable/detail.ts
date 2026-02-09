import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authGlobalVariable } from '@fastgpt/service/support/permission/globalVariable/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamGlobalVariableDetailType } from '@fastgpt/global/support/globalVariable/type';

async function handler(_req: ApiRequestProps): Promise<TeamGlobalVariableDetailType> {
  const { globalVariable } = await authGlobalVariable({
    req: _req,
    authToken: true,
    per: ReadPermissionVal
  });

  return globalVariable;
}

export default NextAPI(handler);
