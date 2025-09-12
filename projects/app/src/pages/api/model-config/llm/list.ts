import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoLLMModel } from '@fastgpt/service/core/model/llmSchema';
import type { LLMModelSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type LLMModelListQuery = PaginationProps<{
  current: number;
  pageSize: number;
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

    const {
      current = 1,
      pageSize = 20,
      search,
      isActive
    } = req.query as unknown as LLMModelListQuery;

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
      MongoLLMModel.countDocuments(filter),
      MongoLLMModel.find(filter)
        .sort({ sort: 1, createTime: -1 })
        .skip((current - 1) * pageSize)
        .limit(pageSize)
        .lean()
    ]);

    res.json({
      list: data as unknown as LLMModelSchema[],
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
