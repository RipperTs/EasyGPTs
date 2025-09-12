import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type OCRModelListQuery = PaginationProps<{
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
    const { teamId } = await authUserPer({ req, authToken: true });

    const { page = 1, pageSize = 20, search, isActive } = req.query as OCRModelListQuery;

    const filter: any = { teamId };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === true || isActive === 'true';
    }

    const [total, data] = await Promise.all([
      MongoOCRModel.countDocuments(filter),
      MongoOCRModel.find(filter)
        .sort({ updateTime: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    res.json({
      data,
      total,
      pageNum: Number(page),
      pageSize: Number(pageSize)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      data: [],
      total: 0,
      pageNum: 0,
      pageSize: 0
    });
  }
}
