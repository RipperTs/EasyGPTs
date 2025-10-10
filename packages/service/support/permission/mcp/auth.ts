import { type PermissionValueType } from '@fastgpt/global/support/permission/type';
import { type AuthModeType, type AuthResponseType } from '../type';
import { authUserPer } from '../user/auth';
import { MongoMcpKey } from '../../mcp/schema';
import { TeamErrEnum } from '@fastgpt/global/common/error/code/team';
import { type McpKeyType } from '@fastgpt/global/support/mcp/type';

export const authMcp = async ({
  mcpId,
  per,
  ...props
}: AuthModeType & {
  mcpId: string;
  per: PermissionValueType;
}): Promise<
  AuthResponseType & {
    mcp: McpKeyType;
    isRoot?: boolean;
  }
> => {
  const result = await authUserPer({ ...props, per });
  const { teamId, tmbId, permission } = result;
  const isRoot = 'tmb' in result && result.tmb.role === 'owner';

  const mcp = await MongoMcpKey.findOne({ _id: mcpId }).lean();

  if (!mcp) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  if (teamId !== String(mcp.teamId)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  if (!permission.hasManagePer && !isRoot && tmbId !== String(mcp.tmbId)) {
    return Promise.reject(TeamErrEnum.unAuthTeam);
  }

  return {
    mcp: mcp as McpKeyType,
    teamId,
    tmbId,
    permission,
    isRoot
  };
};
