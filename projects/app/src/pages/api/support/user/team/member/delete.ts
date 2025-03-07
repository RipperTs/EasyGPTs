import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId, teamId: currentTeamId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求参数
    const { tmbId } = req.query as { tmbId: string };

    if (!tmbId) {
      return jsonRes(res, {
        code: 400,
        error: '成员ID不能为空'
      });
    }

    // 获取要删除的成员信息
    const memberToDelete = await MongoTeamMember.findById(tmbId);

    if (!memberToDelete) {
      return jsonRes(res, {
        code: 404,
        error: '成员不存在'
      });
    }

    const teamId = String(memberToDelete.teamId);

    // 检查当前用户是否是团队所有者
    const currentMember = await MongoTeamMember.findOne({
      teamId,
      userId,
      role: TeamMemberRoleEnum.owner
    });

    if (!currentMember) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者才能移除成员'
      });
    }

    // 不能移除自己
    if (String(memberToDelete.userId) === userId) {
      return jsonRes(res, {
        code: 400,
        error: '不能移除自己'
      });
    }

    // 不能移除其他所有者
    if (memberToDelete.role === TeamMemberRoleEnum.owner) {
      return jsonRes(res, {
        code: 400,
        error: '不能移除团队所有者'
      });
    }

    // 删除成员
    await MongoTeamMember.findByIdAndDelete(tmbId);

    return jsonRes(res, {
      code: 200,
      data: true
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
