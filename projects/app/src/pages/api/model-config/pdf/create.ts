import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoPDFModel } from '@fastgpt/service/core/model/pdfSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';
import type { CreatePDFModelParams } from '@fastgpt/global/core/model/type.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: '方法不允许' });
  try {
    await connectToDatabase();
    const body = (req.body || {}) as CreatePDFModelParams;
    const model = String(body.model || '').trim();
    const name = String(body.name || '').trim();
    const avatar = body.avatar || '/imgs/model/llm.svg';
    const charsPointsPrice = Number(body.charsPointsPrice || 0);
    const type = body.type;
    const requestUrl = body.requestUrl || '';
    const apiKey = body.apiKey || '';
    const defaultConfig = body.defaultConfig || {};

    if (!model || !name || !type) {
      return res.status(400).json({ message: '模型名、显示名、类型为必填' });
    }

    const exist = await MongoPDFModel.findOne({ model });
    if (exist) return res.status(400).json({ message: '该模型已存在' });

    const created = await MongoPDFModel.create({
      model,
      name,
      avatar,
      charsPointsPrice,
      type,
      requestUrl,
      apiKey,
      defaultConfig,
      isActive: true
    });
    await refreshModelConfig();
    res.json(created.toJSON());
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: '服务器错误' });
  }
}
