import type { NextApiRequest, NextApiResponse } from 'next';
import type { InitDateResponse } from '@/global/common/api/systemRes';
import { connectToDatabase } from '@/service/mongo';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoLLMModel } from '@fastgpt/service/core/model/llmSchema';
import { MongoReRankModel } from '@fastgpt/service/core/model/rerankSchema';
import { MongoEmbeddingModel } from '@fastgpt/service/core/model/embeddingSchema';
import { MongoTTSModel } from '@fastgpt/service/core/model/ttsSchema';
import { MongoWhisperModel } from '@fastgpt/service/core/model/whisperSchema';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectToDatabase();

  // 从数据库获取所有激活的模型
  const [llmModels, vectorModels, reRankModels, ttsModels, whisperModel, ocrModel] =
    await Promise.all([
      // LLM模型
      MongoLLMModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean(),
      // 向量模型
      MongoEmbeddingModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean(),
      // 重排模型
      MongoReRankModel.find({ isActive: true }).sort({ updateTime: -1 }).lean(),
      // TTS模型
      MongoTTSModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean(),
      // Whisper模型（单个）
      MongoWhisperModel.findOne({ isActive: true }).lean(),
      // OCR模型（单个）
      MongoOCRModel.findOne({ isActive: true }).lean()
    ]);

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
      vectorModels: vectorModels.map((model) => ({
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        charsPointsPrice: model.charsPointsPrice,
        defaultToken: model.defaultToken,
        maxToken: model.maxToken,
        weight: model.weight,
        defaultConfig: model.defaultConfig,
        dbConfig: model.dbConfig,
        queryConfig: model.queryConfig
      })),
      reRankModels: reRankModels.map((item) => ({
        ...item,
        requestUrl: '', // 隐藏敏感信息
        apiKey: '' // 隐藏敏感信息
      })),
      whisperModel: whisperModel
        ? {
            model: whisperModel.model,
            name: whisperModel.name,
            charsPointsPrice: whisperModel.charsPointsPrice
          }
        : null,
      audioSpeechModels: ttsModels.map((model) => ({
        model: model.model,
        name: model.name,
        charsPointsPrice: model.charsPointsPrice,
        voices: model.voices
      })),
      systemVersion: global.systemVersion || '0.0.0'
    }
  });
}

export default handler;
