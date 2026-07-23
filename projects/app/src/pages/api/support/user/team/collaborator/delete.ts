import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authTeamByTeamId } from '@fastgpt/service/support/permission/user/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import {
  ManagePermissionVal,
  PerResourceTypeEnum
} from '@fastgpt/global/support/permission/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { tmbId } = req.query as { tmbId?: string };
    if (!tmbId) {
      return jsonRes(res, {
        code: 400,
        error: '成员ID不能为空'
      });
    }

    const member = await MongoTeamMember.findOne({
      _id: tmbId,
      status: TeamMemberStatusEnum.active
    }).lean();
    if (!member) {
      return jsonRes(res, {
        code: 404,
        error: '成员不存在'
      });
    }
    if (member.role === TeamMemberRoleEnum.owner) {
      return jsonRes(res, {
        code: 403,
        error: '不能重置团队所有者权限'
      });
    }

    const teamId = String(member.teamId);
    const [{ permission: operatorPermission }, targetMember] = await Promise.all([
      authTeamByTeamId({ req, teamId, per: ManagePermissionVal }),
      getTmbInfoByTmbId({ tmbId })
    ]);
    if (!operatorPermission.isOwner && targetMember.permission.hasManagePer) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者可以管理管理员权限'
      });
    }

    await MongoResourcePermission.deleteOne({
      teamId,
      tmbId,
      resourceType: PerResourceTypeEnum.team
    });

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
