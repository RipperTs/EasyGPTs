import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum, NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  ModuleDispatchProps,
  DispatchNodeResultType
} from '@fastgpt/global/core/workflow/runtime/type';
import { MCPClient } from '../../../app/mcp';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { MongoApp } from '../../../app/schema';
import { getNodeErrResponse } from '../utils';

type RunToolProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

type RunToolResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.rawResponse]?: any;
  [key: string]: any;
}>;

export const dispatchRunTool = async (props: RunToolProps): Promise<RunToolResponse> => {
  const {
    params,
    node: { name, avatar, toolConfig, version, catchError, inputs }
  } = props;

  try {
    // Preferred: Use explicit mcpConfig from node inputs (persisted with node)
    const mcpInput = (inputs || []).find((i: any) => i.key === 'mcpConfig')?.value as
      | {
          url?: string;
          headers?: Record<string, string>;
          toolName?: string;
        }
      | undefined;
    if (mcpInput?.url && mcpInput?.toolName) {
      const mcpClient = new MCPClient({ url: mcpInput.url, headers: mcpInput.headers || {} });
      const result = await mcpClient.toolCall(mcpInput.toolName, params);

      return {
        data: { [NodeOutputKeyEnum.rawResponse]: result },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    }

    // Handle MCP tool
    if (toolConfig?.mcpTool?.toolId) {
      const { pluginId } = splitCombinePluginId(toolConfig.mcpTool.toolId);
      const [parentId, toolName] = pluginId.split('/');

      const toolSetApp = await MongoApp.findById(parentId).lean();
      if (!toolSetApp) {
        throw new Error('ToolSet app not found');
      }

      const mcpConfig =
        toolSetApp.modules?.[0]?.toolConfig?.mcpToolSet ||
        toolSetApp.modules?.[0]?.inputs?.find((i: any) => i.key === 'mcpToolSetConfig')?.value;

      if (!mcpConfig?.url) {
        throw new Error('MCP configuration not found');
      }

      const headers = (mcpConfig.headers as Record<string, string>) || {};

      const mcpClient = new MCPClient({
        url: mcpConfig.url,
        headers
      });

      const result = await mcpClient.toolCall(toolName, params);

      return {
        data: { [NodeOutputKeyEnum.rawResponse]: result },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          toolRes: result,
          moduleLogo: avatar
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result
      };
    }

    throw new Error('No valid tool configuration found');
  } catch (error) {
    return getNodeErrResponse({
      error,
      customNodeResponse: {
        moduleLogo: avatar
      }
    });
  }
};
