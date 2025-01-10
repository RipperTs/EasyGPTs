import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';
import { hashStr } from '@fastgpt/global/common/string/tools';

// 根据用户名和旧密码更新密码
export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { username, oldPsw, newPsw } = req.body as {
      username: string | number;
      oldPsw: string | number;
      newPsw: string | number;
    };

    if (!oldPsw || !newPsw) {
      throw new Error('Params is missing');
    }

    const user = await MongoUser.findOne({
      username,
      password: hashStr(oldPsw + '')
    });

    if (!user) {
      throw new Error('用户账号或密码错误');
    }

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(user._id, {
      password: hashStr(newPsw + '')
    });

    jsonRes(res, {
      data: {
        user
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
