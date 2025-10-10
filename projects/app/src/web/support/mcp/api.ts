import type { updateBody } from '@/pages/api/support/mcp/update';
import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { createBody } from '@/pages/api/support/mcp/create';
import type { listResponse } from '@/pages/api/support/mcp/list';

export const getMcpServerList = () => GET<listResponse>('/support/mcp/list');

export const postCreateMcpServer = (data: createBody) => POST('/support/mcp/create', data);

export const putUpdateMcpServer = (data: updateBody) => PUT('/support/mcp/update', data);

export const deleteMcpServer = (id: string) => DELETE(`/support/mcp/delete`, { id });
