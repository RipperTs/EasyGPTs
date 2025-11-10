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
import { MongoPDFModel } from '@fastgpt/service/core/model/pdfSchema';
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { ReRankModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { VectorModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { AudioSpeechModelType } from '@fastgpt/global/core/ai/model.d';
import type { WhisperModelType } from '@fastgpt/global/core/ai/model.d';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectToDatabase();

  // 从数据库获取所有激活的模型
  const [llmModels, vectorModels, reRankModels, ttsModels, whisperModel, ocrModels, pdfModels] =
    await Promise.all([
      // LLM模型
      MongoLLMModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean() as Promise<
        LLMModelItemType[]
      >,
      // 向量模型
      MongoEmbeddingModel.find({ isActive: true })
        .sort({ sort: 1, createTime: -1 })
        .lean() as Promise<VectorModelItemType[]>,
      // 重排模型
      MongoReRankModel.find({ isActive: true }).sort({ updateTime: -1 }).lean() as Promise<
        ReRankModelItemType[]
      >,
      // TTS模型
      MongoTTSModel.find({ isActive: true }).sort({ sort: 1, createTime: -1 }).lean() as Promise<
        AudioSpeechModelType[]
      >,
      // Whisper模型（单个）
      MongoWhisperModel.findOne({ isActive: true }).lean() as Promise<WhisperModelType | null>,
      // OCR模型（列表，全部激活的）
      MongoOCRModel.find({ isActive: true }).sort({ updateTime: -1 }).lean() as Promise<
        OCRModelSchema[]
      >,
      // PDF解析模型（列表）
      MongoPDFModel.find({ isActive: true }).sort({ updateTime: -1 }).lean()
    ]);

  jsonRes<InitDateResponse>(res, {
    data: {
      feConfigs: global.feConfigs,
      subPlans: global.subPlans,
      llmModels: llmModels.map((model) => ({
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        maxContext: model.maxContext,
        maxResponse: model.maxResponse,
        quoteMaxToken: model.quoteMaxToken,
        maxTemperature: model.maxTemperature,
        charsPointsPrice: model.charsPointsPrice,
        censor: model.censor,
        vision: model.vision,
        reasoning: model.reasoning,
        datasetProcess: model.datasetProcess,
        usedInClassify: model.usedInClassify,
        usedInExtractFields: model.usedInExtractFields,
        usedInToolCall: model.usedInToolCall,
        usedInQueryExtension: model.usedInQueryExtension,
        functionCall: model.functionCall,
        toolChoice: model.toolChoice,
        customCQPrompt: model.customCQPrompt || '',
        customExtractPrompt: model.customExtractPrompt || '',
        defaultSystemChatPrompt: model.defaultSystemChatPrompt || '',
        defaultConfig: model.defaultConfig || {}
      })),
      vectorModels: vectorModels.map((model) => ({
        model: model.model,
        name: model.name,
        avatar: model.avatar,
        charsPointsPrice: model.charsPointsPrice,
        defaultToken: model.defaultToken,
        maxToken: model.maxToken,
        weight: model.weight,
        hidden: model.hidden,
        defaultConfig: model.defaultConfig,
        dbConfig: model.dbConfig,
        queryConfig: model.queryConfig
      })),
      reRankModels: reRankModels.map((item) => ({
        model: item.model,
        name: item.name,
        charsPointsPrice: item.charsPointsPrice,
        requestUrl: '', // 隐藏敏感信息
        requestAuth: '' // 隐藏敏感信息
      })),
      ocrModels: (ocrModels || []).map((m) => ({
        model: m.model,
        name: m.name,
        charsPointsPrice: m.charsPointsPrice || 0,
        avatar: m.avatar || ''
      })),
      pdfModels: (pdfModels || []).map((m: any) => ({
        model: m.model,
        name: m.name,
        avatar: m.avatar || '',
        charsPointsPrice: m.charsPointsPrice || 0,
        type: m.type
      })),
      whisperModel: whisperModel
        ? {
            model: whisperModel.model,
            name: whisperModel.name,
            charsPointsPrice: whisperModel.charsPointsPrice
          }
        : {
            model: '',
            name: '',
            charsPointsPrice: 0
          },
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
