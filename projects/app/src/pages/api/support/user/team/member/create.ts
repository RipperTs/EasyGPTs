import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await withNextCors(req, res);

    // 获取当前用户的团队ID
    const { teamId } = await parseHeaderCert({
      req,
      authToken: true
    });

    if (!teamId) {
      return jsonRes(res, {
        code: 500,
        error: '缺少团队ID'
      });
    }

    // 获取请求体
    const { userId } = req.body as { userId: string };

    if (!userId) {
      return jsonRes(res, {
        code: 500,
        error: '缺少用户ID'
      });
    }

    // 检查用户是否已经是团队成员
    const existMember = await MongoTeamMember.findOne({
      teamId,
      userId
    });

    if (existMember) {
      return jsonRes(res, {
        code: 200,
        data: {
          tmbId: String(existMember._id)
        }
      });
    }

    // 创建团队成员
    const member = await MongoTeamMember.create({
      teamId,
      userId,
      name: 'Member', // 默认名称
      role: 'member', // 使用字符串而不是枚举
      status: TeamMemberStatusEnum.active
    });

    return jsonRes(res, {
      code: 200,
      data: {
        tmbId: String(member._id)
      }
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
