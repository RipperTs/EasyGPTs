import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取查询参数
    const { status = TeamMemberStatusEnum.active } = req.query as { status?: string };

    // 获取用户所在的团队成员记录
    const teamMembers = await MongoTeamMember.find({
      userId,
      status
    }).lean();

    // 获取团队信息
    const teamIds = teamMembers.map((member) => member.teamId);
    const teams = await MongoTeam.find({
      _id: { $in: teamIds }
    }).lean();

    // 组合数据
    const result = teamMembers.map((member) => {
      const team = teams.find((team) => String(team._id) === String(member.teamId));

      return {
        teamId: String(member.teamId),
        teamName: team?.name || '',
        avatar: team?.avatar || '',
        role: member.role,
        status: member.status,
        tmbId: String(member._id),
        permission: new TeamPermission({
          per: 0,
          isOwner: member.role === 'owner' // 根据role字段设置isOwner
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
