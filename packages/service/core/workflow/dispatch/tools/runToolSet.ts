import { getErrText } from '@fastgpt/global/common/error/utils';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { MCPClient } from '../../../app/mcp';
import { formatToolResponse } from '../agent/runTool/utils';
import { splitCombinePluginId } from '@fastgpt/global/core/app/plugin/utils';
import { MongoApp } from '../../../app/schema';
import { getNodeErrResponse } from '../utils';

type RunToolSetProps = ModuleDispatchProps<{
  [key: string]: any;
}>;

export const dispatchRunToolSet = async (props: RunToolSetProps) => {
  const {
    params,
    node: { avatar, toolConfig }
  } = props;

  try {
    // Get toolSet configuration
    if (toolConfig?.mcpTool?.toolId) {
      const { pluginId } = splitCombinePluginId(toolConfig.mcpTool.toolId);
      const [parentId, toolName] = pluginId.split('/');

      // Get the toolSet app from database
      const toolSetApp = await MongoApp.findById(parentId).lean();

      if (!toolSetApp) {
        throw new Error('ToolSet app not found');
      }

      // Get MCP configuration from the toolSet app
      const mcpConfig = toolSetApp.modules?.[0]?.inputs?.find(
        (i: any) => i.key === 'mcpToolSetConfig'
      )?.value;

      if (!mcpConfig?.url) {
        throw new Error('MCP toolSet configuration not found');
      }

      const mcpClient = new MCPClient({
        url: mcpConfig.url,
        headers: mcpConfig.headers || {}
      });

      // strip internal MCP config from tool arguments
      const { mcpConfig: _omit1, mcpToolSetConfig: _omit2, ...toolArgs } = params || {};
      const result = await mcpClient.toolCall(toolName, toolArgs);
      const textOutput = formatToolResponse(result);

      return {
        data: { [NodeOutputKeyEnum.rawResponse]: result },
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          moduleLogo: avatar,
          textOutput
        },
        [DispatchNodeResponseKeyEnum.toolResponses]: result,
        textOutput
      };
    }

    throw new Error('No valid toolSet configuration found');
  } catch (error) {
    return getNodeErrResponse({
      error,
      customNodeResponse: {
        moduleLogo: avatar
      }
    });
  }
};
