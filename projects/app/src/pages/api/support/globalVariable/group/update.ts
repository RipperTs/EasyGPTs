import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { UpdateGlobalVariableGroupBody } from '@fastgpt/global/support/globalVariable/api';
import { authGlobalVariableGroup } from '@fastgpt/service/support/permission/globalVariable/auth';
import {
  checkGlobalVariableGroupKey,
  checkGlobalVariableGroupKeyUnique,
  checkGlobalVariableGroupName,
  checkGlobalVariableItems,
  formatGlobalVariableItems
} from '@fastgpt/service/support/globalVariable/controller';
import { MongoTeamGlobalVariableGroup } from '@fastgpt/service/support/globalVariable/schema';

async function handler(req: ApiRequestProps<UpdateGlobalVariableGroupBody>) {
  const { groupId, name, groupKey, variables, defaultPermission } = req.body;

  if (!groupId) {
    throw new Error('缺少参数');
  }
  if (
    name === undefined &&
    groupKey === undefined &&
    variables === undefined &&
    defaultPermission === undefined
  ) {
    throw new Error('缺少参数');
  }

  const { group, teamId } = await authGlobalVariableGroup({
    req,
    authToken: true,
    groupId,
    per: defaultPermission !== undefined ? ManagePermissionVal : WritePermissionVal
  });

  const updateData: {
    name?: string;
    groupKey?: string;
    variables?: { key: string; value: string }[];
    defaultPermission?: number;
    updateTime: Date;
  } = {
    updateTime: new Date()
  };

  if (name !== undefined) {
    updateData.name = checkGlobalVariableGroupName(name);
  }

  if (groupKey !== undefined) {
    const groupKeyValue = checkGlobalVariableGroupKey(groupKey);
    await checkGlobalVariableGroupKeyUnique({
      teamId,
      groupKey: groupKeyValue,
      excludeGroupId: String(group._id)
    });
    updateData.groupKey = groupKeyValue;
  }

  if (variables !== undefined) {
    const formattedVariables = formatGlobalVariableItems(variables);
    checkGlobalVariableItems(formattedVariables);
    updateData.variables = formattedVariables;
  }

  if (defaultPermission !== undefined) {
    updateData.defaultPermission = defaultPermission;
  }

  await MongoTeamGlobalVariableGroup.findByIdAndUpdate(group._id, updateData);

  return true;
}

export default NextAPI(handler);
