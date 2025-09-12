import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoEmbeddingModel } from '@fastgpt/service/core/model/embeddingSchema';
import type {
  CreateEmbeddingModelParams,
  EmbeddingModelSchema
} from '@fastgpt/global/core/model/type.d';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmbeddingModelSchema>
) {
  try {
    await connectToDatabase();

    const {
      model,
      name,
      avatar = '/imgs/model/huggingface.svg',
      charsPointsPrice = 0,
      defaultToken,
      maxToken,
      weight = 100,
      defaultConfig = {},
      dbConfig = {},
      queryConfig = {},
      sort = 100
    } = req.body as CreateEmbeddingModelParams;

    // 验证必填字段
    if (!model || !name || !defaultToken || !maxToken) {
      return res.status(400).json({
        error: '缺少必填字段'
      } as any);
    }

    // 检查模型名是否已存在
    const existingModel = await MongoEmbeddingModel.findOne({
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoEmbeddingModel.create({
      model,
      name,
      avatar,
      charsPointsPrice,
      defaultToken,
      maxToken,
      weight,
      defaultConfig,
      dbConfig,
      queryConfig,
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
