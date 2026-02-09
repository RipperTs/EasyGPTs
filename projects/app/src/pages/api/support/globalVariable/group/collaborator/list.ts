import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import { authGlobalVariableGroup } from '@fastgpt/service/support/permission/globalVariable/auth';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';
import { Permission } from '@fastgpt/global/support/permission/controller';
import { MongoUser } from '@fastgpt/service/support/user/schema';

async function handler(
  req: ApiRequestProps<{}, { groupId: string }>
): Promise<CollaboratorItemType[]> {
  const { groupId } = req.query;
  if (!groupId) {
    throw new Error('缺少参数');
  }

  const { teamId, group } = await authGlobalVariableGroup({
    req,
    authToken: true,
    groupId,
    per: ManagePermissionVal
  });

  const collaborators = await MongoResourcePermission.find({
    resourceType: PerResourceTypeEnum.globalVariable,
    resourceId: group._id,
    teamId
  }).lean();

  const tmbIds = collaborators.map((item) => item.tmbId);
  const members = await MongoTeamMember.find({
    teamId,
    _id: { $in: tmbIds }
  }).lean();

  const userIds = members.map((item) => item.userId);
  const users = await MongoUser.find({
    _id: { $in: userIds }
  }).lean();

  return collaborators.map((item) => {
    const member = members.find((member) => String(member._id) === String(item.tmbId));
    const user = users.find((user) => String(user._id) === String(member?.userId));

    return {
      teamId: String(item.teamId),
      tmbId: String(item.tmbId),
      permission: new Permission({ per: item.permission }),
      name: member?.name || '',
      avatar: user?.avatar || '/icon/user.png'
    };
  });
}

export default NextAPI(handler);
