import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { connectToDatabase } from '@/service/mongo';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import type { PostLoginProps } from '@fastgpt/global/support/user/api.d';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { PRICE_SCALE } from '@fastgpt/global/support/wallet/constants';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { username, password } = req.body as PostLoginProps;

    if (!username || !password) {
      throw new Error('缺少参数');
    }

    const rootUser = await MongoUser.findOne({
      username: username
    });

    let rootId = rootUser?._id || '';

    await mongoSessionRun(async (session) => {
      // init root user
      if (rootUser) {
        throw new Error('user already exist');
      } else {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: username,
              password: hashStr(password)
            }
          ],
          { session }
        );
        rootId = _id;
      }
      // init root team
      await createDefaultTeam({ userId: rootId, balance: 9999 * PRICE_SCALE, session });
    });

    console.log(`${username} user init:`, {
      username: username,
      password: password
    });

    jsonRes(res, {
      data: {
        user: username
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
