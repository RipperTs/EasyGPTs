import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { authRootUser } from '@/service/support/user/admin/auth';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { Types } from '@fastgpt/service/common/mongo';

export type AdminUserListItem = {
  _id: string;
  username: string;
  avatar: string;
  status: `${UserStatusEnum}`;
  createTime: Date;
  lastLoginTime?: Date;
  timezone: string;
  promotionRate: number;
  lastLoginTmbId?: string;
  currentTeam?: {
    tmbId: string;
    teamId: string;
    teamName: string;
  } | null;
};

export type AdminUserListQuery = {
  pageNum?: string | number;
  pageSize?: string | number;
  keyword?: string;
  status?: `${UserStatusEnum}`;
};

export type AdminUserListResponse = {
  total: number;
  list: AdminUserListItem[];
};

const getPopulatedTeam = (team: unknown): { _id: unknown; name: unknown } | null => {
  if (!team || typeof team !== 'object') return null;
  const teamObj = team as Record<string, unknown>;
  if (!('_id' in teamObj) || !('name' in teamObj)) return null;
  return { _id: teamObj._id, name: teamObj.name };
};

async function handler(
  req: ApiRequestProps<unknown, AdminUserListQuery>,
  _res: ApiResponseType<unknown>
): Promise<AdminUserListResponse> {
  await authRootUser(req);

  const pageNum = Math.max(1, Number(req.query.pageNum ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20) || 20));
  const keyword = (req.query.keyword || '').trim();
  const status = req.query.status;

  const filter: Record<string, unknown> = {};
  if (keyword) {
    filter.username = { $regex: keyword, $options: 'i' };
  }
  if (status) {
    filter.status = status;
  }

  const [total, list] = await Promise.all([
    MongoUser.countDocuments(filter),
    MongoUser.find(
      filter,
      '_id username avatar status createTime lastLoginTime timezone promotionRate lastLoginTmbId'
    )
      .sort({ createTime: -1 })
      .skip((pageNum - 1) * pageSize)
      .limit(pageSize)
      .lean()
  ]);

  const tmbObjectIds = list
    .map((item) => {
      const tmbId = item.lastLoginTmbId ? String(item.lastLoginTmbId) : '';
      if (!tmbId) return null;
      return Types.ObjectId.isValid(tmbId) ? new Types.ObjectId(tmbId) : null;
    })
    .filter((item): item is Types.ObjectId => !!item);

  const tmbList = tmbObjectIds.length
    ? await MongoTeamMember.find(
        {
          _id: { $in: tmbObjectIds }
        },
        '_id teamId'
      )
        .populate('teamId', '_id name')
        .lean()
    : [];

  const tmbTeamMap = new Map<string, { tmbId: string; teamId: string; teamName: string }>();
  for (const tmb of tmbList) {
    const populatedTeam = getPopulatedTeam(tmb.teamId);
    if (!populatedTeam) continue;
    const teamId = String(populatedTeam._id || '');
    const teamName = String(populatedTeam.name || '');
    if (!teamId || !teamName) continue;
    tmbTeamMap.set(String(tmb._id), {
      tmbId: String(tmb._id),
      teamId,
      teamName
    });
  }

  return {
    total,
    list: list.map((item) => ({
      _id: String(item._id),
      username: item.username,
      avatar: item.avatar,
      status: item.status,
      createTime: item.createTime,
      lastLoginTime: item.lastLoginTime,
      timezone: item.timezone,
      promotionRate: item.promotionRate,
      lastLoginTmbId: item.lastLoginTmbId ? String(item.lastLoginTmbId) : undefined,
      currentTeam: item.lastLoginTmbId ? tmbTeamMap.get(String(item.lastLoginTmbId)) || null : null
    }))
  };
}

export default NextAPI(handler);
