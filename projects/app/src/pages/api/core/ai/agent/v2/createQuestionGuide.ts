import type { NextApiResponse } from 'next';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';

export type QuestionGuideUsageProps = {
  model?: string;
  customPrompt?: string;
  limit?: number;
};

export type CreateQuestionGuideParams = OutLinkChatAuthProps & {
  appId: string;
  chatId: string;
  questionGuide?: QuestionGuideUsageProps;
};

async function handler(req: ApiRequestProps<CreateQuestionGuideParams>, res: NextApiResponse<any>) {
  const { appId, chatId, questionGuide } = req.body;
  const { tmbId, teamId } = await authChatCert({
    req,
    authToken: true,
    authApiKey: true
  });

  // Get histories
  const { histories } = await getChatItems({
    appId,
    chatId,
    limit: questionGuide?.limit || 6,
    field: 'obj value time'
  });
  const messages = chats2GPTMessages({ messages: histories, reserveId: false });

  // 如果没有指定模型，从数据库获取第一个激活的模型（系统级共享）
  let qgModel = questionGuide?.model;
  if (!qgModel) {
    const firstModel = await MongoLLMModel.findOne({
      isActive: true
    })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    if (!firstModel) {
      throw new Error('No active LLM model found');
    }
    qgModel = firstModel.model;
  }

  const { result, tokens } = await createQuestionGuide({
    messages,
    model: qgModel,
    customPrompt: questionGuide?.customPrompt
  });

  pushQuestionGuideUsage({
    tokens,
    teamId,
    tmbId,
    model: qgModel
  });

  return result;
}

export default NextAPI(handler);
