import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { parseHeaderCert, getResourcePermission } from '../controller';
import { getTmbInfoByTmbId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { GlobalVariablePermission } from '@fastgpt/global/support/permission/globalVariable/controller';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { GlobalVariableDefaultPermissionVal } from '@fastgpt/global/support/permission/globalVariable/constant';
import { MongoTeamGlobalVariable } from '../../globalVariable/schema';
import { AuthModeType, AuthResponseType } from '../type';
import { TeamGlobalVariableSchemaType } from '@fastgpt/global/support/globalVariable/type';

const getOrCreateGlobalVariable = async ({
  teamId,
  tmbId
}: {
  teamId: string;
  tmbId: string;
}): Promise<TeamGlobalVariableSchemaType> => {
  const resource = await MongoTeamGlobalVariable.findOne({ teamId }).lean();
  if (resource) return resource;

  try {
    const created = await MongoTeamGlobalVariable.create({
      teamId,
      tmbId,
      variables: [],
      defaultPermission: GlobalVariableDefaultPermissionVal,
      inheritPermission: true
    });
    return created.toObject();
  } catch (error) {
    const exists = await MongoTeamGlobalVariable.findOne({ teamId }).lean();
    if (!exists) throw error;
    return exists;
  }
};

export const authGlobalVariableByTmbId = async ({
  teamId,
  tmbId,
  per,
  isRoot = false
}: {
  teamId: string;
  tmbId: string;
  per: PermissionValueType;
  isRoot?: boolean;
}): Promise<{
  globalVariable: TeamGlobalVariableSchemaType & {
    permission: GlobalVariablePermission;
  };
}> => {
  const [{ teamId: tmbTeamId, permission: tmbPer }, resource] = await Promise.all([
    getTmbInfoByTmbId({ tmbId }),
    getOrCreateGlobalVariable({ teamId, tmbId })
  ]);

  if (!isRoot && String(tmbTeamId) !== String(teamId)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  const isOwner = isRoot || tmbPer.isOwner || String(resource.tmbId) === String(tmbId);

  const rp = isRoot
    ? null
    : await getResourcePermission({
        teamId,
        tmbId,
        resourceId: resource._id,
        resourceType: PerResourceTypeEnum.globalVariable
      });

  const resourcePermission = new GlobalVariablePermission({
    per: rp?.permission ?? resource.defaultPermission,
    isOwner
  });

  if (!resourcePermission.checkPer(per)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    globalVariable: {
      ...resource,
      permission: resourcePermission
    }
  };
};

export const authGlobalVariable = async ({
  per,
  ...props
}: AuthModeType & {
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    globalVariable: TeamGlobalVariableSchemaType & {
      permission: GlobalVariablePermission;
    };
  }
> => {
  const result = await parseHeaderCert(props);

  const { globalVariable } = await authGlobalVariableByTmbId({
    teamId: result.teamId,
    tmbId: result.tmbId,
    per,
    isRoot: result.isRoot
  });

  return {
    ...result,
    permission: globalVariable.permission,
    globalVariable
  };
};
