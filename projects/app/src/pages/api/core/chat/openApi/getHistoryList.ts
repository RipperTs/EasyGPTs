import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { GetHistoriesProps } from '@/global/core/chat/api';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { outLinkUid, perPage } = req.query as GetHistoriesProps;
    if (!outLinkUid) {
      return jsonRes(res, {
        code: 422,
        message: 'outLinkUid is required'
      });
    }
    // auth app permission
    const { appId, authType, userId } = await parseHeaderCert({
      req,
      authApiKey: true,
      per: ReadPermissionVal
    });

    const limit = perPage || 30;

    const match = await (async () => {
      return {
        outLinkUid: outLinkUid,
        appId: appId,
        source: ChatSourceEnum.api
      };
    })();

    const data = await MongoChat.find(match, 'chatId title top customTitle appId updateTime')
      .sort({ top: -1, updateTime: -1 })
      .limit(limit);

    jsonRes<ChatHistoryItemType[]>(res, {
      data: data.map((item) => ({
        chatId: item.chatId,
        updateTime: item.updateTime,
        appId: item.appId,
        customTitle: item.customTitle,
        title: item.title,
        top: item.top
      }))
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

export default NextAPI(handler);
