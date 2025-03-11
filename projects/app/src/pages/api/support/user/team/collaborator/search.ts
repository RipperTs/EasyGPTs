import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息和团队ID
    const { userId, teamId: currentTeamId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取查询参数
    const { keyword = '', teamId = currentTeamId } = req.query as {
      keyword?: string;
      teamId?: string;
    };

    if (!keyword || !teamId) {
      return jsonRes(res, {
        code: 200,
        data: []
      });
    }

    // 获取团队成员的用户ID列表
    const teamMembers = await MongoTeamMember.find({
      teamId,
      status: TeamMemberStatusEnum.active
    }).lean();

    const teamMemberUserIds = teamMembers.map((member) => member.userId);

    // 搜索团队内的用户
    const users = await MongoUser.find({
      username: { $regex: keyword, $options: 'i' },
      _id: { $in: teamMemberUserIds, $ne: userId } // 在团队成员中且排除当前用户
    })
      .limit(10)
      .lean();

    // 返回结果
    return jsonRes(res, {
      code: 200,
      data: users.map((user) => ({
        userId: String(user._id),
        username: user.username,
        avatar: user.avatar,
        tmbId: teamMembers
          .find((member) => String(member.userId) === String(user._id))
          ?._id.toString()
      }))
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
