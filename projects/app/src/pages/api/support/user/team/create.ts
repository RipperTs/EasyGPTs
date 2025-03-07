import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求体
    const { name, avatar = '/icon/logo.svg' } = req.body as { name: string; avatar?: string };

    if (!name) {
      return jsonRes(res, {
        code: 400,
        error: '团队名称不能为空'
      });
    }

    // 创建团队和团队成员
    const teamId = await mongoSessionRun(async (session) => {
      // 创建团队
      const team = await MongoTeam.create(
        [
          {
            name,
            avatar,
            ownerId: userId
          }
        ],
        { session }
      );

      // 创建团队成员
      await MongoTeamMember.create(
        [
          {
            teamId: team[0]._id,
            userId,
            name: '创建者',
            role: TeamMemberRoleEnum.owner,
            status: TeamMemberStatusEnum.active,
            defaultTeam: false
          }
        ],
        { session }
      );

      return team[0]._id;
    });

    return jsonRes(res, {
      code: 200,
      data: String(teamId)
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
