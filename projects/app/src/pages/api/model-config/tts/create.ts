import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoTTSModel } from '@fastgpt/service/core/model/ttsSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';
import type { CreateTTSModelParams, TTSModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<TTSModelSchema>) {
  try {
    await connectToDatabase();

    const {
      model,
      name,
      avatar = '/imgs/model/tts.svg',
      charsPointsPrice = 0,
      requestUrl,
      requestHeader = {},
      voices = [],
      defaultConfig = {},
      sort = 100
    } = req.body as any;

    // 检查模型名是否已存在
    const existingModel = await MongoTTSModel.findOne({
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoTTSModel.create({
      model,
      name,
      avatar,
      charsPointsPrice,
      requestUrl,
      requestHeader,
      voices,
      defaultConfig,
      sort,
      isActive: true
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
