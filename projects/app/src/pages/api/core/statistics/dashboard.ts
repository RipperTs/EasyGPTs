import { NextAPI } from '@/service/middleware/entry';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { Types } from '@fastgpt/service/common/mongo';

import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';

export type GetTeamDashboardBody = {
  days?: 7 | 30 | 90;
};

export type TeamDashboardRes = {
  range: {
    days: 7 | 30 | 90;
    startTime: string;
    endTime: string;
  };
  overview: {
    appTotal: number;
    appWorkflow: number;
    appSimple: number;
    pluginTotal: number;
    pluginApp: number;
    pluginHttp: number;
    toolSet: number;
    mcpToolTotal: number;
    folder: number;
    datasetTotal: number;
    memberTotal: number;
    memberActive: number;
    chatTotal: number;
    questionTotal: number;
    answerTotal: number;
  };
  rangeStats: {
    chatCount: number;
    questionCount: number;
    answerCount: number;
    activeMemberCount: number;
  };
  trend: Array<{
    date: string;
    chats: number;
    questions: number;
    activeMembers: number;
  }>;
  appType: Array<{
    type: string;
    count: number;
  }>;
  source: Array<{
    source: string;
    count: number;
  }>;
  topApps: Array<{
    appId: string;
    name: string;
    avatar: string;
    type: string;
    questions: number;
    chats: number;
  }>;
  topMembers: Array<{
    tmbId: string;
    name: string;
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

async function handler(req: ApiRequestProps<GetTeamDashboardBody>): Promise<TeamDashboardRes> {
  const { days = 30 } = req.body ?? {};
  const rangeDays: 7 | 30 | 90 = days === 7 || days === 90 ? days : 30;

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ReadPermissionVal
  });
  const teamObjectId = Types.ObjectId.isValid(teamId) ? new Types.ObjectId(teamId) : null;
  const teamIdQuery = teamObjectId ? { $in: [teamObjectId, teamId] } : teamId;

  const endTime = new Date();
  const startTime = getLocalDayStart(new Date(endTime.getTime() - (rangeDays - 1) * DAY_MS));
  const tz = getTimezoneOffsetString(endTime);

  const mcpToolTotalPromise = (async () => {
    const toolSets = await MongoApp.find(
      {
        teamId: teamIdQuery,
        type: AppTypeEnum.toolSet,
        $or: [
          { 'modules.0.toolConfig.mcpToolSet': { $exists: true, $ne: null } },
          { 'modules.0.inputs': { $elemMatch: { key: 'mcpToolSetConfig' } } }
        ]
      },
      '_id modules teamId'
    ).lean();

    if (!toolSets || toolSets.length === 0) return 0;

    const countList = await Promise.all(
      toolSets.map(async (app) => {
        const toolSetNode = (app.modules as any[])?.[0];
        const config =
          toolSetNode?.toolConfig?.mcpToolSet ||
          toolSetNode?.inputs?.find((item: any) => item.key === 'mcpToolSetConfig')?.value ||
          {};

        const toolList = Array.isArray(config?.toolList) ? config.toolList : [];
        if (toolList.length > 0) return toolList.length;

        return MongoApp.countDocuments({
          teamId: teamIdQuery,
          parentId: { $in: [app._id, String(app._id)] }
        });
      })
    );

    return countList.reduce((sum, val) => sum + (val || 0), 0);
  })();

  const [
    appTypeAgg,
    datasetTotal,
    memberTotal,
    memberActive,
    chatTotal,
    questionTotal,
    answerTotal,
    chatCount,
    questionCount,
    answerCount,
    activeMemberAgg,
    questionTrendAgg,
    chatTrendAgg,
    activeMembersTrendAgg,
    sourceAgg,
    topAppQuestionsAgg,
    topAppChatsAgg,
    topMemberQuestionsAgg,
    topMemberChatsAgg,
    mcpToolTotal
  ] = await Promise.all([
    MongoApp.aggregate<{ _id: string; count: number }>([
      { $match: { teamId: teamIdQuery } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]),
    MongoDataset.countDocuments({ teamId: teamIdQuery }),
    MongoTeamMember.countDocuments({
      teamId: teamIdQuery,
      status: { $ne: TeamMemberStatusEnum.leave }
    }),
    MongoTeamMember.countDocuments({ teamId: teamIdQuery, status: TeamMemberStatusEnum.active }),

    MongoChat.countDocuments({ teamId: teamIdQuery }),
    MongoChatItem.countDocuments({ teamId: teamIdQuery, obj: ChatRoleEnum.Human }),
    MongoChatItem.countDocuments({ teamId: teamIdQuery, obj: ChatRoleEnum.AI }),

    MongoChat.countDocuments({
      teamId: teamIdQuery,
      updateTime: { $gte: startTime, $lte: endTime }
    }),
    MongoChatItem.countDocuments({
      teamId: teamIdQuery,
      obj: ChatRoleEnum.Human,
      time: { $gte: startTime, $lte: endTime }
    }),
    MongoChatItem.countDocuments({
      teamId: teamIdQuery,
      obj: ChatRoleEnum.AI,
      time: { $gte: startTime, $lte: endTime }
    }),

    MongoChatItem.aggregate<{ _id: unknown }>([
      {
        $match: {
          teamId: teamIdQuery,
          obj: ChatRoleEnum.Human,
          time: { $gte: startTime, $lte: endTime }
        }
      },
      { $group: { _id: '$tmbId' } }
    ]),

    MongoChatItem.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
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
      { $match: { teamId: teamIdQuery, updateTime: { $gte: startTime, $lte: endTime } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updateTime', timezone: tz } },
          count: { $sum: 1 }
        }
      }
    ]),
    MongoChatItem.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          obj: ChatRoleEnum.Human,
          time: { $gte: startTime, $lte: endTime }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$time', timezone: tz } },
            tmbId: '$tmbId'
          }
        }
      },
      { $group: { _id: '$_id.day', count: { $sum: 1 } } }
    ]),
    MongoChat.aggregate<{ _id: string; count: number }>([
      { $match: { teamId: teamIdQuery, updateTime: { $gte: startTime, $lte: endTime } } },
      { $group: { _id: '$source', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]),
    MongoChatItem.aggregate<{ _id: unknown; questions: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          obj: ChatRoleEnum.Human,
          time: { $gte: startTime, $lte: endTime }
        }
      },
      { $group: { _id: '$appId', questions: { $sum: 1 } } },
      { $sort: { questions: -1 } },
      { $limit: 10 }
    ]),
    MongoChat.aggregate<{ _id: unknown; chats: number }>([
      { $match: { teamId: teamIdQuery, updateTime: { $gte: startTime, $lte: endTime } } },
      { $group: { _id: '$appId', chats: { $sum: 1 } } }
    ]),
    MongoChatItem.aggregate<{ _id: unknown; questions: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          obj: ChatRoleEnum.Human,
          time: { $gte: startTime, $lte: endTime }
        }
      },
      { $group: { _id: '$tmbId', questions: { $sum: 1 } } },
      { $sort: { questions: -1 } },
      { $limit: 10 }
    ]),
    MongoChat.aggregate<{ _id: unknown; chats: number }>([
      { $match: { teamId: teamIdQuery, updateTime: { $gte: startTime, $lte: endTime } } },
      { $group: { _id: '$tmbId', chats: { $sum: 1 } } }
    ]),
    mcpToolTotalPromise
  ]);

  const appType = appTypeAgg
    .map((item) => ({ type: item._id, count: item.count }))
    .sort((a, b) => b.count - a.count);
  const appTypeMap = new Map(appType.map((i) => [i.type, i.count]));

  const folder = appTypeMap.get(AppTypeEnum.folder) ?? 0;
  const pluginHttp = appTypeMap.get(AppTypeEnum.httpPlugin) ?? 0;
  const toolSet = appTypeMap.get(AppTypeEnum.toolSet) ?? 0;
  const pluginApp = appTypeMap.get(AppTypeEnum.plugin) ?? 0;
  const appWorkflow = appTypeMap.get(AppTypeEnum.workflow) ?? 0;
  const appSimple = appTypeMap.get(AppTypeEnum.simple) ?? 0;

  const appTotal = appWorkflow + appSimple;
  const pluginTotal = pluginApp + pluginHttp + toolSet;

  const activeMemberCount = activeMemberAgg.length;

  if (mcpToolTotal > 0) {
    appType.push({
      type: 'mcpTool',
      count: mcpToolTotal
    });
  }

  const questionTrendMap = new Map(questionTrendAgg.map((i) => [i._id, i.count]));
  const chatTrendMap = new Map(chatTrendAgg.map((i) => [i._id, i.count]));
  const activeMembersTrendMap = new Map(activeMembersTrendAgg.map((i) => [i._id, i.count]));

  const dateList = getDateList(rangeDays, endTime);
  const trend = dateList.map((date) => ({
    date,
    chats: chatTrendMap.get(date) ?? 0,
    questions: questionTrendMap.get(date) ?? 0,
    activeMembers: activeMembersTrendMap.get(date) ?? 0
  }));

  const source = sourceAgg.map((i) => ({ source: i._id, count: i.count }));

  const topAppIds = topAppQuestionsAgg.map((i) => i._id);
  const topAppsInfo = await MongoApp.find(
    { teamId: teamIdQuery, _id: { $in: topAppIds }, type: { $nin: AppFolderTypeList } },
    '_id name avatar type'
  ).lean();
  const topAppsInfoMap = new Map(topAppsInfo.map((i) => [String(i._id), i]));
  const topAppChatsMap = new Map(topAppChatsAgg.map((i) => [String(i._id), i.chats]));

  const topApps = topAppQuestionsAgg
    .map((item) => {
      const info = topAppsInfoMap.get(String(item._id));
      if (!info) return null;
      return {
        appId: String(info._id),
        name: info.name,
        avatar: info.avatar,
        type: info.type,
        questions: item.questions,
        chats: topAppChatsMap.get(String(item._id)) ?? 0
      };
    })
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  const topMemberIds = topMemberQuestionsAgg.map((i) => i._id);
  const topMemberInfo = await MongoTeamMember.find(
    { teamId: teamIdQuery, _id: { $in: topMemberIds } },
    '_id name'
  ).lean();
  const topMemberInfoMap = new Map(topMemberInfo.map((i) => [String(i._id), i.name]));
  const topMemberChatsMap = new Map(topMemberChatsAgg.map((i) => [String(i._id), i.chats]));

  const topMembers = topMemberQuestionsAgg
    .map((item) => {
      const name = topMemberInfoMap.get(String(item._id));
      if (!name) return null;
      return {
        tmbId: String(item._id),
        name,
        questions: item.questions,
        chats: topMemberChatsMap.get(String(item._id)) ?? 0
      };
    })
    .filter((i): i is NonNullable<typeof i> => Boolean(i));

  return {
    range: {
      days: rangeDays,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString()
    },
    overview: {
      appTotal,
      appWorkflow,
      appSimple,
      pluginTotal,
      pluginApp,
      pluginHttp,
      toolSet,
      mcpToolTotal,
      folder,
      datasetTotal,
      memberTotal,
      memberActive,
      chatTotal,
      questionTotal,
      answerTotal
    },
    rangeStats: {
      chatCount,
      questionCount,
      answerCount,
      activeMemberCount
    },
    trend,
    appType,
    source,
    topApps,
    topMembers
  };
}

export default NextAPI(handler);
