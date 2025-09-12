import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemConfig } from '@fastgpt/service/core/model/systemConfigSchema';
import type { SystemConfigSchema } from '@fastgpt/global/core/model/type.d';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';

export type SystemConfigListQuery = PaginationProps<{
  search?: string;
  isActive?: boolean;
}>;

export type SystemConfigListResponse = PaginationResponse<SystemConfigSchema>;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SystemConfigListResponse>
) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserPer({ req, authToken: true });

    const { page = 1, pageSize = 20, search, isActive } = req.query as SystemConfigListQuery;

    const filter: any = { teamId };

    if (search) {
      filter.$or = [{ configKey: { $regex: search, $options: 'i' } }];
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === true || isActive === 'true';
    }

    const [total, data] = await Promise.all([
      MongoSystemConfig.countDocuments(filter),
      MongoSystemConfig.find(filter)
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
