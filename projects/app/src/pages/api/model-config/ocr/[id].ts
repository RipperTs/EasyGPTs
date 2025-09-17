import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import type { UpdateOCRModelParams, OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OCRModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { id } = req.query;

    if (req.method === 'GET') {
      const model = await MongoOCRModel.findById(id);
      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }
      return res.json(model.toJSON());
    } else if (req.method === 'PUT') {
      // 更新模型
      const { id: _ignore, ...rest } = (req.body || {}) as Partial<UpdateOCRModelParams>;
      const model = await MongoOCRModel.findByIdAndUpdate(
        id,
        {
          ...rest,
          updateTime: new Date()
        },
        { new: true }
      );

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      await refreshModelConfig();
      return res.json(model.toJSON());
    } else if (req.method === 'DELETE') {
      // 直接删除
      const model = await MongoOCRModel.findByIdAndDelete(id);

      if (!model) {
        return res.status(404).json({ message: '模型不存在' });
      }

      await refreshModelConfig();
      return res.json({ message: '删除成功' });
    } else {
      res.status(405).json({ message: '方法不允许' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
}
