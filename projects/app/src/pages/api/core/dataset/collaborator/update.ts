import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  PerResourceTypeEnum,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { UpdateDatasetCollaboratorBody } from '@fastgpt/global/core/dataset/collaborator';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { datasetId, tmbIds, permission } = req.body as UpdateDatasetCollaboratorBody;

    if (!datasetId || !tmbIds || !tmbIds.length || permission === undefined) {
      return jsonRes(res, {
        code: 500,
        error: '缺少参数'
      });
    }

    const { teamId } = await authDataset({
      req,
      authToken: true,
      datasetId,
      per: ManagePermissionVal
    });

    // 更新协作者权限
    await mongoSessionRun(async (session) => {
      // 删除旧的权限
      await MongoResourcePermission.deleteMany(
        {
          resourceType: PerResourceTypeEnum.dataset,
          resourceId: datasetId,
          teamId,
          tmbId: { $in: tmbIds }
        },
        { session }
      );

      // 创建新的权限
      await MongoResourcePermission.insertMany(
        tmbIds.map((tmbId: string) => ({
          resourceType: PerResourceTypeEnum.dataset,
          resourceId: datasetId,
          teamId,
          tmbId,
          permission
        })),
        { session }
      );
    });

    return jsonRes(res, {
      code: 200,
      data: true
    });
  } catch (error) {
    return jsonRes(res, {
      code: 500,
      error
    });
  }
}
