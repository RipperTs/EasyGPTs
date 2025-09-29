import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
// 使用团队写权限即可创建应用
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { type CreateAppBody, onCreateApp } from '../create';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPToolSetRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';
import { checkTeamAppLimit } from '@fastgpt/service/support/permission/teamLimit';

export type createMCPToolsQuery = {};

export type createMCPToolsBody = Omit<
  CreateAppBody,
  'type' | 'modules' | 'edges' | 'chatConfig'
> & {
  url: string;
  headers?: Record<string, string>;
  headerSecret?: Record<string, any>;
  toolList: { name: string; description: string; inputSchema: any }[];
};

export type createMCPToolsResponse = string;

async function handler(
  req: ApiRequestProps<createMCPToolsBody, createMCPToolsQuery>,
  _res: ApiResponseType<createMCPToolsResponse>
): Promise<createMCPToolsResponse> {
  const { name, avatar, toolList, url, headers = {}, headerSecret = {}, parentId } = req.body;

  const { teamId, tmbId } = parentId
    ? await authApp({ req, appId: parentId, per: WritePermissionVal, authToken: true })
    : await authUserPer({ req, authToken: true, per: WritePermissionVal });

  await checkTeamAppLimit(teamId);

  const appId = await mongoSessionRun(async (session) => {
    const id = await onCreateApp({
      name,
      avatar,
      parentId,
      teamId,
      tmbId,
      type: AppTypeEnum.toolSet,
      modules: [
        getMCPToolSetRuntimeNode({
          url,
          toolList,
          headers,
          headerSecret,
          name,
          avatar,
          toolId: ''
        }) as any
      ],
      session
    });
    return id as string;
  });

  return appId;
}

export default NextAPI(handler);
