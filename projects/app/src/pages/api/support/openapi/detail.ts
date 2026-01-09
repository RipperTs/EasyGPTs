import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

type Query = { id: string };
type Response = { apiKey: string };

type DocGetOptions = { getters?: boolean };
type DocWithGet = {
  get: (path: string, type?: unknown, options?: DocGetOptions) => unknown;
};

function isDocWithGet(value: unknown): value is DocWithGet {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.get === 'function';
}

async function handler(req: ApiRequestProps<unknown, Query>): Promise<Response> {
  const { id } = req.query;

  const { openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id
  });

  const openapiValue: unknown = openapi;
  const rawApiKey = isDocWithGet(openapiValue)
    ? openapiValue.get('apiKey', null, { getters: false })
    : openapi.apiKey;
  if (typeof rawApiKey !== 'string' || !rawApiKey) {
    return Promise.reject('Error');
  }

  return { apiKey: rawApiKey };
}

export default NextAPI(handler);
