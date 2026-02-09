import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { UpdateGlobalVariableGroupCollaboratorBody } from '@fastgpt/global/support/globalVariable/api';
import { authGlobalVariableGroup } from '@fastgpt/service/support/permission/globalVariable/auth';

async function handler(req: ApiRequestProps<UpdateGlobalVariableGroupCollaboratorBody>) {
  const { groupId, tmbIds, permission } = req.body;

  if (!groupId || !Array.isArray(tmbIds) || tmbIds.length === 0 || permission === undefined) {
    throw new Error('缺少参数');
  }

  const { teamId, group } = await authGlobalVariableGroup({
    req,
    authToken: true,
    groupId,
    per: ManagePermissionVal
  });

  await mongoSessionRun(async (session) => {
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.globalVariable,
        resourceId: group._id,
        teamId,
        tmbId: { $in: tmbIds }
      },
      { session }
    );

    await MongoResourcePermission.insertMany(
      tmbIds.map((tmbId: string) => ({
        resourceType: PerResourceTypeEnum.globalVariable,
        resourceId: group._id,
        teamId,
        tmbId,
        permission
      })),
      { session }
    );
  });

  return true;
}

export default NextAPI(handler);
