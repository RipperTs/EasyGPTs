import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoOCRModel } from '@fastgpt/service/core/model/ocrSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

// 将 OCR 配置保存到数据库（若存在则更新，否则创建）
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    await connectToDatabase();
    // 权限校验（需要登录）
    await authUserPer({ req, authToken: true });

    const body = req.body || {};
    const model = String(body.model || '').trim();
    const name = String(body.name || '').trim();
    const charsPointsPrice = Number(body.charsPointsPrice || 0);
    if (!model || !name) {
      return res.status(400).json({ error: '模型名、显示名为必填' });
    }

    // 按模型名进行 upsert，允许维护多个 OCR 配置
    const saved = await MongoOCRModel.findOneAndUpdate(
      { model },
      {
        model,
        name,
        charsPointsPrice,
        isActive: true,
        updateTime: new Date()
      },
      { new: true, upsert: true }
    );

    // 刷新服务端全局模型配置缓存
    await refreshModelConfig();

    return res.json(saved?.toJSON?.() || saved);
  } catch (err: any) {
    console.error('保存 OCR 配置失败:', err);
    return res.status(500).json({ error: err?.message || '保存失败' });
  }
}
