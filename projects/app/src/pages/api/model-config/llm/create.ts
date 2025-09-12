import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';
import type { CreateLLMModelParams, LLMModelSchema } from '@fastgpt/global/core/model/type.d';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<LLMModelSchema>) {
  try {
    await connectToDatabase();

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
      defaultConfig = {},
      sort = 100
    } = req.body as CreateLLMModelParams;

    // 验证必填字段
    if (
      !model ||
      !name ||
      !maxContext ||
      !maxResponse ||
      !quoteMaxToken ||
      maxTemperature === undefined
    ) {
      return res.status(400).json({
        error: '缺少必填字段'
      } as any);
    }

    // 检查模型名是否已存在（系统级）
    const existingModel = await MongoLLMModel.findOne({
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoLLMModel.create({
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
      isActive: true,
      sort
    });

    // 刷新全局模型配置
    await refreshModelConfig();

    res.json(newModel.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: '创建失败'
    } as any);
  }
}
