import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { authTeamByTeamId } from '@fastgpt/service/support/permission/user/auth';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';
import {
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { teamId: currentTeamId } = await parseHeaderCert({ req, authToken: true });
    const { teamId: queryTeamId } = req.query as { teamId?: string };
    const teamId = queryTeamId || currentTeamId;
    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        error: '团队ID不能为空'
      });
    }

    await authTeamByTeamId({
      req,
      teamId,
      per: ReadPermissionVal
    });

    const members = await MongoTeamMember.find({
      teamId,
      status: { $ne: TeamMemberStatusEnum.leave }
    }).lean();
    const tmbIds = members.map((member) => member._id);
    const userIds = members.map((member) => member.userId);
    const [team, users, resourcePermissions] = await Promise.all([
      MongoTeam.findById(teamId).select('defaultPermission').lean(),
      MongoUser.find({ _id: { $in: userIds } })
        .select('_id username avatar')
        .lean(),
      MongoResourcePermission.find({
        teamId,
        tmbId: { $in: tmbIds },
        resourceType: PerResourceTypeEnum.team
      }).lean()
    ]);

    if (!team) {
      return jsonRes(res, {
        code: 404,
        error: '团队不存在'
      });
    }

    const userMap = new Map(users.map((user) => [String(user._id), user]));
    const permissionMap = new Map(
      resourcePermissions.map((item) => [String(item.tmbId), item.permission])
    );
    const result = members.map((member) => {
      const user = userMap.get(String(member.userId));

      return {
        userId: String(member.userId),
        tmbId: String(member._id),
        teamId: String(member.teamId),
        memberName: member.name || user?.username || '',
        avatar: user?.avatar || '',
        role: member.role === TeamMemberRoleEnum.owner ? TeamMemberRoleEnum.owner : undefined,
        status: member.status,
        permission: new TeamPermission({
          per: permissionMap.get(String(member._id)) ?? team.defaultPermission,
          isOwner: member.role === TeamMemberRoleEnum.owner
        })
      };
    });

    return jsonRes(res, {
      code: 200,
      data: result
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
