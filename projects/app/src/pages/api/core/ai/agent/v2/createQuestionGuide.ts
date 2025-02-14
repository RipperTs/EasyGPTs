import type { NextApiResponse } from 'next';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';

export type QuestionGuideUsageProps = {
  model?: string;
  customPrompt?: string;
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
    limit: 6,
    field: 'obj value time'
  });
  const messages = chats2GPTMessages({ messages: histories, reserveId: false });

  const qgModel = questionGuide?.model || global.llmModels[0].model;

  const { result, tokens } = await createQuestionGuide({
    messages,
    model: qgModel,
    customPrompt: questionGuide?.customPrompt
  });

  pushQuestionGuideUsage({
    tokens,
    teamId,
    tmbId
  });

  return result;
}

export default NextAPI(handler);
