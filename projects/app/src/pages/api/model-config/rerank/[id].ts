import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
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

      console.log('接收到的更新请求数据:', {
        ...updateData,
        apiKey: updateData.apiKey ? '***已提供***' : '未提供'
      });

      console.log('实际的updateData对象:', updateData);
      console.log('requestAuth的原始值:', typeof updateData.apiKey, updateData.apiKey);

      // 在更新前先查询原始记录
      const originalModel = await MongoReRankModel.findOne({
        _id: id
      });
      console.log('更新前的原始数据:', originalModel?.toJSON());
      console.log('数据库中的所有字段:', Object.keys(originalModel?.toJSON() || {}));

      // 尝试直接使用 MongoDB 原生查询来检查字段
      const rawDoc = await MongoReRankModel.collection.findOne({
        _id: id
      });
      console.log('MongoDB原生查询结果:', rawDoc);
      console.log('原生查询的字段:', Object.keys(rawDoc || {}));

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

      console.log('更新后的数据:', {
        ...model.toJSON(),
        apiKey: model.apiKey ? '***已保存***' : '未保存'
      });

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
