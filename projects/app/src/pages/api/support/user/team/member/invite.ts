import type { NextApiRequest, NextApiResponse } from 'next';
import type {
  InviteMemberProps,
  InviteMemberResponse
} from '@fastgpt/global/support/user/team/controller';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authTeamByTeamId } from '@fastgpt/service/support/permission/user/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

const TEAM_PERMISSION_VALUES = [ReadPermissionVal, WritePermissionVal, ManagePermissionVal];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { teamId, usernames, permission } = req.body as InviteMemberProps;
    const normalizedUsernames = [
      ...new Set(usernames?.map((username) => username.trim()).filter(Boolean))
    ];

    if (
      !teamId ||
      normalizedUsernames.length === 0 ||
      !TEAM_PERMISSION_VALUES.includes(permission)
    ) {
      return jsonRes(res, {
        code: 400,
        error: '团队、用户或权限参数无效'
      });
    }

    const { permission: operatorPermission } = await authTeamByTeamId({
      req,
      teamId,
      per: ManagePermissionVal
    });

    if (permission === ManagePermissionVal && !operatorPermission.isOwner) {
      return jsonRes(res, {
        code: 403,
        error: '只有团队所有者可以授予管理权限'
      });
    }

    const users = await MongoUser.find({
      username: { $in: normalizedUsernames }
    })
      .select('_id username')
      .lean();
    const userIds = users.map((user) => user._id);
    const existingMembers = await MongoTeamMember.find({
      teamId,
      userId: { $in: userIds }
    }).lean();

    const activeUserIds = new Set(
      existingMembers
        .filter((member) => member.status !== TeamMemberStatusEnum.leave)
        .map((member) => String(member.userId))
    );
    const inviteUsers = users.filter((user) => !activeUserIds.has(String(user._id)));

    await mongoSessionRun(async (session) => {
      const invitedTmbIds: string[] = [];
      for (const user of inviteUsers) {
        const leftMember = existingMembers.find(
          (member) =>
            String(member.userId) === String(user._id) &&
            member.status === TeamMemberStatusEnum.leave
        );

        if (leftMember) {
          await MongoTeamMember.updateOne(
            { _id: leftMember._id },
            {
              $set: {
                name: user.username,
                status: TeamMemberStatusEnum.active,
                defaultTeam: false
              },
              $unset: { role: 1 }
            },
            { session }
          );
          invitedTmbIds.push(String(leftMember._id));
          continue;
        }

        const [member] = await MongoTeamMember.create(
          [
            {
              teamId,
              userId: user._id,
              name: user.username,
              status: TeamMemberStatusEnum.active,
              defaultTeam: false,
              createTime: new Date()
            }
          ],
          { session }
        );
        invitedTmbIds.push(String(member._id));
      }

      if (invitedTmbIds.length === 0) return;

      await MongoResourcePermission.deleteMany(
        {
          teamId,
          tmbId: { $in: invitedTmbIds },
          resourceType: PerResourceTypeEnum.team
        },
        { session }
      );
      await MongoResourcePermission.insertMany(
        invitedTmbIds.map((tmbId) => ({
          teamId,
          tmbId,
          resourceType: PerResourceTypeEnum.team,
          permission
        })),
        { session }
      );
    });

    const userMap = new Map(users.map((user) => [user.username, user]));
    const result: InviteMemberResponse = {
      invite: inviteUsers.map((user) => ({
        username: user.username,
        userId: String(user._id)
      })),
      inValid: normalizedUsernames
        .filter((username) => !userMap.has(username))
        .map((username) => ({ username, userId: '' })),
      inTeam: users
        .filter((user) => activeUserIds.has(String(user._id)))
        .map((user) => ({
          username: user.username,
          userId: String(user._id)
        }))
    };

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
