import type { NextApiRequest, NextApiResponse } from 'next';
import { addDays } from 'date-fns';
import { Types } from '@fastgpt/service/common/mongo';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type { GetAppChatLogsStatsParams } from '@/global/core/api/appReq.d';

export type AppChatLogsStatsRes = {
  sessionCount: number;
  qaCount: number;
  questionCount: number;
  answerCount: number;
  activeUserCount: number;
  activeUserLoggedInCount: number;
  activeUserAnonymousCount: number;
};

async function handler(req: NextApiRequest, _res: NextApiResponse): Promise<AppChatLogsStatsRes> {
  const {
    appId,
    dateStart = addDays(new Date(), -7),
    dateEnd = new Date()
  } = req.body as GetAppChatLogsStatsParams;

  if (!appId) {
    throw new Error('缺少参数');
  }

  const { teamId } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });

  const chatWhere = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    }
  };

  const qaWhere = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    time: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    obj: ChatRoleEnum.AI
  };

  const questionWhere = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    time: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    obj: ChatRoleEnum.Human
  };

  const [sessionCount, questionCount, answerCount, activeOutLinkUidSplitAgg] = await Promise.all([
    MongoChat.countDocuments(chatWhere, { ...readFromSecondary }),
    MongoChatItem.countDocuments(questionWhere, { ...readFromSecondary }),
    MongoChatItem.countDocuments(qaWhere, { ...readFromSecondary }),
    MongoChat.aggregate<{ _id: boolean; count: number }>(
      [
        {
          $match: {
            ...chatWhere,
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
      ],
      { ...readFromSecondary }
    )
  ]);

  const activeUserAnonymousCount = activeOutLinkUidSplitAgg.find((i) => i._id === true)?.count || 0;
  const activeUserLoggedInCount = activeOutLinkUidSplitAgg.find((i) => i._id === false)?.count || 0;
  const activeUserCount = activeUserLoggedInCount + activeUserAnonymousCount;
  const qaCount = questionCount + answerCount;

  return {
    sessionCount,
    qaCount,
    questionCount,
    answerCount,
    activeUserCount,
    activeUserLoggedInCount,
    activeUserAnonymousCount
  };
}

export default NextAPI(handler);
