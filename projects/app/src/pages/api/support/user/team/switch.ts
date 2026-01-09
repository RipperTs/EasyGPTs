import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId, isRoot: isRootFromToken } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求体
    const { teamId } = req.body as { teamId: string };

    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        error: '团队ID不能为空'
      });
    }

    // 检查用户是否是该团队的成员
    const teamMember = await MongoTeamMember.findOne({
      teamId,
      userId,
      status: TeamMemberStatusEnum.active
    });

    if (!teamMember) {
      return jsonRes(res, {
        code: 403,
        error: '您不是该团队的成员'
      });
    }

    // 更新用户最后登录的团队ID
    await MongoUser.updateOne({ _id: userId }, { $set: { lastLoginTmbId: teamMember._id } });

    const isRoot = await (async () => {
      if (isRootFromToken) return true;
      const user = await MongoUser.findById(userId, 'username').lean();
      return user?.username === 'root';
    })();

    // 生成新的JWT token
    const token = createJWT({
      _id: userId,
      team: {
        teamId,
        tmbId: String(teamMember._id)
      },
      isRoot
    });

    // 设置cookie
    setCookie(res, token);

    return jsonRes(res, {
      code: 200,
      data: token
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
