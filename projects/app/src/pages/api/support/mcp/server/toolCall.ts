import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { callMcpServerTool } from '@/service/support/mcp/utils';

export type ToolCallQuery = {};
export type ToolCallBody = { key: string; toolName: string; inputs: Record<string, any> };
export type ToolCallResponse = any;

async function handler(
  req: ApiRequestProps<ToolCallBody, ToolCallQuery>,
  _res: ApiResponseType<ToolCallResponse>
): Promise<ToolCallResponse> {
  const { key, toolName, inputs } = req.body;
  return callMcpServerTool({ key, toolName, inputs });
}

export default NextAPI(handler);
