import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { AppFolderTypeList } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '@fastgpt/service/common/mongo';

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';

export type GetAppTrendBody = {
  appId: string;
  days?: 7 | 30 | 90 | 365;
};

export type AppTrendRes = {
  range: {
    days: 7 | 30 | 90 | 365;
    startTime: string;
    endTime: string;
  };
  trend: Array<{
    date: string;
    questions: number;
    chats: number;
  }>;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function getLocalDayStart(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTimezoneOffsetString(date = new Date()) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = String(Math.floor(abs / 60)).padStart(2, '0');
  const m = String(abs % 60).padStart(2, '0');
  return `${sign}${h}:${m}`;
}

function formatYMD(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getDateList(days: number, endTime: Date) {
  const list: string[] = [];
  const endDayStart = getLocalDayStart(endTime);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDayStart.getTime() - i * DAY_MS);
    list.push(formatYMD(d));
  }
  return list;
}

async function handler(req: ApiRequestProps<GetAppTrendBody>): Promise<AppTrendRes> {
  const { appId, days = 7 } = req.body ?? {};
  const rangeDays: 7 | 30 | 90 | 365 = days === 30 || days === 90 || days === 365 ? days : 7;

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : null;
  const teamIdQuery = teamObjectId ? { $in: [teamObjectId, teamId] } : teamId;

  if (!Types.ObjectId.isValid(appId)) {
    throw new Error('参数错误');
  }
  const appObjectId = new Types.ObjectId(appId);

  const app = await MongoApp.findOne(
    { _id: appObjectId, teamId: teamIdQuery, type: { $nin: AppFolderTypeList } },
    '_id'
  ).lean();
  if (!app) {
    throw new Error('应用不存在或无权限');
  }

  const endTime = new Date();
  const startTime = getLocalDayStart(new Date(endTime.getTime() - (rangeDays - 1) * DAY_MS));
  const tz = getTimezoneOffsetString(endTime);

  const [questionTrendAgg, chatTrendAgg] = await Promise.all([
    MongoChatItem.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          appId: appObjectId,
          obj: ChatRoleEnum.Human,
          time: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$time', timezone: tz } },
          count: { $sum: 1 }
        }
      }
    ]),
    MongoChat.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          appId: appObjectId,
          updateTime: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updateTime', timezone: tz } },
          count: { $sum: 1 }
        }
      }
    ])
  ]);

  const questionTrendMap = new Map(questionTrendAgg.map((i) => [i._id, i.count]));
  const chatTrendMap = new Map(chatTrendAgg.map((i) => [i._id, i.count]));

  const dateList = getDateList(rangeDays, endTime);
  const trend = dateList.map((date) => ({
    date,
    questions: questionTrendMap.get(date) ?? 0,
    chats: chatTrendMap.get(date) ?? 0
  }));

  return {
    range: {
      days: rangeDays,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    },
    trend
  };
}

export default NextAPI(handler);
