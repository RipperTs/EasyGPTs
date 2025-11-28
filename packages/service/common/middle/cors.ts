import type { NextApiResponse, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';

export async function withNextCors(req: NextApiRequest, res: NextApiResponse) {
  await NextCors(req, res, {
    // 反射 Origin，等价于允许所有来源，且可配合 credentials 使用
    origin: true,
    // 允许携带 cookie / 凭证
    credentials: true,
    // 常见方法全部放开，并补充 OPTIONS、HEAD
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    optionsSuccessStatus: 200
  });
}
