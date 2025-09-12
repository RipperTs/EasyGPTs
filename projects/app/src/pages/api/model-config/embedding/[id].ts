import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoEmbeddingModel } from '@fastgpt/service/core/model/embeddingSchema';
import type {
  UpdateEmbeddingModelParams,
  EmbeddingModelSchema
} from '@fastgpt/global/core/model/type.d';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<EmbeddingModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { id } = req.query;

    if (req.method === 'GET') {
      // 获取单个向量模型
      const model = await MongoEmbeddingModel.findById(id);

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'PUT') {
      // 更新向量模型
      console.log('更新向量模型请求数据:', req.body);
      const updateData = req.body as Partial<UpdateEmbeddingModelParams>;
      delete (updateData as any).id;

      const model = await MongoEmbeddingModel.findByIdAndUpdate(
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

      // 刷新全局模型配置
      await refreshModelConfig();

      res.json(model.toJSON());
    } else if (req.method === 'DELETE') {
      // 删除向量模型
      const model = await MongoEmbeddingModel.findByIdAndDelete(id);

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      // 刷新全局模型配置
      await refreshModelConfig();

      res.json({ message: '删除成功' });
    } else {
      res.status(405).json({ message: '方法不允许' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
}
