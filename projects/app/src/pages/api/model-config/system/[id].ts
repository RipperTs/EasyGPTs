import type { NextApiRequest, NextApiResponse } from 'next';
import { connectToDatabase } from '@/service/mongo';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoSystemConfig } from '@fastgpt/service/core/model/schema';
import type {
  UpdateSystemConfigParams,
  SystemConfigSchema
} from '@fastgpt/global/core/model/type.d';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SystemConfigSchema | { message: string }>
) {
  try {
    await connectToDatabase();
    const { teamId } = await authUserPer({ req, authToken: true });
    const { id } = req.query;

    if (req.method === 'PUT') {
      // 更新配置
      const updateData = req.body as Partial<UpdateSystemConfigParams>;
      delete (updateData as any).id;

      const config = await MongoSystemConfig.findOneAndUpdate(
        {
          _id: id,
          teamId
        },
        {
          ...updateData,
          updateTime: new Date()
        },
        { new: true }
      );

      if (!config) {
        return res.status(404).json({ message: '配置不存在' });
      }

      res.json(config.toJSON());
    } else if (req.method === 'DELETE') {
      // 删除配置（软删除）
      const config = await MongoSystemConfig.findOneAndUpdate(
        {
          _id: id,
          teamId
        },
        {
          isActive: false,
          updateTime: new Date()
        },
        { new: true }
      );

      if (!config) {
        return res.status(404).json({ message: '配置不存在' });
      }

      res.json({ message: '删除成功' });
    } else {
      res.status(405).json({ message: '方法不允许' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: '服务器错误' });
  }
}
