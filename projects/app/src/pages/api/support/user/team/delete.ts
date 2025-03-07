import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求体
    const { teamId } = req.query as { teamId: string };

    console.log('删除团队API', { teamId, query: req.query, body: req.body });

    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        error: '团队ID不能为空'
      });
    }

    // 检查用户是否是团队所有者
    const teamMember = await MongoTeamMember.findOne({
      teamId,
      userId,
      role: TeamMemberRoleEnum.owner
    });

    if (!teamMember) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者才能删除团队'
      });
    }

    // 删除团队
    await MongoTeam.findByIdAndDelete(teamId);

    // 删除团队成员
    await MongoTeamMember.deleteMany({ teamId });

    return jsonRes(res, {
      code: 200
    });
  } catch (error) {
    console.error('删除团队失败:', error);
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
