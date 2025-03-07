import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 获取当前用户信息
    const { userId } = await parseHeaderCert({
      req,
      authToken: true
    });

    // 获取查询参数
    const { keyword = '' } = req.query as { keyword?: string };

    if (!keyword) {
      return jsonRes(res, {
        code: 200,
        data: []
      });
    }

    // 搜索用户
    const users = await MongoUser.find({
      username: { $regex: keyword, $options: 'i' },
      _id: { $ne: userId } // 排除当前用户
    })
      .limit(10)
      .lean();

    // 返回结果
    return jsonRes(res, {
      code: 200,
      data: users.map((user) => ({
        userId: String(user._id),
        username: user.username,
        avatar: user.avatar
      }))
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
