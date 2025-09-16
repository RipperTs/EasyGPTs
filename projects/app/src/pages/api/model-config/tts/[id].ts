import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoTTSModel } from '@fastgpt/service/core/model/ttsSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';
import type { UpdateTTSModelParams, TTSModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TTSModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { id } = req.query;

    if (req.method === 'GET') {
      // 获取单个模型
      const model = await MongoTTSModel.findById(id);

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      res.json(model.toJSON());
    } else if (req.method === 'PUT') {
      // 更新模型
      const updateData = req.body as Partial<UpdateTTSModelParams>;
      delete (updateData as any).id;

      const model = await MongoTTSModel.findByIdAndUpdate(
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
      // 直接删除模型
      const model = await MongoTTSModel.findByIdAndDelete(id);

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
