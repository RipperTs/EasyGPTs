import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type Tool } from '@modelcontextprotocol/sdk/types';
import { getMcpServerTools } from '@/service/support/mcp/utils';

export type listToolsQuery = { key: string };
export type listToolsBody = {};

async function handler(
  req: ApiRequestProps<listToolsBody, listToolsQuery>,
  _res: ApiResponseType<Tool[]>
): Promise<Tool[]> {
  const { key } = req.query;
  return getMcpServerTools(key) as any;
}

export default NextAPI(handler);
