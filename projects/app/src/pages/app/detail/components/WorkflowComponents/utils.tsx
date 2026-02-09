import { computedNodeInputReference } from '@/web/core/workflow/utils';
import { AppDetailType } from '@fastgpt/global/core/app/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { FlowNodeItemType, StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import { TFunction } from 'i18next';
import { type Node, type Edge } from 'reactflow';
import {
  EditorVariableLabelPickerType,
  EditorVariablePickerType
} from '@fastgpt/web/components/common/Textarea/PromptEditor/type';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { TeamGlobalVariableGroupDetailType } from '@fastgpt/global/support/globalVariable/type';

export const uiWorkflow2StoreWorkflow = ({
  nodes,
  edges
}: {
  nodes: Node<FlowNodeItemType, string | undefined>[];
  edges: Edge<any>[];
}) => {
  const formatNodes: StoreNodeItemType[] = nodes.map((item) => ({
    nodeId: item.data.nodeId,
    name: item.data.name,
    intro: item.data.intro,
    avatar: item.data.avatar,
    flowNodeType: item.data.flowNodeType,
    showStatus: item.data.showStatus,
    position: item.position,
    version: item.data.version,
    inputs: item.data.inputs,
    outputs: item.data.outputs,
    pluginId: item.data.pluginId,
    toolConfig: item.data.toolConfig
  }));

  // get all handle
  const reactFlowViewport = document.querySelector('.react-flow__viewport');
  // Gets the value of data-handleid on all elements below it whose data-handleid is not empty
  const handleList =
    reactFlowViewport?.querySelectorAll('[data-handleid]:not([data-handleid=""])') || [];
  const handleIdList = Array.from(handleList).map(
    (item) => item.getAttribute('data-handleid') || ''
  );
  const formatEdges: StoreEdgeItemType[] = edges
    .map((item) => ({
      source: item.source,
      target: item.target,
      sourceHandle: item.sourceHandle || '',
      targetHandle: item.targetHandle || ''
    }))
    .filter((item) => item.sourceHandle && item.targetHandle)
    .filter(
      // Filter out edges that do not have both sourceHandle and targetHandle
      (item) => handleIdList.includes(item.sourceHandle) && handleIdList.includes(item.targetHandle)
    );

  return {
    nodes: formatNodes,
    edges: formatEdges
  };
};

export const filterExportModules = (modules: StoreNodeItemType[]) => {
  modules.forEach((module) => {
    // dataset - remove select dataset value
    if (module.flowNodeType === FlowNodeTypeEnum.datasetSearchNode) {
      module.inputs.forEach((item) => {
        if (item.key === NodeInputKeyEnum.datasetSelectList) {
          item.value = [];
        }
      });
    }
  });

  return JSON.stringify(modules, null, 2);
};

export default function Dom() {
  return <></>;
}

export const getEditorVariables = ({
  nodeId,
  nodeList,
  edges,
  appDetail,
  globalVariableOptions,
  globalVariableGroups,
  t
}: {
  nodeId: string;
  nodeList: FlowNodeItemType[];
  edges: Edge<any>[];
  appDetail: AppDetailType;
  globalVariableOptions?: EditorVariablePickerType[];
  globalVariableGroups?: TeamGlobalVariableGroupDetailType[];
  t: TFunction;
}) => {
  const currentNode = nodeList.find((node) => node.nodeId === nodeId);
  if (!currentNode) return [];

  const nodeVariables = currentNode.inputs
    .filter((input) => input.canEdit)
    .map((item, index) => ({
      key: item.key,
      label:
        item.label === 'workflow:quote_num'
          ? t('workflow:quote_num', { num: index + 1 })
          : typeof item.label === 'string' && item.label.startsWith('workflow:quote_num')
            ? t('workflow:quote_num', {
                num: Number(item.label.match(/num\\s*:\\s*(\\d+)/)?.[1] || index + 1)
              })
            : t((item.label as any) || ''),
      parent: {
        id: currentNode.nodeId,
        label: t(currentNode.name as any),
        avatar: currentNode.avatar
      }
    }));

  const sourceNodes = computedNodeInputReference({
    nodeId,
    nodes: nodeList,
    edges: edges,
    chatConfig: appDetail.chatConfig,
    globalVariableOptions,
    t
  });

  const sourceNodeVariables: EditorVariableLabelPickerType[] = !sourceNodes
    ? []
    : sourceNodes
        .map((node) => {
          const outputList = node.outputs.filter(
            (output) => !!output.label && output.id !== NodeOutputKeyEnum.addOutputParam
          );

          if (node.nodeId !== VARIABLE_NODE_ID) {
            return outputList.map((output) => ({
              label: t((output.label as any) || ''),
              key: output.id,
              parent: {
                id: node.nodeId,
                label: t(node.name as any),
                avatar: node.avatar
              }
            }));
          }

          return outputList.map((output) => {
            const matchedGroup = globalVariableGroups?.find((group) =>
              output.id.startsWith(`${group.groupKey}.`)
            );

            if (matchedGroup) {
              return {
                label: output.id.slice(`${matchedGroup.groupKey}.`.length) || output.id,
                key: output.id,
                icon: 'core/app/simpleMode/variable',
                parent: {
                  id: `${VARIABLE_NODE_ID}/${matchedGroup.groupKey}`,
                  insertId: VARIABLE_NODE_ID,
                  label: matchedGroup.name,
                  avatar: 'core/app/simpleMode/variable'
                }
              };
            }

            return {
              label: t((output.label as any) || ''),
              key: output.id,
              icon: 'core/app/simpleMode/variable',
              parent: {
                id: `${VARIABLE_NODE_ID}/__default__`,
                insertId: VARIABLE_NODE_ID,
                label: '应用与系统变量',
                avatar: 'core/app/simpleMode/variable'
              }
            };
          });
        })
        .flat();

  return [...nodeVariables, ...sourceNodeVariables];
};
