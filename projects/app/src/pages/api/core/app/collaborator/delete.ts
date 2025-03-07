import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  PerResourceTypeEnum,
  ManagePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppCollaboratorDeleteParams } from '@fastgpt/global/core/app/collaborator';
import { connectToDatabase } from '@/service/mongo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    await connectToDatabase();

    const { appId, tmbId } = req.query as AppCollaboratorDeleteParams;

    if (!appId || !tmbId) {
      return jsonRes(res, {
        code: 500,
        error: '缺少参数'
      });
    }

    const { teamId } = await authApp({
      req,
      authToken: true,
      appId,
      per: ManagePermissionVal
    });

    // 删除协作者权限
    await MongoResourcePermission.deleteOne({
      resourceType: PerResourceTypeEnum.app,
      resourceId: appId,
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
