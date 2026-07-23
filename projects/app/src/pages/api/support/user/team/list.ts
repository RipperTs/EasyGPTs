import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { userId } = await parseHeaderCert({
      req,
      authToken: true
    });
    const { status = TeamMemberStatusEnum.active } = req.query as { status?: string };

    const teamMembers = await MongoTeamMember.find({
      userId,
      status
    }).lean();
    const teamIds = teamMembers.map((member) => member.teamId);
    const tmbIds = teamMembers.map((member) => member._id);
    const [teams, resourcePermissions] = await Promise.all([
      MongoTeam.find({ _id: { $in: teamIds } }).lean(),
      MongoResourcePermission.find({
        teamId: { $in: teamIds },
        tmbId: { $in: tmbIds },
        resourceType: PerResourceTypeEnum.team
      }).lean()
    ]);

    const teamMap = new Map(teams.map((team) => [String(team._id), team]));
    const permissionMap = new Map(
      resourcePermissions.map((item) => [String(item.tmbId), item.permission])
    );
    const result = teamMembers.flatMap((member) => {
      const team = teamMap.get(String(member.teamId));
      if (!team) return [];

      return {
        userId: String(member.userId),
        teamId: String(member.teamId),
        teamName: team.name,
        memberName: member.name,
        avatar: team.avatar,
        balance: team.balance,
        tmbId: String(member._id),
        teamDomain: team.teamDomain,
        role: member.role === TeamMemberRoleEnum.owner ? TeamMemberRoleEnum.owner : undefined,
        status: member.status,
        defaultTeam: member.defaultTeam,
        lafAccount: team.lafAccount,
        notificationAccount: team.notificationAccount,
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
