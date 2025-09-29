import { StoreNodeItemType } from '../../workflow/type/node';
import { FlowNodeInputItemType } from '../../workflow/type/io';
import { FlowNodeTypeEnum } from '../../workflow/node/constant';
import { PluginSourceEnum } from '../../plugin/constants';

export const getPluginInputsFromStoreNodes = (nodes: StoreNodeItemType[]) => {
  return nodes.find((node) => node.flowNodeType === FlowNodeTypeEnum.pluginInput)?.inputs || [];
};
export const getPluginRunContent = ({
  pluginInputs,
  variables
}: {
  pluginInputs: FlowNodeInputItemType[];
  variables: Record<string, any>;
}) => {
  const pluginInputsWithValue = pluginInputs.map((input) => {
    const { key } = input;
    const value = variables?.hasOwnProperty(key) ? variables[key] : input.defaultValue;
    return {
      ...input,
      value
    };
  });
  return JSON.stringify(pluginInputsWithValue);
};

/**
 * plugin id rule:
 * - personal: ObjectId
 * - commercial: commercial-ObjectId
 * - system tool: systemTool-id
 * - http tool: http-parentId/toolName
 * - mcp tool:  mcp-parentId/toolName
 * (兼容旧版 community/commercial 特殊值)
 */
export const splitCombinePluginId = (id: string) => {
  const splitRes = id.split('-');
  if (splitRes.length === 1) {
    return {
      source: PluginSourceEnum.personal,
      pluginId: id
    };
  }

  const [source, ...rest] = id.split('-') as [PluginSourceEnum, string | undefined];
  const pluginId = rest.join('-');
  if (!source || !pluginId) {
    throw new Error('pluginId not found');
  }

  const sourceStr = source as unknown as string;

  if (sourceStr === 'community' || id === 'commercial-dalle3') {
    return {
      source: PluginSourceEnum.systemTool,
      pluginId: `${PluginSourceEnum.systemTool}-${pluginId}`
    };
  }

  if (source === PluginSourceEnum.mcp) {
    return {
      source: PluginSourceEnum.mcp,
      pluginId
    };
  }

  if (source === PluginSourceEnum.http) {
    return {
      source: PluginSourceEnum.http,
      pluginId
    };
  }

  return {
    source,
    pluginId: id
  };
};
