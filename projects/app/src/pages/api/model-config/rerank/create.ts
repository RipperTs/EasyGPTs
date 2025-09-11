import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoReRankModel } from '@fastgpt/service/core/model/schema';
import type { CreateRerankModelParams, RerankModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RerankModelSchema>
) {
  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserPer({ req, authToken: true });

    const {
      model,
      name,
      avatar = '/imgs/model/rerank.svg',
      charsPointsPrice = 0,
      requestUrl,
      requestHeader = {},
      defaultConfig = {}
    } = req.body as CreateRerankModelParams;

    // 检查模型名是否已存在
    const existingModel = await MongoReRankModel.findOne({
      teamId,
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoReRankModel.create({
      teamId,
      tmbId,
      model,
      name,
      avatar,
      charsPointsPrice,
      requestUrl,
      requestHeader,
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
