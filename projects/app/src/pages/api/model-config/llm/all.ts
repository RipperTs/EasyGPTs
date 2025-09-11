import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { MongoLLMModel } from '@fastgpt/service/core/model/schema';
import type { LLMModelSchema } from '@fastgpt/global/core/model/type.d';

export type LLMModelAllResponse = LLMModelSchema[];

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<LLMModelAllResponse>
) {
  try {
    await connectToDatabase();

    // 获取所有激活的模型（系统级共享），不分页，按sort正序排列
    const data = await MongoLLMModel.find({
      isActive: true
    })
      .sort({ sort: 1, createTime: -1 })
      .lean();

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
}
