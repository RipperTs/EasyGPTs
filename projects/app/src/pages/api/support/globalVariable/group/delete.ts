import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { GlobalVariableGroupDeleteParams } from '@fastgpt/global/support/globalVariable/api';
import { authGlobalVariableGroup } from '@fastgpt/service/support/permission/globalVariable/auth';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoTeamGlobalVariableGroup } from '@fastgpt/service/support/globalVariable/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';

async function handler(req: ApiRequestProps<{}, GlobalVariableGroupDeleteParams>) {
  const { groupId } = req.query;
  if (!groupId) {
    throw new Error('缺少参数');
  }

  const { group } = await authGlobalVariableGroup({
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
        teamId: group.teamId
      },
      { session }
    );
    await MongoTeamGlobalVariableGroup.deleteOne(
      {
        _id: group._id
      },
      { session }
    );
  });

  return true;
}

export default NextAPI(handler);
