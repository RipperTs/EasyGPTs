import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  checkGlobalVariableGroupKey,
  checkGlobalVariableGroupKeyUnique,
  checkGlobalVariableGroupName
} from '@fastgpt/service/support/globalVariable/controller';
import { CreateGlobalVariableGroupBody } from '@fastgpt/global/support/globalVariable/api';
import { MongoTeamGlobalVariableGroup } from '@fastgpt/service/support/globalVariable/schema';
import { GlobalVariableDefaultPermissionVal } from '@fastgpt/global/support/permission/globalVariable/constant';

async function handler(req: ApiRequestProps<CreateGlobalVariableGroupBody>) {
  const { name, groupKey } = req.body;

  const groupName = checkGlobalVariableGroupName(name);
  const groupKeyValue = checkGlobalVariableGroupKey(groupKey);

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: WritePermissionVal
  });

  await checkGlobalVariableGroupKeyUnique({
    teamId,
    groupKey: groupKeyValue
  });

  const group = await MongoTeamGlobalVariableGroup.create({
    teamId,
    tmbId,
    name: groupName,
    groupKey: groupKeyValue,
    variables: [],
    defaultPermission: GlobalVariableDefaultPermissionVal,
    inheritPermission: true,
    updateTime: new Date()
  });

  return group.toObject();
}

export default NextAPI(handler);
