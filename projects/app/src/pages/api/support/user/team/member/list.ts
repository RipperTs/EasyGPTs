import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamPermission } from '@fastgpt/global/support/permission/user/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId, teamId: currentTeamId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求参数中的teamId，如果没有则使用当前用户的teamId
    const { teamId: queryTeamId } = req.query as { teamId?: string };
    const teamId = queryTeamId || currentTeamId;

    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        error: '团队ID不能为空'
      });
    }

    // 获取团队成员列表
    const members = await MongoTeamMember.find({
      teamId
    }).lean();

    // 获取用户信息
    const userIds = members.map((member) => member.userId);
    const users = await MongoUser.find({
      _id: { $in: userIds }
    }).lean();

    // 组合数据
    const result = members.map((member) => {
      const user = users.find((user) => String(user._id) === String(member.userId));

      return {
        userId: String(member.userId),
        tmbId: String(member._id),
        teamId: String(member.teamId),
        memberName: member.name || user?.username || '',
        avatar: user?.avatar || '',
        role: member.role,
        status: member.status,
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
