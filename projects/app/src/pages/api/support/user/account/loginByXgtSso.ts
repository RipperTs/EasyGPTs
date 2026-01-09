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

type XgtPermissionItem = {
  empNo?: string;
  chn?: string;
};

type XgtPermissionResponse = {
  authenticated?: boolean;
  code?: number;
  username?: string;
  token?: string;
  post?: XgtPermissionItem[];
};

function getReqOrigin(req: NextApiRequest) {
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader || 'http')
    .split(',')[0]
    .trim();

  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader || '').split(',')[0].trim();

  if (!host) return '';
  return `${proto}://${host}`;
}

function parseXgtPermissionResponse(data: unknown): XgtPermissionResponse | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  const code = typeof obj.code === 'number' ? obj.code : undefined;
  const authenticated = typeof obj.authenticated === 'boolean' ? obj.authenticated : undefined;
  const username = typeof obj.username === 'string' ? obj.username : undefined;
  const token = typeof obj.token === 'string' ? obj.token : undefined;
  const post = Array.isArray(obj.post)
    ? obj.post
        .filter((item) => item && typeof item === 'object')
        .map((item) => {
          const it = item as Record<string, unknown>;
          return {
            empNo: typeof it.empNo === 'string' ? it.empNo : undefined,
            chn: typeof it.chn === 'string' ? it.chn : undefined
          };
        })
    : undefined;

  return { code, authenticated, username, token, post };
}

async function getXgtLoginUserInfo({
  origin,
  token,
  username
}: {
  origin: string;
  token: string;
  username: string;
}) {
  if (!origin) throw new Error('origin is empty');

  const baseOrigin = process.env.FE_DOMAIN?.trim() || origin;
  if (!baseOrigin) throw new Error('permission base origin is empty');

  const permissionUrl = new URL('/per_api/permission.php', baseOrigin);
  permissionUrl.searchParams.set('permission', 'login');
  permissionUrl.searchParams.set('token', token);
  permissionUrl.searchParams.set('username', username);

  const response = await fetch(permissionUrl.toString(), { method: 'GET' });
  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`鉴权接口请求失败(${response.status})`);
  }

  let json: unknown;
  try {
    json = JSON.parse(rawText);
  } catch {
    throw new Error(`鉴权接口返回非 JSON: ${rawText.slice(0, 200)}`);
  }

  const result = parseXgtPermissionResponse(json);

  if (!result) throw new Error('鉴权响应格式错误');
  if (result.code !== 200 || !result.authenticated) throw new Error('鉴权失败');
  if (!result.username) throw new Error('鉴权返回缺少 username');

  const displayName = result.post?.[0]?.chn;

  return {
    username: result.username,
    displayName
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { token, username, card } = req.body as {
      token?: string;
      username?: string;
      card?: string;
    };
    const loginName = username || card;
    if (!token || !loginName) throw new Error('缺少参数');

    const origin = getReqOrigin(req);
    const { username: loginUsername, displayName } = await getXgtLoginUserInfo({
      origin,
      token,
      username: loginName
    });

    await mongoSessionRun(async (session) => {
      const existUser = await MongoUser.findOne({ username: loginUsername }).session(session);
      if (existUser) return;

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
        teamName: `${displayName || loginUsername}的团队`,
        balance: 0,
        session
      });
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
