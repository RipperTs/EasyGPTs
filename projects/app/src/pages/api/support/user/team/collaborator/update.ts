import type { NextApiRequest, NextApiResponse } from 'next';
import type { UpdateClbPermissionProps } from '@fastgpt/global/support/permission/collaborator';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authTeamByTeamId } from '@fastgpt/service/support/permission/user/auth';
import { getTmbInfoByTmbId } from '@fastgpt/service/support/user/team/controller';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

const TEAM_PERMISSION_VALUES = [ReadPermissionVal, WritePermissionVal, ManagePermissionVal];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { tmbIds, permission } = req.body as UpdateClbPermissionProps;
    if (!Array.isArray(tmbIds)) {
      return jsonRes(res, {
        code: 400,
        error: '成员或权限参数无效'
      });
    }
    const uniqueTmbIds = [...new Set(tmbIds)];
    if (uniqueTmbIds.length === 0 || !TEAM_PERMISSION_VALUES.includes(permission)) {
      return jsonRes(res, {
        code: 400,
        error: '成员或权限参数无效'
      });
    }

    const members = await MongoTeamMember.find({
      _id: { $in: uniqueTmbIds },
      status: TeamMemberStatusEnum.active
    }).lean();
    if (members.length !== uniqueTmbIds.length) {
      return jsonRes(res, {
        code: 400,
        error: '存在无效的团队成员'
      });
    }

    const teamIds = new Set(members.map((member) => String(member.teamId)));
    if (teamIds.size !== 1) {
      return jsonRes(res, {
        code: 400,
        error: '不能同时修改不同团队的成员权限'
      });
    }

    const teamId = String(members[0].teamId);
    const { permission: operatorPermission } = await authTeamByTeamId({
      req,
      teamId,
      per: ManagePermissionVal
    });
    const targetMembers = await Promise.all(
      members.map((member) => getTmbInfoByTmbId({ tmbId: String(member._id) }))
    );

    if (members.some((member) => member.role === TeamMemberRoleEnum.owner)) {
      return jsonRes(res, {
        code: 403,
        error: '不能修改团队所有者权限'
      });
    }
    if (
      !operatorPermission.isOwner &&
      (permission === ManagePermissionVal ||
        targetMembers.some((member) => member.permission.hasManagePer))
    ) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者可以管理管理员权限'
      });
    }

    await mongoSessionRun(async (session) => {
      await MongoResourcePermission.deleteMany(
        {
          teamId,
          tmbId: { $in: uniqueTmbIds },
          resourceType: PerResourceTypeEnum.team
        },
        { session }
      );
      await MongoResourcePermission.insertMany(
        uniqueTmbIds.map((tmbId) => ({
          teamId,
          tmbId,
          resourceType: PerResourceTypeEnum.team,
          permission
        })),
        { session }
      );
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
