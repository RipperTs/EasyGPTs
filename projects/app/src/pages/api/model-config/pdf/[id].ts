import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoPDFModel } from '@fastgpt/service/core/model/pdfSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';
import type { UpdatePDFModelParams } from '@fastgpt/global/core/model/type.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { id } = req.query as { id: string };

    if (req.method === 'GET') {
      const doc = await MongoPDFModel.findById(id);
      if (!doc) return res.status(404).json({ message: '不存在' });
      return res.json(doc.toJSON());
    }
    if (req.method === 'PUT') {
      const { id: _ignore, apiKey, ...rest } = (req.body || {}) as UpdatePDFModelParams;
      const payload: Record<string, unknown> = { ...rest, updateTime: new Date() };
      if (typeof apiKey === 'string') payload.apiKey = apiKey;

      const updated = await MongoPDFModel.findByIdAndUpdate(id, payload as any, { new: true });
      if (!updated) return res.status(404).json({ message: '不存在' });
      await refreshModelConfig();
      return res.json(updated.toJSON());
    }
    if (req.method === 'DELETE') {
      const del = await MongoPDFModel.findByIdAndDelete(id);
      if (!del) return res.status(404).json({ message: '不存在' });
      await refreshModelConfig();
      return res.json({ message: '删除成功' });
    }

    return res.status(405).json({ message: '方法不允许' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: '服务器错误' });
  }
}
