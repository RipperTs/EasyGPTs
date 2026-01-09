import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { authRootUser } from '@/service/support/user/admin/auth';

export type AdminUpdateUserBody = {
  userId: string;
  username?: string;
  status?: `${UserStatusEnum}`;
  timezone?: string;
  promotionRate?: number;
};

export type AdminUpdateUserResponse = true;

async function handler(
  req: ApiRequestProps<AdminUpdateUserBody>,
  _res: ApiResponseType<unknown>
): Promise<AdminUpdateUserResponse> {
  await authRootUser(req);

  const userId = String(req.body.userId || '');
  if (!userId) return Promise.reject('缺少参数');

  const user = await MongoUser.findById(userId, 'username').lean();
  if (!user) return Promise.reject('用户不存在');
  if (user.username === 'root') return Promise.reject('不可修改 root 用户');

  const update: Partial<{
    username: string;
    status: `${UserStatusEnum}`;
    timezone: string;
    promotionRate: number;
  }> = {};

  if (req.body.username !== undefined) {
    const username = String(req.body.username || '').trim();
    if (!username) return Promise.reject('用户名不能为空');
    if (username !== user.username) {
      const exist = await MongoUser.findOne({ username }, '_id').lean();
      if (exist) return Promise.reject('用户名已存在');
      update.username = username;
    }
  }

  if (req.body.status !== undefined) {
    update.status = req.body.status;
  }
  if (req.body.timezone !== undefined) {
    update.timezone = String(req.body.timezone || '').trim() || 'Asia/Shanghai';
  }
  if (req.body.promotionRate !== undefined) {
    const rate = Number(req.body.promotionRate);
    if (Number.isNaN(rate) || rate < 0 || rate > 100) return Promise.reject('分佣比例需在 0~100');
    update.promotionRate = rate;
  }

  if (Object.keys(update).length === 0) return true;

  await MongoUser.findByIdAndUpdate(userId, update);
  return true;
}

export default NextAPI(handler);
