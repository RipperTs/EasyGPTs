import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { connectToDatabase } from '@/service/mongo';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { hashStr } from '@fastgpt/global/common/string/tools';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { oldPassword, newPassword } = req.body as { oldPassword: string; newPassword: string };

    if (!oldPassword || !newPassword) {
      throw new Error('Params is missing');
    }

    const oldPsw = hashStr(oldPassword);
    const newPsw = hashStr(newPassword);

    const { tmbId } = await authCert({ req, authToken: true });
    const tmb = await MongoTeamMember.findById(tmbId);
    if (!tmb) {
      throw new Error('找不到用户信息');
    }
    const userId = tmb.userId;
    // auth old password
    const user = await MongoUser.findOne({
      _id: userId,
      password: oldPsw
    });

    if (!user) {
      throw new Error('旧密码不正确');
    }

    // 更新对应的记录
    await MongoUser.findByIdAndUpdate(userId, {
      password: newPsw
    });

    // 异步调用第三方接口，不等待结果
    updateXGTPasswordWithTimeout(user.username, oldPassword, newPassword).catch((error) => {
      console.error('Failed to sync password with XGT:', error);
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

/**
 * 修改新钢11平台密码, 用于同步
 * @param username
 * @param oldPsw
 * @param newPsw
 */
async function updateXGTPassword(username: string, oldPsw: string, newPsw: string) {
  const baseUrl = process.env.XGT_UPDATE_PSW_URL || '';
  if (!baseUrl.trim()) {
    throw new Error('XGT_UPDATE_PSW_URL is empty');
  }
  const res = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      newPwd: newPsw,
      userName: username,
      password: oldPsw
    })
  });
  return await res.json();
}

/**
 * 带超时控制的XGT密码更新
 */
function updateXGTPasswordWithTimeout(
  username: string,
  oldPsw: string,
  newPsw: string,
  timeout = 5000
): Promise<any> {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error('XGT password sync timeout')), timeout);
  });

  return Promise.race([updateXGTPassword(username, oldPsw, newPsw), timeoutPromise]);
}
