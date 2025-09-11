import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';
import type { CreateLLMModelParams, LLMModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<LLMModelSchema>) {
  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserPer({ req, authToken: true });

    const {
      model,
      name,
      avatar = '/imgs/model/openai.svg',
      maxContext,
      maxResponse,
      quoteMaxToken,
      maxTemperature,
      charsPointsPrice = 0,
      censor = false,
      vision = false,
      reasoning = false,
      datasetProcess = false,
      usedInClassify = false,
      usedInExtractFields = false,
      usedInToolCall = false,
      usedInQueryExtension = false,
      toolChoice = false,
      functionCall = false,
      customCQPrompt = '',
      customExtractPrompt = '',
      defaultSystemChatPrompt = '',
      defaultConfig = {}
    } = req.body as CreateLLMModelParams;

    // 检查模型名是否已存在
    const existingModel = await MongoLLMModel.findOne({
      teamId,
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoLLMModel.create({
      teamId,
      tmbId,
      model,
      name,
      avatar,
      maxContext,
      maxResponse,
      quoteMaxToken,
      maxTemperature,
      charsPointsPrice,
      censor,
      vision,
      reasoning,
      datasetProcess,
      usedInClassify,
      usedInExtractFields,
      usedInToolCall,
      usedInQueryExtension,
      toolChoice,
      functionCall,
      customCQPrompt,
      customExtractPrompt,
      defaultSystemChatPrompt,
      defaultConfig,
      isActive: true
    });

    res.json(newModel.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: '创建失败'
    } as any);
  }
}
