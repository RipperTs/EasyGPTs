import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authGlobalVariable } from '@fastgpt/service/support/permission/globalVariable/auth';
import {
  ManagePermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { UpdateGlobalVariableBody } from '@fastgpt/global/support/globalVariable/api';
import {
  checkGlobalVariableItems,
  formatGlobalVariableItems
} from '@fastgpt/service/support/globalVariable/controller';
import { MongoTeamGlobalVariable } from '@fastgpt/service/support/globalVariable/schema';

async function handler(req: ApiRequestProps<UpdateGlobalVariableBody>) {
  const { variables, defaultPermission } = req.body;

  if (variables === undefined && defaultPermission === undefined) {
    throw new Error('缺少参数');
  }

  const requireManagePermission = defaultPermission !== undefined;
  const { globalVariable } = await authGlobalVariable({
    req,
    authToken: true,
    per: requireManagePermission ? ManagePermissionVal : WritePermissionVal
  });

  const updateData: {
    variables?: { key: string; value: string }[];
    defaultPermission?: number;
    updateTime: Date;
  } = {
    updateTime: new Date()
  };

  if (variables !== undefined) {
    const formattedVariables = formatGlobalVariableItems(variables);
    checkGlobalVariableItems(formattedVariables);
    updateData.variables = formattedVariables;
  }
  if (defaultPermission !== undefined) {
    updateData.defaultPermission = defaultPermission;
  }

  await MongoTeamGlobalVariable.findByIdAndUpdate(globalVariable._id, updateData);

  return true;
}

export default NextAPI(handler);
