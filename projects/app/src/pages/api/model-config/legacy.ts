import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { getLegacyConfig } from '@fastgpt/service/core/model/controller';

// 提供兼容旧格式的配置API，用于系统过渡期间
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    // 对于系统配置，不需要严格的用户认证，但可以获取团队信息
    let teamId: string | undefined;
    try {
      const auth = await authUserPer({ req, authToken: true });
      teamId = auth.teamId;
    } catch (error) {
      // 如果认证失败，使用默认配置（不限制团队）
      console.log('使用默认配置，无团队限制');
    }

    const config = await getLegacyConfig();

    res.json(config);
  } catch (err) {
    console.error('获取模型配置失败:', err);
    res.status(500).json({
      error: '获取配置失败'
    });
  }
}
