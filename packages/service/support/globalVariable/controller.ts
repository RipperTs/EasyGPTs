import {
  TeamGlobalVariableGroupDetailType,
  TeamGlobalVariableGroupSchemaType,
  TeamGlobalVariableItemType
} from '@fastgpt/global/support/globalVariable/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authGlobalVariableGroupByTmbId } from '../permission/globalVariable/auth';
import { MongoTeamGlobalVariableGroup } from './schema';
import { getTmbInfoByTmbId } from '../user/team/controller';
import { GlobalVariablePermission } from '@fastgpt/global/support/permission/globalVariable/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '../permission/schema';

export const GROUP_KEY_REG = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const VARIABLE_KEY_REG = /^[A-Za-z_][A-Za-z0-9_]*$/;

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
    if (!VARIABLE_KEY_REG.test(item.key)) {
      throw new Error(`变量 key 格式不正确: ${item.key}`);
    }
    if (keySet.has(item.key)) {
      throw new Error(`变量 key 重复: ${item.key}`);
    }
    keySet.add(item.key);
  });
};

export const checkGlobalVariableGroupKey = (groupKey: string) => {
  const key = String(groupKey || '').trim();
  if (!key) {
    throw new Error('分组标识不能为空');
  }
  if (!GROUP_KEY_REG.test(key)) {
    throw new Error('分组标识仅支持字母、数字、下划线，且不能以数字开头');
  }
  return key;
};

export const checkGlobalVariableGroupName = (name: string) => {
  const groupName = String(name || '').trim();
  if (!groupName) {
    throw new Error('分组名称不能为空');
  }
  return groupName;
};

const withPermission = ({
  group,
  perValue,
  isOwner
}: {
  group: TeamGlobalVariableGroupSchemaType;
  perValue?: number;
  isOwner: boolean;
}): TeamGlobalVariableGroupDetailType => {
  const permission = new GlobalVariablePermission({
    per: perValue ?? group.defaultPermission,
    isOwner
  });

  return {
    ...group,
    permission
  };
};

export const getGlobalVariableGroupListByTmbId = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}) => {
  const [{ permission: tmbPer, teamId: tmbTeamId }, groups, collaboratorList] = await Promise.all([
    getTmbInfoByTmbId({ tmbId }),
    MongoTeamGlobalVariableGroup.find({ teamId }).sort({ updateTime: -1 }).lean(),
    MongoResourcePermission.find({
      teamId,
      resourceType: PerResourceTypeEnum.globalVariable
    }).lean()
  ]);

  if (String(tmbTeamId) !== String(teamId)) {
    return [];
  }

  return groups
    .map((group) => {
      const perValue = collaboratorList.find(
        (item) =>
          String(item.resourceId) === String(group._id) && String(item.tmbId) === String(tmbId)
      )?.permission;

      return withPermission({
        group,
        perValue,
        isOwner: tmbPer.isOwner || String(group.tmbId) === String(tmbId)
      });
    })
    .filter((group) => group.permission.hasReadPer);
};

export const getRuntimeGlobalVariables = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}): Promise<Record<string, string>> => {
  try {
    const groups = await getGlobalVariableGroupListByTmbId({
      teamId,
      tmbId
    });

    return groups.reduce<Record<string, string>>((acc, group) => {
      group.variables.forEach((item) => {
        if (!item?.key) return;
        acc[`${group.groupKey}.${item.key}`] = item.value;
      });
      return acc;
    }, {});
  } catch (error) {
    return {};
  }
};

export const checkGlobalVariableGroupKeyUnique = async ({
  teamId,
  groupKey,
  excludeGroupId
}: {
  teamId: string;
  groupKey: string;
  excludeGroupId?: string;
}) => {
  const target = await MongoTeamGlobalVariableGroup.findOne({
    teamId,
    groupKey,
    ...(excludeGroupId ? { _id: { $ne: excludeGroupId } } : {})
  }).lean();

  if (target) {
    throw new Error(`分组标识重复: ${groupKey}`);
  }
};

export const authGlobalVariableGroupRead = async ({
  teamId,
  tmbId,
  groupId
}: {
  teamId: string;
  tmbId: string;
  groupId: string;
}) => {
  return authGlobalVariableGroupByTmbId({
    teamId,
    tmbId,
    groupId,
    per: ReadPermissionVal
  });
};
