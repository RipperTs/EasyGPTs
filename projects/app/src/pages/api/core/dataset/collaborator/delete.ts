import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import {
  PerResourceTypeEnum,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { DatasetCollaboratorDeleteParams } from '@fastgpt/global/core/dataset/collaborator';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { datasetId, tmbId } = req.query as DatasetCollaboratorDeleteParams;

    if (!datasetId || !tmbId) {
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

    // 删除协作者权限
    await MongoResourcePermission.deleteOne({
      resourceType: PerResourceTypeEnum.dataset,
      resourceId: datasetId,
      teamId,
      tmbId
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
