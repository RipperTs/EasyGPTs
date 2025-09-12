import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoReRankModel } from '@fastgpt/service/core/model/rerankSchema';
import type { CreateReRankModelParams, ReRankModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReRankModelSchema>
) {
  try {
    await connectToDatabase();
    // 移除用户认证，改为全局数据
    // const { teamId, tmbId } = await authUserPer({ req, authToken: true });

    const {
      model,
      name,
      charsPointsPrice = 0,
      requestUrl,
      apiKey
    } = req.body as CreateReRankModelParams;

    console.log('接收到的创建请求数据:', {
      model,
      name,
      charsPointsPrice,
      requestUrl,
      apiKey: apiKey ? '***已提供***' : '未提供'
    });

    // 检查模型名是否已存在
    const existingModel = await MongoReRankModel.findOne({
      model,
      isActive: true
    });

    if (existingModel) {
      return res.status(400).json({
        error: '模型名已存在'
      } as any);
    }

    const newModel = await MongoReRankModel.create({
      model,
      name,
      charsPointsPrice,
      requestUrl,
      apiKey,
      isActive: true
    });

    console.log('保存到数据库的数据:', {
      ...newModel.toJSON(),
      apiKey: newModel.apiKey ? '***已保存***' : '未保存'
    });

    res.json(newModel.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: '创建失败'
    } as any);
  }
}
