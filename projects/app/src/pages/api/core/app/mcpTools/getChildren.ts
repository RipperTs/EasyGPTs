import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { getMCPChildren } from '@fastgpt/service/core/app/mcp';

export type McpGetChildrenmQuery = { id: string; searchKey?: string };
export type McpGetChildrenmBody = {};
export type McpGetChildrenmResponse = {
  id: string;
  name: string;
  description: string;
  inputSchema: any;
  avatar?: string;
}[];

async function handler(
  req: ApiRequestProps<McpGetChildrenmBody, McpGetChildrenmQuery>,
  _res: ApiResponseType<any>
): Promise<McpGetChildrenmResponse> {
  const { id, searchKey } = req.query;
  const app = await MongoApp.findOne({ _id: id }).lean();
  if (!app) throw new Error('Mcp Toolset app not found');

  const list = await getMCPChildren(app as any);
  if (searchKey && searchKey.trim()) {
    const reg = new RegExp(searchKey.trim(), 'i');
    return list.filter((i) => reg.test(i.name));
  }
  return list;
}
export default NextAPI(handler);
