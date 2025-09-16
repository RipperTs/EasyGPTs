import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { parseHeaderCert } from '@fastgpt/service/support/permission/controller';
import { getActiveWhisperModel } from '@fastgpt/service/core/model/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();
    // 允许用户登录态或 rootkey 访问
    await parseHeaderCert({ req, authToken: true, authRoot: true });

    const model = await getActiveWhisperModel();

    if (!model) return res.json(null);

    // 仅返回前端表单所需字段
    return res.json({
      model: model.model,
      name: model.name,
      charsPointsPrice: model.charsPointsPrice || 0
    });
  } catch (err: any) {
    console.error('获取 Whisper 配置失败:', err);
    return res.status(500).json({ error: err || '服务器错误' });
  }
}
