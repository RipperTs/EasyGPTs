import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { GlobalVariableCollaboratorDeleteParams } from '@fastgpt/global/support/globalVariable/api';
import { authGlobalVariableGroup } from '@fastgpt/service/support/permission/globalVariable/auth';

async function handler(req: ApiRequestProps<{}, GlobalVariableCollaboratorDeleteParams>) {
  const { groupId, tmbId } = req.query;
  if (!groupId || !tmbId) {
    throw new Error('缺少参数');
  }

  const { teamId, group } = await authGlobalVariableGroup({
    req,
    authToken: true,
    groupId,
    per: ManagePermissionVal
  });

  await MongoResourcePermission.deleteOne({
    resourceType: PerResourceTypeEnum.globalVariable,
    resourceId: group._id,
    teamId,
    tmbId
  });

  return true;
}

export default NextAPI(handler);
