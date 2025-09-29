import { FlowNodeTypeEnum } from '../node/constant';
import { FlowNodeTemplateTypeEnum } from '../constants';
import { FlowNodeInputItemType, FlowNodeOutputItemType } from './io.d';
import { ChatHistoryItemResType } from '../../chat/type';
import { ParentIdType } from 'common/parentFolder/type';

export type NodeToolConfigType = {
  mcpToolSet?: {
    toolId?: string;
    url?: string;
    headers?: Record<string, string>;
    headerSecret?: Record<string, any>;
    toolList?: any[];
  };
  mcpTool?: {
    toolId?: string;
  };
  systemToolSet?: {
    toolId?: string;
    toolList?: {
      toolId?: string;
      name?: string;
      description?: string;
    }[];
  };
  systemTool?: {
    toolId?: string;
  };
  httpToolSet?: {
    toolId?: string;
    baseUrl?: string;
    toolList?: any[];
    apiSchemaStr?: string;
    customHeaders?: string;
    headerSecret?: Record<string, any>;
  };
  httpTool?: {
    toolId?: string;
  };
};

export type FlowNodeCommonType = {
  flowNodeType: FlowNodeTypeEnum; // render node card
  abandon?: boolean; // abandon node

  avatar?: string;
  name: string;
  intro?: string; // template list intro
  inputExplanationUrl?: string;
  showStatus?: boolean; // chatting response step status
  version: string;

  // data
  inputs: FlowNodeInputItemType[];
  outputs: FlowNodeOutputItemType[];
  toolConfig?: NodeToolConfigType;

  // plugin data
  pluginId?: string;
  isFolder?: boolean;
  // pluginType?: AppTypeEnum;
};

type HandleType = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};
// system template
export type FlowNodeTemplateType = FlowNodeCommonType & {
  id: string; // node id, unique
  templateType: FlowNodeTemplateTypeEnum;

  // show handle
  sourceHandle?: HandleType;
  targetHandle?: HandleType;

  // info
  isTool?: boolean; // can be connected by tool

  // action
  forbidDelete?: boolean; // forbid delete
  unique?: boolean;

  diagram?: string; // diagram url
};

export type NodeTemplateListItemType = {
  id: string; // 系统节点-系统节点的 id， 系统插件-插件的 id，团队应用的 id
  flowNodeType: FlowNodeTypeEnum; // render node card
  parentId?: ParentIdType;
  isFolder?: boolean;
  templateType: FlowNodeTemplateTypeEnum;
  avatar?: string;
  name: string;
  intro?: string; // template list intro
  isTool?: boolean;
  authorAvatar?: string;
  author?: string;
  unique?: boolean; // 唯一的
  currentCost?: number; // 当前积分消耗
  hasTokenFee?: boolean; // 是否配置积分
  instructions?: string; // 使用说明
  courseUrl?: string; // 教程链接
};

export type NodeTemplateListType = {
  type: FlowNodeTemplateTypeEnum;
  label: string;
  list: NodeTemplateListItemType[];
}[];

// react flow node type
export type FlowNodeItemType = FlowNodeTemplateType & {
  nodeId: string;
  isError?: boolean;
  debugResult?: {
    status: 'running' | 'success' | 'skipped' | 'failed';
    message?: string;
    showResult?: boolean; // show and hide result modal
    response?: ChatHistoryItemResType;
    isExpired?: boolean;
  };
};

// store node type
export type StoreNodeItemType = FlowNodeCommonType & {
  nodeId: string;
  // isEntry: boolean;
  position?: {
    x: number;
    y: number;
  };
};
