import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getWeKnoraConnection } from '@fastgpt/service/core/dataset/weknora/connection';
import { listWeKnoraKnowledgeBases } from '@fastgpt/service/core/dataset/weknora/client';

async function handler(req: ApiRequestProps<undefined, { appId: string; connectionId: string }>) {
  if (req.method !== 'GET') throw new Error('不支持的请求方法');
  const { appId, connectionId } = req.query;
  const { app } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  const connection = await getWeKnoraConnection({
    appId,
    teamId: String(app.teamId),
    connectionId
  });
  return listWeKnoraKnowledgeBases(connection);
}

export default NextAPI(handler);
