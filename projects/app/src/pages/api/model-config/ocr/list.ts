import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type OCRModelListQuery = PaginationProps<{
  current: number;
  pageSize: number;
  search?: string;
  isActive?: boolean;
}>;

export type OCRModelListResponse = PaginationResponse<OCRModelSchema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<OCRModelListResponse>
) {
  try {
    await connectToDatabase();

    const {
      current = 1,
      pageSize = 20,
      search,
      isActive
    } = req.query as unknown as OCRModelListQuery;

    const filter: any = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }
    if (isActive !== undefined) {
      filter.isActive = String(isActive) === 'true';
    }

    const [total, data] = await Promise.all([
      MongoOCRModel.countDocuments(filter),
      MongoOCRModel.find(filter)
        .sort({ updateTime: -1, createTime: -1 })
        .skip((Number(current) - 1) * Number(pageSize))
        .limit(Number(pageSize))
        .lean()
    ]);

    res.json({
      list: data as unknown as OCRModelSchema[],
      total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      list: [],
      total: 0
    });
  }
}
