import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';
import type { LLMModelSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type LLMModelListQuery = PaginationProps<{
  search?: string;
  isActive?: boolean;
}>;

export type LLMModelListResponse = PaginationResponse<LLMModelSchema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LLMModelListResponse>
) {
  try {
    await connectToDatabase();

    const { page = 1, pageSize = 20, search, isActive } = req.query as LLMModelListQuery;

    const filter: any = {};

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
      MongoLLMModel.countDocuments(filter),
      MongoLLMModel.find(filter)
        .sort({ sort: 1, createTime: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    // 添加调试日志
    console.log('查询到的数据示例:', data[0]);

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
      pageNum: 0
    });
  }
}
