import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { PagingData } from '@/types';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import type { PipelineStage } from 'mongoose';

export type ListChatLogBody = {
  pageNum: number;
  pageSize: number;
  dateStart?: string | Date;
  dateEnd?: string | Date;
  appId?: string;
  keyword?: string;
};

export type ChatLogListItem = {
  id: string;
  chatId: string;
  time: string;
  appId: string;
  appName: string;
  source?: string;
  title?: string;
  outLinkUid?: string;
  memberName: string;
  username: string;
  lastText: string;
  models: string[];
  messageCount: number;
};

const parseDate = (value: unknown): Date | null => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const parseObjectId = (value: unknown): Types.ObjectId | null => {
  const id = String(value || '');
  if (!id) return null;
  if (!Types.ObjectId.isValid(id)) return null;
  return new Types.ObjectId(id);
};

async function handler(
  req: ApiRequestProps<ListChatLogBody>
): Promise<PagingData<ChatLogListItem>> {
  const { pageNum = 1, pageSize = 30, dateStart, dateEnd, appId, keyword: rawKeyword } = req.body;

  const { teamId, tmbId, permission } = await authUserPer({ req, authToken: true });

  const page = Math.max(1, Number(pageNum) || 1);
  const size = Math.min(100, Math.max(1, Number(pageSize) || 30));
  const keyword = (rawKeyword || '').trim();

  const start = parseDate(dateStart);
  const end = parseDate(dateEnd);
  const appObjectId = parseObjectId(appId);

  const timeFilter = (() => {
    if (start && end) return { $gte: start, $lte: end };
    if (start) return { $gte: start };
    if (end) return { $lte: end };
    return null;
  })();

  const where: Record<string, unknown> = {
    teamId: new Types.ObjectId(teamId),
    ...(timeFilter && { time: timeFilter }),
    ...(appObjectId && { appId: appObjectId }),
    ...(!permission.hasManagePer && { tmbId: new Types.ObjectId(tmbId) })
  };

  const keywordMatch = keyword
    ? {
        $or: [
          { chatId: { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } },
          { 'app.name': { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } },
          { 'chat.title': { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } },
          { 'tmb.name': { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } },
          { 'user.username': { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } },
          { questionText: { $regex: new RegExp(`${replaceRegChars(keyword)}`, 'i') } }
        ]
      }
    : null;

  const basePipeline = [
    { $match: where },
    {
      $addFields: {
        textContent: {
          $let: {
            vars: {
              textItem: {
                $first: {
                  $filter: {
                    input: '$value',
                    as: 'v',
                    cond: { $eq: ['$$v.type', 'text'] }
                  }
                }
              }
            },
            in: {
              $ifNull: ['$$textItem.text.content', '']
            }
          }
        }
      }
    },
    { $sort: { time: -1 } },
    {
      $group: {
        _id: { appId: '$appId', chatId: '$chatId' },
        appId: { $first: '$appId' },
        chatId: { $first: '$chatId' },
        time: { $first: '$time' },
        tmbId: { $first: '$tmbId' },
        lastTextContent: { $first: '$textContent' },
        questionTextCandidates: {
          $push: { $cond: [{ $eq: ['$obj', 'Human'] }, '$textContent', null] }
        },
        aiResponseDataCandidates: {
          $push: { $cond: [{ $eq: ['$obj', 'AI'] }, '$responseData', null] }
        },
        messageCount: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: MongoChat.collection.name,
        let: { appId: '$appId', chatId: '$chatId' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [{ $eq: ['$appId', '$$appId'] }, { $eq: ['$chatId', '$$chatId'] }]
              }
            }
          },
          {
            $project: {
              _id: 1,
              title: 1,
              customTitle: 1,
              source: 1,
              outLinkUid: 1
            }
          }
        ],
        as: 'chat'
      }
    },
    { $unwind: { path: '$chat', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: MongoApp.collection.name,
        localField: 'appId',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 1, name: 1 } }],
        as: 'app'
      }
    },
    { $unwind: { path: '$app', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: MongoTeamMember.collection.name,
        localField: 'tmbId',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 1, name: 1, userId: 1 } }],
        as: 'tmb'
      }
    },
    { $unwind: { path: '$tmb', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: MongoUser.collection.name,
        localField: 'tmb.userId',
        foreignField: '_id',
        pipeline: [{ $project: { _id: 1, username: 1 } }],
        as: 'user'
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        questionText: {
          $let: {
            vars: {
              list: {
                $filter: {
                  input: '$questionTextCandidates',
                  as: 't',
                  cond: { $and: [{ $ne: ['$$t', null] }, { $ne: ['$$t', ''] }] }
                }
              }
            },
            in: { $ifNull: [{ $arrayElemAt: ['$$list', 0] }, '$lastTextContent'] }
          }
        },
        aiResponseData: {
          $let: {
            vars: {
              list: {
                $filter: {
                  input: '$aiResponseDataCandidates',
                  as: 't',
                  cond: { $ne: ['$$t', null] }
                }
              }
            },
            in: { $arrayElemAt: ['$$list', 0] }
          }
        }
      }
    },
    ...(keywordMatch ? [{ $match: keywordMatch }] : [])
  ] as unknown as PipelineStage[];

  const [data, totalAgg] = await Promise.all([
    MongoChatItem.aggregate(
      [
        ...basePipeline,
        { $sort: { time: -1 } },
        { $skip: (page - 1) * size },
        { $limit: size },
        {
          $project: {
            appId: 1,
            chatId: 1,
            time: 1,
            messageCount: 1,
            lastText: { $substrCP: ['$questionText', 0, 120] },
            aiResponseData: 1,
            source: '$chat.source',
            title: '$chat.title',
            customTitle: '$chat.customTitle',
            outLinkUid: '$chat.outLinkUid',
            appName: { $ifNull: ['$app.name', '-'] },
            memberName: { $ifNull: ['$tmb.name', '-'] },
            username: { $ifNull: ['$user.username', '-'] }
          }
        }
      ],
      { ...readFromSecondary }
    ),
    MongoChatItem.aggregate([...basePipeline, { $count: 'total' }], { ...readFromSecondary })
  ]);

  const total = typeof totalAgg?.[0]?.total === 'number' ? totalAgg[0].total : 0;

  return {
    pageNum: page,
    pageSize: size,
    total,
    data: data.map((item) => ({
      id: `${String(item.appId)}_${String(item.chatId)}`,
      chatId: String(item.chatId || ''),
      time: new Date(item.time).toISOString(),
      appId: String(item.appId),
      appName: item.appName || '-',
      source: item.source || undefined,
      title: (item.customTitle || item.title || '').trim() || undefined,
      outLinkUid: item.outLinkUid || undefined,
      memberName: item.memberName || '-',
      username: item.username || '-',
      lastText: item.lastText || '',
      models: (() => {
        const set = new Set<string>();
        const aiResponseData = Array.isArray(item.aiResponseData) ? item.aiResponseData : [];
        for (const res of aiResponseData) {
          if (!res || typeof res !== 'object') continue;
          const obj = res as Record<string, unknown>;
          if (typeof obj.model === 'string' && obj.model) set.add(obj.model);
          if (typeof obj.extensionModel === 'string' && obj.extensionModel)
            set.add(obj.extensionModel);
        }
        return Array.from(set);
      })(),
      messageCount: Number(item.messageCount || 0)
    }))
  };
}

export default NextAPI(handler);
