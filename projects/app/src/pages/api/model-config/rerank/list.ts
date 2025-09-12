import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoReRankModel } from '@fastgpt/service/core/model/rerankSchema';
import type { ReRankModelSchema } from '@fastgpt/global/core/model/type.d';

export interface ReRankModelListQuery {
  current?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
}

export interface ReRankModelListResponse {
  list: ReRankModelSchema[];
  total: number;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReRankModelListResponse>
) {
  try {
    await connectToDatabase();
    // 移除用户认证，改为全局数据
    // const { teamId } = await authUserPer({ req, authToken: true });

    const { current = 1, pageSize = 20, search, isActive } = req.query;
    const currentPage = Number(current);
    const pageSizeNum = Number(pageSize);

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
      MongoReRankModel.countDocuments(filter),
      MongoReRankModel.find(filter)
        .sort({ createdAt: -1 })
        .skip((currentPage - 1) * pageSizeNum)
        .limit(pageSizeNum)
        .lean()
    ]);

    res.json({
      list: data,
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
