import { NodeOutputKeyEnum, WorkflowIOValueTypeEnum } from '../../workflow/constants';
import { FlowNodeOutputTypeEnum, FlowNodeTypeEnum } from '../../workflow/node/constant';
import { jsonSchema2NodeInput } from '../jsonschema';
import { getNanoid } from '../../../common/string/tools';
import { PluginSourceEnum } from '../../plugin/constants';

export type McpToolConfig = {
  name: string;
  description: string;
  inputSchema: any;
};

type MCPToolSetConfig = {
  url: string;
  headers?: Record<string, string>;
  headerSecret?: Record<string, any>;
  toolList: McpToolConfig[];
  toolId?: string;
};

export const getMCPToolSetRuntimeNode = ({
  url,
  toolList,
  headers,
  headerSecret,
  toolId,
  name,
  avatar
}: {
  url: string;
  toolList: McpToolConfig[];
  headers?: Record<string, string>;
  headerSecret?: Record<string, any>;
  toolId?: string;
  name?: string;
  avatar?: string;
}) => {
  const toolSetConfig: MCPToolSetConfig = {
    url,
    headers,
    headerSecret,
    toolList,
    toolId
  };

  return {
    nodeId: getNanoid(16),
    flowNodeType: FlowNodeTypeEnum.toolSet,
    avatar,
    intro: 'MCP Tools',
    toolConfig: {
      mcpToolSet: toolSetConfig
    },
    inputs: [
      {
        key: 'mcpToolSetConfig',
        label: 'mcpToolSetConfig',
        renderTypeList: [],
        valueType: WorkflowIOValueTypeEnum.object,
        value: toolSetConfig,
        canEdit: false
      }
    ],
    outputs: [],
    name: name || '',
    version: ''
  };
};

export const getMCPToolRuntimeNode = ({
  tool,
  url,
  headers,
  headerSecret,
  avatar,
  parentId
}: {
  tool: McpToolConfig;
  url: string;
  headers?: Record<string, string>;
  headerSecret?: Record<string, any>;
  avatar?: string;
  parentId: string;
}) => {
  const mcpConfig = { url, headers, headerSecret, toolName: tool.name };
  return {
    nodeId: getNanoid(),
    flowNodeType: FlowNodeTypeEnum.tool,
    avatar,
    intro: tool.description,
    toolConfig: {
      mcpTool: {
        toolId: `${PluginSourceEnum.mcp}-${parentId}/${tool.name}`
      }
    },
    inputs: [
      ...jsonSchema2NodeInput(tool.inputSchema),
      {
        key: 'mcpConfig',
        label: 'mcpConfig',
        renderTypeList: [],
        valueType: WorkflowIOValueTypeEnum.object,
        value: mcpConfig,
        canEdit: false
      }
    ],
    outputs: [
      {
        id: NodeOutputKeyEnum.rawResponse,
        key: NodeOutputKeyEnum.rawResponse,
        required: true,
        label: 'raw_response',
        valueType: WorkflowIOValueTypeEnum.any,
        type: FlowNodeOutputTypeEnum.static
      }
    ],
    name: tool.name,
    version: ''
  };
};
