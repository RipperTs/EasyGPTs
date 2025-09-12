import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import type { UpdateOCRModelParams, OCRModelSchema } from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OCRModelSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserPer({ req, authToken: true });
    const { id } = req.query;

    if (req.method === 'PUT') {
      // 更新模型
      const updateData = req.body as Partial<UpdateOCRModelParams>;
      delete (updateData as any).id;

      const model = await MongoOCRModel.findOneAndUpdate(
        {
          _id: id,
          teamId
        },
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
      // 删除模型（软删除）
      const model = await MongoOCRModel.findOneAndUpdate(
        {
          _id: id,
          teamId
        },
        {
          isActive: false,
          updateTime: new Date()
        },
        { new: true }
      );

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
