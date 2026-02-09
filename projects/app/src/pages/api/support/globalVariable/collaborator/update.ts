import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authGlobalVariable } from '@fastgpt/service/support/permission/globalVariable/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { UpdateGlobalVariableCollaboratorBody } from '@fastgpt/global/support/globalVariable/api';

async function handler(req: ApiRequestProps<UpdateGlobalVariableCollaboratorBody>) {
  const { tmbIds, permission } = req.body;

  if (!Array.isArray(tmbIds) || tmbIds.length === 0 || permission === undefined) {
    throw new Error('缺少参数');
  }

  const { teamId, globalVariable } = await authGlobalVariable({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  await mongoSessionRun(async (session) => {
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.globalVariable,
        resourceId: globalVariable._id,
        teamId,
        tmbId: { $in: tmbIds }
      },
      { session }
    );

    await MongoResourcePermission.insertMany(
      tmbIds.map((tmbId: string) => ({
        resourceType: PerResourceTypeEnum.globalVariable,
        resourceId: globalVariable._id,
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
