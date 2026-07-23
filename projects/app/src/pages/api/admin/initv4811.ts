import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import {
  PerResourceTypeEnum,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import {
  TeamMemberRoleEnum,
  TeamMemberStatusEnum
} from '@fastgpt/global/support/user/team/constant';

type TeamMemberMigrationItem = {
  tmbId: string;
  teamId: string;
};

const BATCH_SIZE = 500;

// 为指定的旧版 active 普通成员补齐团队写权限；显式权限记录不会被覆盖。
async function migrateBatch(teamId: string, members: TeamMemberMigrationItem[]) {
  const existingPermissions = await MongoResourcePermission.find({
    resourceType: PerResourceTypeEnum.team,
    teamId,
    tmbId: { $in: members.map((member) => member.tmbId) }
  })
    .select('teamId tmbId')
    .lean();
  const getPermissionKey = ({ teamId, tmbId }: TeamMemberMigrationItem) => `${teamId}:${tmbId}`;
  const existingPermissionKeys = new Set(
    existingPermissions.map((item) =>
      getPermissionKey({ teamId: String(item.teamId), tmbId: String(item.tmbId) })
    )
  );
  const membersWithoutPermission = members.filter(
    (member) => !existingPermissionKeys.has(getPermissionKey(member))
  );

  if (membersWithoutPermission.length === 0) return 0;

  const result = await MongoResourcePermission.bulkWrite(
    membersWithoutPermission.map((member) => ({
      updateOne: {
        filter: {
          resourceType: PerResourceTypeEnum.team,
          teamId: member.teamId,
          tmbId: member.tmbId
        },
        update: {
          $setOnInsert: {
            resourceType: PerResourceTypeEnum.team,
            teamId: member.teamId,
            tmbId: member.tmbId,
            permission: WritePermissionVal
          }
        },
        upsert: true
      }
    })),
    { ordered: false }
  );

  return result.upsertedCount;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    await authCert({ req, authRoot: true });

    const { teamId, tmbIds } = (req.body ?? {}) as {
      teamId?: string;
      tmbIds?: string[];
    };
    if (
      !teamId ||
      !Array.isArray(tmbIds) ||
      tmbIds.length === 0 ||
      tmbIds.some((tmbId) => typeof tmbId !== 'string' || !tmbId)
    ) {
      return jsonRes(res, {
        code: 400,
        error: '团队或成员参数无效'
      });
    }

    const uniqueTmbIds = [...new Set(tmbIds)];
    const members = await MongoTeamMember.find({
      _id: { $in: uniqueTmbIds },
      teamId,
      status: TeamMemberStatusEnum.active,
      role: { $ne: TeamMemberRoleEnum.owner }
    })
      .select('_id teamId')
      .lean();
    if (members.length !== uniqueTmbIds.length) {
      return jsonRes(res, {
        code: 400,
        error: '存在无效的 active 普通成员'
      });
    }

    const migrationMembers = members.map((member) => {
      return {
        tmbId: String(member._id),
        teamId: String(member.teamId)
      };
    });

    let migrated = 0;
    for (let index = 0; index < migrationMembers.length; index += BATCH_SIZE) {
      const batch = migrationMembers.slice(index, index + BATCH_SIZE);

      migrated += await migrateBatch(teamId, batch);
    }

    return jsonRes(res, {
      data: {
        scanned: migrationMembers.length,
        migrated
      }
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
