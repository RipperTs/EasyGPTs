import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import { parseHeaderCert } from '../controller';
import { getTmbInfoByTmbId, getTmbInfoByUserIdAndTeamId } from '../../user/team/controller';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { AuthModeType, AuthResponseType } from '../type';
import { NullPermission } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';

/* auth user role  */
export async function authUserPer(props: AuthModeType): Promise<
  AuthResponseType & {
    tmb: TeamTmbItemType;
  }
> {
  const result = await parseHeaderCert(props);
  const tmb = await getTmbInfoByTmbId({ tmbId: result.tmbId });

  if (result.isRoot) {
    return {
      ...result,
      permission: new TeamPermission({
        isOwner: true
      }),
      tmb
    };
  }
  if (!tmb.permission.checkPer(props.per ?? NullPermission)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    ...result,
    permission: tmb.permission,
    tmb
  };
}

export async function authTeamByTeamId({
  req,
  teamId,
  per = NullPermission
}: {
  req: AuthModeType['req'];
  teamId: string;
  per?: PermissionValueType;
}) {
  const result = await parseHeaderCert({ req, authToken: true });
  const tmb = await getTmbInfoByUserIdAndTeamId({
    userId: result.userId,
    teamId
  });

  const permission = result.isRoot ? new TeamPermission({ isOwner: true }) : tmb.permission;

  if (!permission.checkPer(per)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    ...result,
    teamId: tmb.teamId,
    tmbId: tmb.tmbId,
    permission,
    tmb
  };
}
