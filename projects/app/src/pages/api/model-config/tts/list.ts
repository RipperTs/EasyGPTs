import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoTTSModel } from '@fastgpt/service/core/model/ttsSchema';
import type { TTSModelSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type TTSModelListQuery = PaginationProps<{
  search?: string;
  isActive?: boolean;
}>;

export type TTSModelListResponse = {
  data: TTSModelSchema[];
  total: number;
  pageNum: number;
  pageSize: number;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TTSModelListResponse>
) {
  try {
    await connectToDatabase();
    const {
      current = 1,
      pageSize = 20,
      search,
      isActive
    } = {
      current: Number(req.query.current || req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
      search: req.query.search as string | undefined,
      isActive: req.query.isActive as string | undefined
    };

    const filter: any = {};

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } }
      ];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const [total, data] = await Promise.all([
      MongoTTSModel.countDocuments(filter),
      MongoTTSModel.find(filter)
        .sort({ sort: 1, createTime: -1 })
        .skip((current - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    res.json({
      data: data as unknown as TTSModelSchema[],
      total,
      pageNum: current,
      pageSize: pageSize
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
