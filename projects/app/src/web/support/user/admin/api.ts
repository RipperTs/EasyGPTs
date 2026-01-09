import { GET, POST } from '@/web/common/api/request';
import type { UserStatusEnum } from '@fastgpt/global/support/user/constant';

export type AdminUserListItem = {
  _id: string;
  username: string;
  avatar: string;
  status: `${UserStatusEnum}`;
  createTime: string;
  timezone: string;
  promotionRate: number;
  lastLoginTmbId?: string;
  currentTeam?: {
    tmbId: string;
    teamId: string;
    teamName: string;
  } | null;
};

export const getAdminUserList = async ({
  pageNum,
  pageSize,
  keyword,
  status
}: {
  pageNum: number;
  pageSize: number;
  keyword?: string;
  status?: `${UserStatusEnum}` | '';
}) => {
  const res = await GET<{
    total: number;
    list: AdminUserListItem[];
  }>('/support/user/admin/list', {
    pageNum,
    pageSize,
    keyword,
    status: status || undefined
  });

  return {
    pageNum,
    pageSize,
    total: res.total,
    data: res.list
  };
};

export const adminCreateUser = (data: { username: string; password: string }) =>
  POST<{ userId: string }>('/support/user/admin/create', data);

export const adminUpdateUser = (data: {
  userId: string;
  username?: string;
  status?: `${UserStatusEnum}`;
}) => POST<true>('/support/user/admin/update', data);

export const adminDeleteUser = (data: { userId: string }) =>
  POST<true>('/support/user/admin/delete', data);

export const adminUpdateUserPassword = (data: { userId: string; newPassword: string }) =>
  POST<true>('/support/user/admin/updatePassword', data);
