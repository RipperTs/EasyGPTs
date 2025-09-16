import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoWhisperModel } from '@fastgpt/service/core/model/whisperSchema';
import { refreshModelConfig } from '@fastgpt/service/common/system/tools';

// 将 Whisper 配置保存到数据库（若存在则更新，否则创建）
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

    // 查找当前活跃的 Whisper 配置
    const exist = await MongoWhisperModel.findOne({ isActive: true });

    let saved;
    if (exist) {
      saved = await MongoWhisperModel.findByIdAndUpdate(
        exist._id,
        {
          model,
          name,
          charsPointsPrice,
          updateTime: new Date()
        },
        { new: true }
      );
    } else {
      saved = await MongoWhisperModel.create({
        model,
        name,
        charsPointsPrice,
        isActive: true
      });
    }

    // 刷新服务端全局模型配置缓存
    await refreshModelConfig();

    return res.json(saved?.toJSON?.() || saved);
  } catch (err: any) {
    console.error('保存 Whisper 配置失败:', err);
    return res.status(500).json({ error: err?.message || '保存失败' });
  }
}
