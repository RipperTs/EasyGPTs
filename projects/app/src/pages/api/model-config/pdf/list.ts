import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoPDFModel } from '@fastgpt/service/core/model/pdfSchema';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();
    const { page, pageSize, search } = req.query;

    const pageNum = Number(page || 1);
    const sizeNum = Number(pageSize || 20);

    const filter: Record<string, unknown> = {};
    const searchStr = typeof search === 'string' ? search : undefined;
    if (searchStr) {
      (filter as any).$or = [
        { name: { $regex: searchStr, $options: 'i' } },
        { model: { $regex: searchStr, $options: 'i' } }
      ];
    }

    const [total, list] = await Promise.all([
      MongoPDFModel.countDocuments(filter),
      MongoPDFModel.find(filter)
        .sort({ updateTime: -1, createTime: -1 })
        .skip((pageNum - 1) * sizeNum)
        .limit(sizeNum)
        .lean()
    ]);

    res.json({ list, total, page: pageNum, pageSize: sizeNum });
  } catch (error) {
    console.error(error);
    res.status(500).json({ list: [], total: 0 });
  }
}
