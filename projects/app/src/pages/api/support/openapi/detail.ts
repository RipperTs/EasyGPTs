import { authOpenApiKeyCrud } from '@fastgpt/service/support/permission/auth/openapi';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';

type Query = { id: string };
type Response = { apiKey: string };

async function handler(req: ApiRequestProps<unknown, Query>): Promise<Response> {
  const { id } = req.query;

  const { openapi } = await authOpenApiKeyCrud({
    req,
    authToken: true,
    id
  });

  const rawApiKey = openapi.get('apiKey', null, { getters: false });
  if (typeof rawApiKey !== 'string' || !rawApiKey) {
    return Promise.reject('Error');
  }

  return { apiKey: rawApiKey };
}

export default NextAPI(handler);
