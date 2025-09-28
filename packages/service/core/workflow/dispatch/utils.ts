import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type.d';
import {
  WorkflowIOValueTypeEnum,
  NodeOutputKeyEnum
} from '@fastgpt/global/core/workflow/constants';
import {
  RuntimeEdgeItemType,
  SystemVariablesType
} from '@fastgpt/global/core/workflow/runtime/type';
import { responseWrite } from '../../../common/response';
import { NextApiResponse } from 'next';
import {
  SseResponseEventEnum,
  DispatchNodeResponseKeyEnum
} from '@fastgpt/global/core/workflow/runtime/constants';
import { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

export const getWorkflowResponseWrite = ({
  res,
  detail,
  streamResponse,
  id
}: {
  res?: NextApiResponse;
  detail: boolean;
  streamResponse: boolean;
  id: string;
}) => {
  return ({
    write,
    event,
    data,
    stream
  }: {
    write?: (text: string) => void;
    event: SseResponseEventEnum;
    data: Record<string, any>;
    stream?: boolean; // Focus set stream response
  }) => {
    const useStreamResponse = stream ?? streamResponse;

    if (!res || res.closed || !useStreamResponse) return;

    const detailEvent = [
      SseResponseEventEnum.error,
      SseResponseEventEnum.flowNodeStatus,
      SseResponseEventEnum.flowResponses,
      SseResponseEventEnum.interactive,
      SseResponseEventEnum.toolCall,
      SseResponseEventEnum.toolParams,
      SseResponseEventEnum.toolResponse,
      SseResponseEventEnum.updateVariables
    ];
    if (!detail && detailEvent.includes(event)) return;

    responseWrite({
      res,
      write,
      event: detail ? event : undefined,
      data: JSON.stringify(data)
    });
  };
};

export const filterToolNodeIdByEdges = ({
  nodeId,
  edges
}: {
  nodeId: string;
  edges: RuntimeEdgeItemType[];
}) => {
  return edges
    .filter(
      (edge) => edge.source === nodeId && edge.targetHandle === NodeOutputKeyEnum.selectedTools
    )
    .map((edge) => edge.target);
};

// export const checkTheModuleConnectedByTool = (
//   modules: StoreNodeItemType[],
//   node: StoreNodeItemType
// ) => {
//   let sign = false;
//   const toolModules = modules.filter((item) => item.flowNodeType === FlowNodeTypeEnum.tools);

//   toolModules.forEach((item) => {
//     const toolOutput = item.outputs.find(
//       (output) => output.key === NodeOutputKeyEnum.selectedTools
//     );
//     toolOutput?.targets.forEach((target) => {
//       if (target.moduleId === node.moduleId) {
//         sign = true;
//       }
//     });
//   });

//   return sign;
// };

export const getHistories = (history?: ChatItemType[] | number, histories: ChatItemType[] = []) => {
  if (!history) return [];

  const systemHistories = histories.filter((item) => item.obj === ChatRoleEnum.System);

  const filterHistories = (() => {
    if (typeof history === 'number') return histories.slice(-(history * 2));
    if (Array.isArray(history)) return history;
    return [];
  })();

  return [...systemHistories, ...filterHistories];
};

/* value type format */
export const valueTypeFormat = (value: any, type?: WorkflowIOValueTypeEnum) => {
  if (value === undefined) return;
  if (!type) return value;

  if (type === 'string') {
    if (typeof value !== 'object') return String(value);
    return JSON.stringify(value);
  }
  if (type === 'number') return Number(value);
  if (type === 'boolean') {
    if (typeof value === 'string') return value === 'true';
    return Boolean(value);
  }
  try {
    if (type === WorkflowIOValueTypeEnum.datasetQuote && !Array.isArray(value)) {
      return JSON.parse(value);
    }
    if (type === WorkflowIOValueTypeEnum.selectDataset && !Array.isArray(value)) {
      return JSON.parse(value);
    }
  } catch (error) {
    return value;
  }

  return value;
};

export const checkQuoteQAValue = (quoteQA?: SearchDataResponseItemType[]) => {
  if (!quoteQA) return undefined;
  if (quoteQA.length === 0) {
    return [];
  }
  if (quoteQA.some((item) => !item.q)) {
    return undefined;
  }
  return quoteQA;
};

// 扩展：在运行期将 toolSet 节点展开为多个 tool 节点
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { getMCPToolRuntimeNode } from '@fastgpt/global/core/app/mcpTools/utils';

export const rewriteRuntimeWorkFlow = async ({
  nodes,
  edges
}: {
  nodes: RuntimeNodeItemType[];
  edges: RuntimeEdgeItemType[];
}) => {
  const toolSetNodes = nodes.filter((n) => n.flowNodeType === FlowNodeTypeEnum.toolSet);
  if (toolSetNodes.length === 0) return;

  const removeIds = new Set<string>();
  for (const tsNode of toolSetNodes) {
    removeIds.add(tsNode.nodeId);
    const conf = tsNode.inputs?.find((i) => i.key === 'mcpToolSetConfig')?.value || {};
    const {
      url,
      headers,
      toolList = []
    } = conf as {
      url: string;
      headers?: Record<string, string>;
      toolList: { name: string; description: string; inputSchema: any }[];
    };

    const incoming = edges.filter((e) => e.target === tsNode.nodeId);
    const pushEdges = (nodeId: string) => {
      incoming.forEach((e) => {
        edges.push({
          source: e.source,
          target: nodeId,
          sourceHandle: e.sourceHandle,
          targetHandle: 'selectedTools',
          status: e.status
        });
      });
    };

    toolList.forEach((tool, idx) => {
      const newNode = getMCPToolRuntimeNode({ tool, url, headers, avatar: tsNode.avatar }) as any;
      // 确保稳定 nodeId，便于下次展开能对齐
      newNode.nodeId = `${tsNode.nodeId}-${idx}`;
      nodes.push(newNode);
      pushEdges(newNode.nodeId);
    });
  }

  // 删除 toolSet 节点及连接到它的边
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (removeIds.has(nodes[i].nodeId)) nodes.splice(i, 1);
  }
  for (let i = edges.length - 1; i >= 0; i--) {
    if (removeIds.has(edges[i].target)) edges.splice(i, 1);
  }
};

