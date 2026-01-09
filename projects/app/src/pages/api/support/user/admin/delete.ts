import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { authRootUser } from '@/service/support/user/admin/auth';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { Types } from '@fastgpt/service/common/mongo';

export type AdminDeleteUserBody = {
  userId: string;
};

export type AdminDeleteUserResponse = true;

async function handler(
  req: ApiRequestProps<AdminDeleteUserBody>,
  _res: ApiResponseType<unknown>
): Promise<AdminDeleteUserResponse> {
  await authRootUser(req);

  const userId = String(req.body.userId || '');
  if (!userId) return Promise.reject('缺少参数');

  const userObjectId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : null;
  if (!userObjectId) return Promise.reject('用户不存在');

  const user = await MongoUser.findById(userObjectId, 'username').lean();
  if (!user) return Promise.reject('用户不存在');
  if (user.username === 'root') return Promise.reject('不可删除 root 用户');

  const ownedTeams = await MongoTeam.find({ ownerId: userObjectId }, '_id').lean();
  for (const team of ownedTeams) {
    const otherMembers = await MongoTeamMember.countDocuments({
      teamId: team._id,
      userId: { $ne: userObjectId }
    });
    if (otherMembers > 0) {
      return Promise.reject('该用户为团队拥有者且团队存在其他成员，请先移交团队后再删除');
    }
  }

  await mongoSessionRun(async (session) => {
    await Promise.all([
      MongoTeamMember.deleteMany({ userId: userObjectId }, { session }),
      MongoTeam.deleteMany({ ownerId: userObjectId }, { session }),
      MongoUser.deleteOne({ _id: userObjectId }, { session })
    ]);
  });

  return true;
}

export default NextAPI(handler);
