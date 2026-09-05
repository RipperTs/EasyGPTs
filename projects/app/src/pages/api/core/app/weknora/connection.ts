import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  SaveWeKnoraConnectionParams,
  WeKnoraConnectionInfo
} from '@fastgpt/global/core/dataset/weknora';
import {
  getWeKnoraConnection,
  MongoWeKnoraConnection
} from '@fastgpt/service/core/dataset/weknora/connection';
import { listWeKnoraKnowledgeBases } from '@fastgpt/service/core/dataset/weknora/client';

const normalizeUrl = (value: string, label: string) => {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(`${label} 地址格式错误`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} 必须是无用户名、密码、查询参数和片段的 HTTP(S) 地址`);
  }
  return url.toString().replace(/\/+$/, '');
};

async function handler(
  req: ApiRequestProps<SaveWeKnoraConnectionParams, { appId: string; connectionId: string }>
) {
  if (req.method !== 'GET' && req.method !== 'POST') throw new Error('不支持的请求方法');
  const appId = req.method === 'GET' ? req.query.appId : req.body.appId;
  const { app } = await authApp({ req, authToken: true, appId, per: WritePermissionVal });
  const teamId = String(app.teamId);

  if (req.method === 'GET') {
    const connection = await getWeKnoraConnection({
      appId: String(app._id),
      teamId,
      connectionId: req.query.connectionId
    });
    return {
      connectionId: req.query.connectionId,
      apiUrl: connection.apiUrl,
      webUrl: connection.webUrl
    } satisfies WeKnoraConnectionInfo;
  }

  const { apiUrl, apiKey, webUrl, connectionId } = req.body;
  if (typeof apiUrl !== 'string' || !apiUrl.trim()) throw new Error('请填写 Base URL');
  if (typeof webUrl !== 'string') throw new Error('WeKnoraX 网页地址格式错误');
  if (apiKey !== undefined && (typeof apiKey !== 'string' || !apiKey.trim())) {
    throw new Error('API Key 不能为空');
  }
  if (apiKey === undefined && !connectionId) throw new Error('请填写 API Key');
  const normalizedApiUrl = normalizeUrl(apiUrl, 'Base URL');
  let connectionApiKey: string;
  if (apiKey === undefined) {
    const savedConnection = await getWeKnoraConnection({
      appId,
      teamId,
      connectionId: connectionId!
    });
    if (savedConnection.apiUrl !== normalizedApiUrl) {
      throw new Error('修改 Base URL 后，请重新填写 API Key');
    }
    connectionApiKey = savedConnection.apiKey;
  } else {
    connectionApiKey = apiKey.trim();
  }
  const config = {
    apiUrl: normalizedApiUrl,
    apiKey: connectionApiKey,
    webUrl: webUrl ? normalizeUrl(webUrl, 'WeKnoraX 网页地址') : ''
  };
  const datasets = await listWeKnoraKnowledgeBases(config);

  // Keep connections immutable so editing a draft cannot change a published workflow's credentials.
  const connection = await MongoWeKnoraConnection.create({ appId, teamId, ...config });
  return {
    connectionId: String(connection._id),
    apiUrl: config.apiUrl,
    webUrl: config.webUrl,
    datasets
  };
}

export default NextAPI(handler);