/* remove system variable */
export const removeSystemVariable = (variables: Record<string, any>) => {
  const copyVariables = { ...variables };
  delete copyVariables.appId;
  delete copyVariables.chatId;
  delete copyVariables.responseChatItemId;
  delete copyVariables.histories;
  delete copyVariables.cTime;

  return copyVariables;
};
export const filterSystemVariables = (variables: Record<string, any>): SystemVariablesType => {
  return {
    userId: variables.userId,
    appId: variables.appId,
    chatId: variables.chatId,
    responseChatItemId: variables.responseChatItemId,
    histories: variables.histories,
    cTime: variables.cTime
  };
};

export const formatHttpError = (error: any) => {
  return {
    message: getErrText(error),
    data: error?.response?.data,
    name: error?.name,
    method: error?.config?.method,
    code: error?.code,
    status: error?.status
  };
};

// Align with upstream: standardize node error response structure
export const getNodeErrResponse = ({
  error,
  customErr,
  customNodeResponse
}: {
  error: any;
  customErr?: Record<string, any>;
  customNodeResponse?: Record<string, any>;
}) => {
  const errorText = getErrText(error);

  return {
    [NodeOutputKeyEnum.error]: {
      message: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    },
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText,
      ...(typeof customNodeResponse === 'object' ? customNodeResponse : {})
    },
    [DispatchNodeResponseKeyEnum.toolResponses]: {
      error: errorText,
      ...(typeof customErr === 'object' ? customErr : {})
    }
  };
};
