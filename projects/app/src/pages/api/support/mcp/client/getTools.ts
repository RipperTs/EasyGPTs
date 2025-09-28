import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { MCPClient } from '@fastgpt/service/core/app/mcp';

export type getMCPToolsQuery = {};
export type getMCPToolsBody = { url: string; headers?: Record<string, string> };
export type getMCPToolsResponse = { name: string; description: string; inputSchema: any }[];

async function handler(
  req: ApiRequestProps<getMCPToolsBody, getMCPToolsQuery>,
  _res: ApiResponseType<getMCPToolsResponse[]>
): Promise<getMCPToolsResponse> {
  const { url, headers = {} } = req.body;
  const mcpClient = new MCPClient({ url, headers });
  return mcpClient.getTools() as any;
}

export default NextAPI(handler);
