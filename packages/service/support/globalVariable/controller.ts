import { TeamGlobalVariableItemType } from '@fastgpt/global/support/globalVariable/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authGlobalVariableByTmbId } from '../permission/globalVariable/auth';

export const formatGlobalVariableItems = (variables: TeamGlobalVariableItemType[] = []) => {
  return variables.map((item) => ({
    key: String(item.key ?? '').trim(),
    value: String(item.value ?? '')
  }));
};

export const checkGlobalVariableItems = (variables: TeamGlobalVariableItemType[] = []) => {
  const keySet = new Set<string>();

  variables.forEach((item) => {
    if (!item.key) {
      throw new Error('变量 key 不能为空');
    }
    if (keySet.has(item.key)) {
      throw new Error(`变量 key 重复: ${item.key}`);
    }
    keySet.add(item.key);
  });
};

export const getRuntimeGlobalVariables = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}): Promise<Record<string, string>> => {
  try {
    const { globalVariable } = await authGlobalVariableByTmbId({
      teamId,
      tmbId,
      per: ReadPermissionVal
    });

    return (globalVariable.variables || []).reduce<Record<string, string>>((acc, item) => {
      if (!item?.key) return acc;
      acc[item.key] = item.value;
      return acc;
    }, {});
  } catch (error) {
    return {};
  }
};
