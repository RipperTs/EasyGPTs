import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authGlobalVariable } from '@fastgpt/service/support/permission/globalVariable/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { GlobalVariableCollaboratorDeleteParams } from '@fastgpt/global/support/globalVariable/api';

async function handler(req: ApiRequestProps<{}, GlobalVariableCollaboratorDeleteParams>) {
  const { tmbId } = req.query;
  if (!tmbId) {
    throw new Error('缺少参数');
  }

  const { teamId, globalVariable } = await authGlobalVariable({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  await MongoResourcePermission.deleteOne({
    resourceType: PerResourceTypeEnum.globalVariable,
    resourceId: globalVariable._id,
    teamId,
    tmbId
  });

  return true;
}

export default NextAPI(handler);
