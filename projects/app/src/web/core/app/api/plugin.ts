import { DELETE, GET, POST } from '@/web/common/api/request';
import type { createHttpPluginBody } from '@/pages/api/core/app/httpPlugin/create';
import type { UpdateHttpPluginBody } from '@/pages/api/core/app/httpPlugin/update';
import type {
  FlowNodeTemplateType,
  NodeTemplateListItemType
} from '@fastgpt/global/core/workflow/type/node';
import { getMyApps } from '../api';
import type { ListAppBody } from '@/pages/api/core/app/list';
import { defaultNodeVersion, FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import type { GetPreviewNodeQuery } from '@/pages/api/core/app/plugin/getPreviewNode';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ParentIdType, ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { GetSystemPluginTemplatesBody } from '@/pages/api/core/app/plugin/getSystemPluginTemplates';
import { PluginGroupSchemaType } from '@fastgpt/service/core/app/plugin/type';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { defaultGroup } from '@fastgpt/web/core/workflow/constants';

import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';

/* ============ team plugin ============== */
export const getTeamPlugTemplates = async (data?: ListAppBody) => {
  // 如果提供了parentId，检查parent是否是toolSet
  if (data?.parentId) {
    const apps = await getMyApps({});
    const parentApp = apps.find((app) => app._id === data.parentId);

    if (parentApp?.type === AppTypeEnum.toolSet) {
      // 使用 getMCPToolsChildren API 获取工具列表
      const children = await getMCPToolsChildren({
        id: data.parentId,
        searchKey: data.searchKey
      });

      return children.map((item) => ({
        id: item.id,
        pluginId: item.id,
        avatar: item.avatar,
        name: item.name,
        intro: item.description || '',
        flowNodeType: FlowNodeTypeEnum.tool,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        isTool: true,
        // Add version info for proper tool config
        version: '481'
      }));
    }

    // If parent is not toolSet, return apps under this parent
    return getMyApps(data).then((res) =>
      res.map((app) => ({
        tmbId: app.tmbId,
        id: app._id,
        pluginId: app._id,
        isFolder:
          app.type === AppTypeEnum.folder ||
          app.type === AppTypeEnum.httpPlugin ||
          app.type === AppTypeEnum.toolSet,
        templateType: FlowNodeTemplateTypeEnum.teamApp,
        flowNodeType:
          app.type === AppTypeEnum.workflow
            ? FlowNodeTypeEnum.appModule
            : app.type === AppTypeEnum.toolSet
              ? FlowNodeTypeEnum.toolSet
              : FlowNodeTypeEnum.pluginModule,
        avatar: app.avatar,
        name: app.name,
        intro: app.intro,
        showStatus: false,
        version: app.pluginData?.nodeVersion || defaultNodeVersion,
        isTool: true
      }))
    );
  }

  // 获取根目录的应用列表
  return getMyApps(data).then((res) =>
    res.map((app) => ({
      tmbId: app.tmbId,
      id: app._id,
      pluginId: app._id,
      isFolder:
        app.type === AppTypeEnum.folder ||
        app.type === AppTypeEnum.httpPlugin ||
        app.type === AppTypeEnum.toolSet,
      templateType: FlowNodeTemplateTypeEnum.teamApp,
      flowNodeType:
        app.type === AppTypeEnum.workflow
          ? FlowNodeTypeEnum.appModule
          : app.type === AppTypeEnum.toolSet
            ? FlowNodeTypeEnum.toolSet
            : FlowNodeTypeEnum.pluginModule,
      avatar: app.avatar,
      name: app.name,
      intro: app.intro,
      showStatus: false,
      version: app.pluginData?.nodeVersion || defaultNodeVersion,
      isTool: true
    }))
  );
};

/* ============ system plugin ============== */
export const getSystemPlugTemplates = (data: GetSystemPluginTemplatesBody) =>
  POST<NodeTemplateListItemType[]>('/core/app/plugin/getSystemPluginTemplates', data);

export const getPluginGroups = () => {
  return useSystemStore.getState()?.feConfigs?.isPlus
    ? GET<PluginGroupSchemaType[]>('/proApi/core/app/plugin/getPluginGroups')
    : Promise.resolve([defaultGroup]);
};

export const getSystemPluginPaths = (parentId: ParentIdType) => {
  if (!parentId) return Promise.resolve<ParentTreePathItemType[]>([]);
  return GET<ParentTreePathItemType[]>('/core/app/plugin/path', { parentId });
};

export const getPreviewPluginNode = (data: GetPreviewNodeQuery) =>
  GET<FlowNodeTemplateType>('/core/app/plugin/getPreviewNode', data);

/* ============ http plugin ============== */
export const postCreateHttpPlugin = (data: createHttpPluginBody) =>
  POST('/core/app/httpPlugin/create', data);

export const putUpdateHttpPlugin = (body: UpdateHttpPluginBody) =>
  POST('/core/app/httpPlugin/update', body);

export const getApiSchemaByUrl = (url: string) =>
  POST<Object>(
    '/core/app/httpPlugin/getApiSchemaByUrl',
    { url },
    {
      timeout: 30000
    }
  );

/* ============ MCP tools (inbound) ============== */
export const getMCPToolsChildren = (data: { id: string; searchKey?: string }) =>
  GET<{ id: string; name: string; description: string; inputSchema: any; avatar?: string }[]>(
    '/core/app/mcpTools/getChildren',
    data
  );

export const getMCPTools = (data: { url: string; headers?: Record<string, string> }) =>
  POST<{ name: string; description: string; inputSchema: any }[]>(
    '/support/mcp/client/getTools',
    data
  );

export const postCreateMCPTools = (data: {
  parentId?: string;
  name: string;
  avatar?: string;
  url: string;
  headers?: Record<string, string>;
  toolList: { name: string; description: string; inputSchema: any }[];
}) => POST<string>('/core/app/mcpTools/create', data);

export const postUpdateMCPTools = (data: {
  appId: string;
  url: string;
  headers?: Record<string, string>;
  toolList: { name: string; description: string; inputSchema: any }[];
}) => POST('/core/app/mcpTools/update', data);

export const postRunMCPTool = (data: {
  url: string;
  toolName: string;
  headers?: Record<string, string>;
  params: Record<string, any>;
}) => POST<any>('/support/mcp/client/runTool', data);
