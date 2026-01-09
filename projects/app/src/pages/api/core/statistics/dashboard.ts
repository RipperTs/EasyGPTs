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
import {
  DatasetColCollectionName,
  MongoDatasetCollection
} from '@fastgpt/service/core/dataset/collection/schema';
import { DatasetDataCollectionName } from '@fastgpt/service/core/dataset/data/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatItemCollectionName, MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

export type GetTeamDashboardBody = {
  days?: 7 | 30 | 90 | 365;
};

export type TeamDashboardRes = {
  range: {
    days: 7 | 30 | 90 | 365;
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
    activeTeamMemberCount: number;
    activeLoginUserCount: number;
    activeAnonymousUserCount: number;
  };
  trend: Array<{
    date: string;
    chats: number;
    questions: number;
    datasetUpdates: number;
    activeLoginUsers: number;
    activeAnonymousUsers: number;
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
    uid: string;
    name: string;
    questions: number;
    chats: number;
  }>;
  topDatasets: Array<{
    datasetId: string;
    name: string;
    avatar: string;
    type: string;
    collectionCount: number;
    dataCount: number;
    rawTextLength: number;
    updateTime: string;
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
  const rangeDays: 7 | 30 | 90 | 365 = days === 7 || days === 90 || days === 365 ? days : 30;

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
    activeOutLinkUidAgg,
    activeOutLinkUidSplitAgg,
    activeTeamMemberAgg,
    questionTrendAgg,
    chatTrendAgg,
    datasetUpdateTrendAgg,
    activeOutLinkUidTrendAgg,
    activeOutLinkUidTrendSplitAgg,
    sourceAgg,
    topAppQuestionsAgg,
    topAppChatsAgg,
    topUserAgg,
    topDatasetsAgg,
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

    MongoChat.aggregate<{ _id: string }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime },
          outLinkUid: { $exists: true, $nin: ['', null] }
        }
      },
      { $group: { _id: '$outLinkUid' } }
    ]),
    MongoChat.aggregate<{ _id: boolean; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime },
          outLinkUid: { $exists: true, $nin: ['', null] }
        }
      },
      { $group: { _id: '$outLinkUid' } },
      {
        $project: {
          _id: 0,
          isAnonymous: { $regexMatch: { input: '$_id', regex: '^shareChat-' } }
        }
      },
      { $group: { _id: '$isAnonymous', count: { $sum: 1 } } }
    ]),
    MongoChat.aggregate<{ _id: unknown }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime }
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
    MongoDatasetCollection.aggregate<{ _id: string; count: number }>([
      { $match: { teamId: teamIdQuery, updateTime: { $gte: startTime, $lte: endTime } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$updateTime', timezone: tz } },
          count: { $sum: 1 }
        }
      }
    ]),
    MongoChat.aggregate<{ _id: string; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime },
          outLinkUid: { $exists: true, $nin: ['', null] }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$updateTime', timezone: tz } },
            outLinkUid: '$outLinkUid'
          }
        }
      },
      { $group: { _id: '$_id.day', count: { $sum: 1 } } }
    ]),
    MongoChat.aggregate<{ _id: { day: string; isAnonymous: boolean }; count: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime },
          outLinkUid: { $exists: true, $nin: ['', null] }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$updateTime', timezone: tz } },
            outLinkUid: '$outLinkUid'
          }
        }
      },
      {
        $project: {
          day: '$_id.day',
          isAnonymous: { $regexMatch: { input: '$_id.outLinkUid', regex: '^shareChat-' } }
        }
      },
      { $group: { _id: { day: '$day', isAnonymous: '$isAnonymous' }, count: { $sum: 1 } } }
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
    MongoChat.aggregate<{ _id: string; questions: number; chats: number }>([
      {
        $match: {
          teamId: teamIdQuery,
          updateTime: { $gte: startTime, $lte: endTime },
          outLinkUid: { $exists: true, $nin: ['', null], $not: /^shareChat-/ }
        }
      },
      {
        $lookup: {
          from: ChatItemCollectionName,
          let: { chatId: '$chatId', appId: '$appId' },
          pipeline: [
            {
              $match: {
                obj: ChatRoleEnum.Human,
                time: { $gte: startTime, $lte: endTime },
                $expr: {
                  $and: [{ $eq: ['$chatId', '$$chatId'] }, { $eq: ['$appId', '$$appId'] }]
                }
              }
            },
            { $group: { _id: null, count: { $sum: 1 } } }
          ],
          as: 'questionAgg'
        }
      },
      {
        $addFields: {
          questions: {
            $ifNull: [{ $arrayElemAt: ['$questionAgg.count', 0] }, 0]
          }
        }
      },
      { $group: { _id: '$outLinkUid', questions: { $sum: '$questions' }, chats: { $sum: 1 } } },
      { $sort: { questions: -1, chats: -1 } },
      { $limit: 10 }
    ]),
    MongoDataset.aggregate<{
      _id: unknown;
      name: string;
      avatar: string;
      type: string;
      updateTime: Date;
      collectionCount: number;
      dataCount: number;
      rawTextLength: number;
    }>([
      {
        $match: {
          teamId: teamIdQuery,
          type: { $ne: DatasetTypeEnum.folder }
        }
      },
      {
        $lookup: {
          from: DatasetColCollectionName,
          let: { datasetId: '$_id' },
          pipeline: [
            {
              $match: {
                teamId: teamIdQuery,
                $expr: { $eq: ['$datasetId', '$$datasetId'] }
              }
            },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                rawTextLength: { $sum: { $ifNull: ['$rawTextLength', 0] } }
              }
            }
          ],
          as: 'colAgg'
        }
      },
      {
        $lookup: {
          from: DatasetDataCollectionName,
          let: { datasetId: '$_id' },
          pipeline: [
            {
              $match: {
                teamId: teamIdQuery,
                $expr: { $eq: ['$datasetId', '$$datasetId'] }
              }
            },
            { $group: { _id: null, count: { $sum: 1 } } }
          ],
          as: 'dataAgg'
        }
      },
      {
        $addFields: {
          collectionCount: { $ifNull: [{ $arrayElemAt: ['$colAgg.count', 0] }, 0] },
          rawTextLength: { $ifNull: [{ $arrayElemAt: ['$colAgg.rawTextLength', 0] }, 0] },
          dataCount: { $ifNull: [{ $arrayElemAt: ['$dataAgg.count', 0] }, 0] }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          avatar: 1,
          type: 1,
          updateTime: 1,
          collectionCount: 1,
          rawTextLength: 1,
          dataCount: 1
        }
      },
      { $sort: { dataCount: -1, rawTextLength: -1, updateTime: -1 } },
      { $limit: 10 }
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

  const activeMemberCount = activeOutLinkUidAgg.length;
  const activeTeamMemberCount = activeTeamMemberAgg.length;
  const activeAnonymousUserCount = activeOutLinkUidSplitAgg.find((i) => i._id === true)?.count ?? 0;
  const activeLoginUserCount = activeOutLinkUidSplitAgg.find((i) => i._id === false)?.count ?? 0;

  if (mcpToolTotal > 0) {
    appType.push({
      type: 'mcpTool',
      count: mcpToolTotal
    });
  }

  const questionTrendMap = new Map(questionTrendAgg.map((i) => [i._id, i.count]));
  const chatTrendMap = new Map(chatTrendAgg.map((i) => [i._id, i.count]));
  const datasetUpdateTrendMap = new Map(datasetUpdateTrendAgg.map((i) => [i._id, i.count]));
  const activeLoginUsersTrendMap = new Map(
    activeOutLinkUidTrendSplitAgg
      .filter((i) => i._id.isAnonymous === false)
      .map((i) => [i._id.day, i.count])
  );
  const activeAnonymousUsersTrendMap = new Map(
    activeOutLinkUidTrendSplitAgg
      .filter((i) => i._id.isAnonymous === true)
      .map((i) => [i._id.day, i.count])
  );

  const dateList = getDateList(rangeDays, endTime);
  const trend = dateList.map((date) => ({
    date,
    chats: chatTrendMap.get(date) ?? 0,
    questions: questionTrendMap.get(date) ?? 0,
    datasetUpdates: datasetUpdateTrendMap.get(date) ?? 0,
    activeLoginUsers: activeLoginUsersTrendMap.get(date) ?? 0,
    activeAnonymousUsers: activeAnonymousUsersTrendMap.get(date) ?? 0
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

  const topMembers = topUserAgg.map((item) => ({
    uid: item._id,
    name: item._id,
    questions: item.questions,
    chats: item.chats
  }));

  const topDatasets = topDatasetsAgg.map((item) => ({
    datasetId: String(item._id),
    name: item.name,
    avatar: item.avatar,
    type: item.type,
    collectionCount: item.collectionCount,
    dataCount: item.dataCount,
    rawTextLength: item.rawTextLength,
    updateTime: item.updateTime.toISOString()
  }));

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
      activeMemberCount,
      activeTeamMemberCount,
      activeLoginUserCount,
      activeAnonymousUserCount
    },
    trend,
    appType,
    source,
    topApps,
    topMembers,
    topDatasets
  };
}

export default NextAPI(handler);
