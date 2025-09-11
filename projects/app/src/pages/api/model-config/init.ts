import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { initAllConfigs } from '@fastgpt/service/core/model-config/controller';

// 初始化模型配置的API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: '方法不允许' });
  }

  try {
    await connectToDatabase();
    const { teamId, tmbId } = await authUserPer({ req, authToken: true, per: 'w' });

    // 从配置文件初始化所有模型配置到数据库
    await initAllConfigs(teamId, tmbId);

    res.json({
      message: '配置初始化成功',
      success: true
    });
  } catch (err) {
    console.error('初始化配置失败:', err);
    res.status(500).json({
      message: '初始化配置失败',
      success: false
    });
  }
}
