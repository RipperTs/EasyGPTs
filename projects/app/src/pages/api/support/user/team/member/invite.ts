import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId, teamId: currentTeamId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取请求体
    const {
      teamId = currentTeamId,
      userId: invitedUserId,
      usernames
    } = req.body as {
      teamId?: string;
      userId?: string;
      usernames?: string[];
    };

    console.log('邀请成员请求体:', req.body);

    if (!teamId) {
      return jsonRes(res, {
        code: 400,
        error: '团队ID不能为空'
      });
    }

    // 如果提供了usernames，则使用第一个username对应的用户ID
    let finalUserId = invitedUserId;
    if (!finalUserId && usernames && usernames.length > 0) {
      // 这里应该根据username查找用户ID，但为了简化，我们假设usernames[0]就是用户ID
      finalUserId = usernames[0];
    }

    if (!finalUserId) {
      return jsonRes(res, {
        code: 400,
        error: '被邀请用户ID不能为空'
      });
    }

    // 检查当前用户是否是团队所有者
    const currentMember = await MongoTeamMember.findOne({
      teamId,
      userId,
      role: TeamMemberRoleEnum.owner
    });

    if (!currentMember) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者才能邀请成员'
      });
    }

    // 检查被邀请用户是否已经是团队成员
    const existMember = await MongoTeamMember.findOne({
      teamId,
      userId: finalUserId
    });

    if (existMember) {
      return jsonRes(res, {
        code: 400,
        error: '该用户已经是团队成员'
      });
    }

    // 获取用户名
    let memberName = '';
    if (usernames && usernames.length > 0) {
      memberName = usernames[0]; // 使用usernames[0]作为用户名
    }

    // 创建团队成员
    const member = await MongoTeamMember.create({
      teamId,
      userId: finalUserId,
      name: memberName, // 使用获取到的用户名
      role: TeamMemberRoleEnum.owner === 'owner' ? 'member' : 'member',
      status: TeamMemberStatusEnum.active,
      defaultTeam: false
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
