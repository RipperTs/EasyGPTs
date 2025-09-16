import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoReRankModel } from '@fastgpt/service/core/model/rerankSchema';
import type { UpdateReRankModelParams, ReRankModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReRankModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    // 移除用户认证，改为全局数据
    // const { teamId } = await authUserPer({ req, authToken: true });
    const { id } = req.query;

    if (req.method === 'GET') {
      // 获取单个模型
      const model = await MongoReRankModel.findOne({
        _id: id
      });

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'PUT') {
      // 更新模型
      const updateData = req.body as Partial<UpdateReRankModelParams>;
      delete (updateData as any).id;

      const model = await MongoReRankModel.findOneAndUpdate(
        {
          _id: id
        },
        {
          $set: {
            ...updateData,
            updateTime: new Date()
          }
        },
        { new: true, runValidators: true }
      );

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'DELETE') {
      // 删除模型（硬删除）
      const model = await MongoReRankModel.findOneAndDelete({
        _id: id
      });

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json({ message: '删除成功' });
    } else {
      res.status(405).json({ message: '方法不允许' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
}
