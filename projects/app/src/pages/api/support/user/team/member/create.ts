import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  ManagePermissionVal,
  PerResourceTypeEnum,
  ReadPermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { teamId } = await authUserPer({
      req,
      authToken: true,
      per: ManagePermissionVal
    });
    const { userId } = req.body as { userId?: string };
    if (!userId) {
      return jsonRes(res, {
        code: 400,
        error: '用户ID不能为空'
      });
    }

    const [user, existingMember] = await Promise.all([
      MongoUser.findById(userId).select('_id username').lean(),
      MongoTeamMember.findOne({ teamId, userId }).lean()
    ]);
    if (!user) {
      return jsonRes(res, {
        code: 404,
        error: '用户不存在'
      });
    }
    if (existingMember && existingMember.status !== TeamMemberStatusEnum.leave) {
      return jsonRes(res, {
        code: 200,
        data: { tmbId: String(existingMember._id) }
      });
    }

    const tmbId = await mongoSessionRun(async (session) => {
      const memberId = await (async () => {
        if (existingMember) {
          await MongoTeamMember.updateOne(
            { _id: existingMember._id },
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
          return existingMember._id;
        }

        const [member] = await MongoTeamMember.create(
          [
            {
              teamId,
              userId,
              name: user.username,
              status: TeamMemberStatusEnum.active,
              defaultTeam: false,
              createTime: new Date()
            }
          ],
          { session }
        );
        return member._id;
      })();

      await MongoResourcePermission.deleteMany(
        {
          teamId,
          tmbId: memberId,
          resourceType: PerResourceTypeEnum.team
        },
        { session }
      );
      await MongoResourcePermission.create(
        [
          {
            teamId,
            tmbId: memberId,
            resourceType: PerResourceTypeEnum.team,
            permission: ReadPermissionVal
          }
        ],
        { session }
      );

      return String(memberId);
    });

    return jsonRes(res, {
      code: 200,
      data: { tmbId }
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
