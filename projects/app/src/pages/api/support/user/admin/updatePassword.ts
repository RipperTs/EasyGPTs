import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { authRootUser } from '@/service/support/user/admin/auth';

export type AdminUpdatePasswordBody = {
  userId: string;
  newPassword: string;
};

export type AdminUpdatePasswordResponse = true;

async function handler(
  req: ApiRequestProps<AdminUpdatePasswordBody>,
  _res: ApiResponseType<unknown>
): Promise<AdminUpdatePasswordResponse> {
  await authRootUser(req);

  const userId = String(req.body.userId || '');
  const newPassword = String(req.body.newPassword || '');
  if (!userId || !newPassword) return Promise.reject('缺少参数');
  if (newPassword.length > 60) return Promise.reject('密码长度不能超过 60');

  const user = await MongoUser.findById(userId, 'username').lean();
  if (!user) return Promise.reject('用户不存在');
  if (user.username === 'root') return Promise.reject('不可修改 root 用户密码');

  await MongoUser.findByIdAndUpdate(userId, {
    password: hashStr(newPassword)
  });

  return true;
}

export default NextAPI(handler);
