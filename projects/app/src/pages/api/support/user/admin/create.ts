import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { authRootUser } from '@/service/support/user/admin/auth';

export type AdminCreateUserBody = {
  username: string;
  password: string;
};

export type AdminCreateUserResponse = {
  userId: string;
};

async function handler(
  req: ApiRequestProps<AdminCreateUserBody>,
  _res: ApiResponseType<unknown>
): Promise<AdminCreateUserResponse> {
  await authRootUser(req);

  const username = (req.body.username || '').trim();
  const password = String(req.body.password || '');

  if (!username || !password) return Promise.reject('缺少参数');
  if (username === 'root') return Promise.reject('不可创建 root 用户');
  if (password.length > 60) return Promise.reject('密码长度不能超过 60');

  const exist = await MongoUser.findOne({ username }, '_id').lean();
  if (exist) return Promise.reject('用户名已存在');

  let userId = '';
  await mongoSessionRun(async (session) => {
    const [{ _id }] = await MongoUser.create(
      [
        {
          username,
          password: hashStr(password)
        }
      ],
      { session }
    );
    userId = String(_id);
    await createDefaultTeam({
      userId,
      teamName: `${username}的团队`,
      balance: 0,
      session
    });
  });

  return { userId };
}

export default NextAPI(handler);
