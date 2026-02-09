import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { parseHeaderCert, getResourcePermission } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { GlobalVariablePermission } from '@fastgpt/global/support/permission/globalVariable/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { MongoTeamGlobalVariableGroup } from '../../globalVariable/schema';
import { AuthModeType, AuthResponseType } from '../type';
import { TeamGlobalVariableGroupSchemaType } from '@fastgpt/global/support/globalVariable/type';

export const authGlobalVariableGroupByTmbId = async ({
  teamId,
  tmbId,
  groupId,
  per,
  isRoot = false
}: {
  teamId: string;
  tmbId: string;
  groupId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  group: TeamGlobalVariableGroupSchemaType & {
    permission: GlobalVariablePermission;
  };
}> => {
  const [{ teamId: tmbTeamId, permission: tmbPer }, group] = await Promise.all([
    getTmbInfoByTmbId({ tmbId }),
    MongoTeamGlobalVariableGroup.findById(groupId).lean()
  ]);

  if (!group) {
    return Promise.reject('分组不存在');
  }

  if (!isRoot && String(tmbTeamId) !== String(teamId)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }
  if (!isRoot && String(group.teamId) !== String(teamId)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  const isOwner = isRoot || tmbPer.isOwner || String(group.tmbId) === String(tmbId);
  const rp = isRoot
    ? null
    : await getResourcePermission({
        teamId,
        tmbId,
        resourceId: group._id,
        resourceType: PerResourceTypeEnum.globalVariable
      });

  const permission = new GlobalVariablePermission({
    per: rp?.permission ?? group.defaultPermission,
    isOwner
  });

  if (!permission.checkPer(per)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    group: {
      ...group,
      permission
    }
  };
};

export const authGlobalVariableGroup = async ({
  groupId,
  per,
  ...props
}: AuthModeType & {
  groupId: string;
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    group: TeamGlobalVariableGroupSchemaType & {
      permission: GlobalVariablePermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);

  const { group } = await authGlobalVariableGroupByTmbId({
    teamId: result.teamId,
    tmbId: result.tmbId,
    groupId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: group.permission,
    group
  };
};
