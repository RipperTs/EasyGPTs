import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

// 刷新模型配置缓存的API
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: '方法不允许' });
  }

  try {
    await connectToDatabase();
    const { teamId } = await authUserPer({ req, authToken: true });

    // 刷新配置
    await refreshModelConfig(teamId);

    res.json({
      message: '配置刷新成功',
      success: true
    });
  } catch (err) {
    console.error('刷新配置失败:', err);
    res.status(500).json({
      message: '刷新配置失败',
      success: false
    });
  }
}
