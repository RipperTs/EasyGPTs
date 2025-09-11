import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';
import type { UpdateLLMModelParams, LLMModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LLMModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { id } = req.query;

    if (req.method === 'GET') {
      // 获取单个模型（系统级）
      const model = await MongoLLMModel.findById(id);

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'PUT') {
      // 更新模型（系统级）
      console.log('更新模型请求数据:', req.body);
      const updateData = req.body as Partial<UpdateLLMModelParams>;
      delete (updateData as any).id;

      const model = await MongoLLMModel.findByIdAndUpdate(
        id,
        {
          ...updateData,
          updateTime: new Date()
        },
        { new: true }
      );

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'DELETE') {
      // 删除模型（系统级，真删除）
      const model = await MongoLLMModel.findByIdAndDelete(id);

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
