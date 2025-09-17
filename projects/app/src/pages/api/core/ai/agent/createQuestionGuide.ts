import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { CreateQuestionGuideParams } from '@/global/core/ai/api.d';
import { pushQuestionGuideUsage } from '@/service/support/wallet/usage/push';
import { createQuestionGuide } from '@fastgpt/service/core/ai/functions/createQuestionGuide';
import { authChatCert } from '@/service/support/permission/auth/chat';
import { MongoLLMModel } from '@fastgpt/service/core/model/llmSchema';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { messages } = req.body as CreateQuestionGuideParams;

    const { tmbId, teamId } = await authChatCert({
      req,
      authToken: true
    });

    // 从数据库获取第一个激活的模型（系统级共享）
    const qgModel = (await MongoLLMModel.findOne({
      isActive: true
    })
      .sort({ sort: 1, createTime: -1 })
      .lean()) as LLMModelItemType | null;

    if (!qgModel) {
      throw new Error('No active LLM model found');
    }

    const { result, tokens } = await createQuestionGuide({
      messages,
      model: qgModel.model
    });

    jsonRes(res, {
      data: result
    });

    pushQuestionGuideUsage({
      tokens,
      teamId,
      tmbId,
      model: qgModel.model
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
