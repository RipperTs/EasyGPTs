import type { NextApiRequest, NextApiResponse } from 'next';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoLLMModel } from '@fastgpt/service/core/model/llmSchema';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectToDatabase();

  // 从数据库获取所有激活的LLM模型列表（系统级共享），按sort正序排列
  const llmModels = await MongoLLMModel.find({
    isActive: true
  })
    .sort({ sort: 1, createTime: -1 })
    .lean();

  jsonRes<InitDateResponse>(res, {
    data: {
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      llmModels: llmModels.map((model) => ({
        ...model,
        customCQPrompt: model.customCQPrompt || '',
        customExtractPrompt: model.customExtractPrompt || '',
        defaultSystemChatPrompt: model.defaultSystemChatPrompt || ''
      })),
      vectorModels: global.vectorModels,
      reRankModels:
        global.reRankModels?.map((item) => ({
          ...item,
          requestUrl: '',
          requestAuth: ''
        })) || [],
      whisperModel: global.whisperModel,
      audioSpeechModels: global.audioSpeechModels,
      systemVersion: global.systemVersion || '0.0.0'
    }
  });
}

export default handler;
