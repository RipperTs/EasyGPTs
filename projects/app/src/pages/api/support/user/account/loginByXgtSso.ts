import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createDefaultTeam } from '@fastgpt/service/support/user/team/controller';
import { getUserDetail } from '@fastgpt/service/support/user/controller';
import { createJWT, setCookie } from '@fastgpt/service/support/permission/controller';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';
import { randomUUID } from 'crypto';

function isMongoDuplicateKeyError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000;
}

type XgtGetUserInfoData = {
  empNo?: string;
  chn?: string;
};

type XgtGetUserInfoResponse = {
  code?: number;
  msg?: string;
  data?: XgtGetUserInfoData;
};

function parseXgtGetUserInfoResponse(data: unknown): XgtGetUserInfoResponse | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const code = typeof obj.code === 'number' ? obj.code : undefined;
  const msg = typeof obj.msg === 'string' ? obj.msg : undefined;
  const payload = obj.data;

  const payloadObj =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const parsedData = payloadObj
    ? {
        empNo: typeof payloadObj.empNo === 'string' ? payloadObj.empNo : undefined,
        chn: typeof payloadObj.chn === 'string' ? payloadObj.chn : undefined
      }
    : undefined;

  return { code, msg, data: parsedData };
}

async function getEmpNoByXgtRemoteToken(remoteToken: string) {
  const url =
    process.env.XGT_SSO_GET_USER_INFO_URL?.trim() || 'http://10.6.77.168/login/getUserInfo';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ remoteToken }),
    signal: controller.signal
  }).finally(() => clearTimeout(timeoutId));

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`getUserInfo 接口请求失败(${response.status})`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`getUserInfo 接口返回非 JSON: ${rawText.slice(0, 200)}`);
  }

  const result = parseXgtGetUserInfoResponse(json);
  if (!result) throw new Error('getUserInfo 响应格式错误');
  if (result.code !== 200) throw new Error(result.msg || 'getUserInfo 响应 code 非 200');

  const empNo = result.data?.empNo?.trim();
  if (!empNo) throw new Error('getUserInfo 返回缺少 empNo');

  return {
    empNo,
    chn: result.data?.chn?.trim()
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { token } = req.body as { token?: string };
    if (!token) throw new Error('缺少参数');
    const { empNo, chn } = await getEmpNoByXgtRemoteToken(token);
    const loginUsername = empNo;

    await mongoSessionRun(async (session) => {
      const existUser = await MongoUser.findOne({ username: loginUsername }).session(session);
      if (existUser) return;

      try {
        const [{ _id }] = await MongoUser.create(
          [
            {
              username: loginUsername,
              password: randomUUID()
            }
          ],
          { session }
        );

        await createDefaultTeam({
          userId: String(_id),
          teamName: `${chn || loginUsername}的团队`,
          balance: 0,
          session
        });
      } catch (error) {
        // 并发首次登录时，可能出现重复创建（以唯一索引为准），直接忽略并继续走后续登录流程
        if (isMongoDuplicateKeyError(error)) return;
        throw error;
      }
    });

    const user = await MongoUser.findOne({ username: loginUsername }, 'status').lean();
    if (!user) throw new Error('用户创建失败');
    if (user.status === UserStatusEnum.forbidden) throw new Error('账号已停用，无法登录');

    const userDetail = await getUserDetail({
      userId: String(user._id)
    });

    await MongoUser.findByIdAndUpdate(user._id, {
      lastLoginTmbId: userDetail.team.tmbId,
      lastLoginTime: new Date()
    });

    const jwt = createJWT({
      ...userDetail,
      isRoot: loginUsername === 'root'
    });

    setCookie(res, jwt);

    jsonRes(res, {
      data: {
        user: userDetail,
        token: jwt
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
