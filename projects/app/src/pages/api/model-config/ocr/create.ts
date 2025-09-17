import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import type { CreateOCRModelParams, OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OCRModelSchema | { message: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: '方法不允许' });
  }

  try {
    await connectToDatabase();
    const body = req.body as CreateOCRModelParams & { avatar?: string };
    const model = String(body.model || '').trim();
    const name = String(body.name || '').trim();
    const charsPointsPrice = Number(body.charsPointsPrice || 0);
    const avatar = body.avatar || '/imgs/model/ocr.svg';

    if (!model || !name) {
      return res.status(400).json({ message: '模型名、显示名为必填' });
    }

    const exist = await MongoOCRModel.findOne({ model });
    if (exist) {
      return res.status(400).json({ message: '该模型已存在' });
    }

    const created = await MongoOCRModel.create({
      model,
      name,
      charsPointsPrice,
      avatar,
      isActive: true
    });

    await refreshModelConfig();

    res.json(created.toJSON());
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
}
