import React, { useCallback, useMemo } from 'react';
import type { RenderInputProps } from '../type';
import { Flex, Box, ButtonProps } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { computedNodeInputReference } from '@/web/core/workflow/utils';
import { useTranslation } from 'next-i18next';
import {
  NodeOutputKeyEnum,
  VARIABLE_NODE_ID,
  WorkflowIOValueTypeEnum
} from '@fastgpt/global/core/workflow/constants';
import type { ReferenceValueProps } from '@fastgpt/global/core/workflow/type/io';
import dynamic from 'next/dynamic';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AppContext } from '@/pages/app/detail/components/context';

const MultipleRowSelect = dynamic(
  () => import('@fastgpt/web/components/common/MySelect/MultipleRowSelect')
);
const Avatar = dynamic(() => import('@fastgpt/web/components/common/Avatar'));

type SelectProps = {
  value?: string[];
  placeholder?: string;
  list: SelectItemType[];
  onSelect: (val: ReferenceValueProps) => void;
  styles?: ButtonProps;
};
type SelectItemType = {
  label: string | React.ReactNode;
  value: string;
  children?: SelectItemType[];
};
const GLOBAL_VARIABLE_DEFAULT_GROUP = '__default__';

const Reference = ({ item, nodeId }: RenderInputProps) => {
  const { t } = useTranslation();
  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);

  const onSelect = useCallback(
    (e: ReferenceValueProps) => {
      const workflowStartNode = nodeList.find(
        (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
      );
      if (e[0] === workflowStartNode?.id && e[1] !== NodeOutputKeyEnum.userChatInput) {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: [VARIABLE_NODE_ID, e[1]]
          }
        });
      } else {
        onChangeNode({
          nodeId,
          type: 'updateInput',
          key: item.key,
          value: {
            ...item,
            value: e
          }
        });
      }
    },
    [item, nodeId, nodeList, onChangeNode]
  );

  const { referenceList, formatValue } = useReference({
    nodeId,
    valueType: item.valueType,
    value: item.value
  });

  return (
    <ReferSelector
      placeholder={t((item.referencePlaceholder as any) || 'select_reference_variable')}
      list={referenceList}
      value={formatValue}
      onSelect={onSelect}
    />
  );
};

export default React.memo(Reference);

export const useReference = ({
  nodeId,
  valueType = WorkflowIOValueTypeEnum.any,
  value
}: {
  nodeId: string;
  valueType?: WorkflowIOValueTypeEnum;
  value?: any;
}) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const nodeList = useContextSelector(WorkflowContext, (v) => v.nodeList);
  const edges = useContextSelector(WorkflowContext, (v) => v.edges);
  const globalVariableOptions = useContextSelector(WorkflowContext, (v) => v.globalVariableOptions);
  const globalVariableGroups = useContextSelector(WorkflowContext, (v) => v.globalVariableGroups);

  const referenceList = useMemo(() => {
    const sourceNodes = computedNodeInputReference({
      nodeId,
      nodes: nodeList,
      edges: edges,
      chatConfig: appDetail.chatConfig,
      globalVariableOptions,
      t
    });

    if (!sourceNodes) return [];

    // 转换为 select 的数据结构
    const list: SelectProps['list'] = sourceNodes
      .map((node) => {
        const outputList = node.outputs
          .filter(
            (output) =>
              valueType === WorkflowIOValueTypeEnum.any ||
              output.valueType === WorkflowIOValueTypeEnum.any ||
              output.valueType === valueType
          )
          .filter((output) => output.id !== NodeOutputKeyEnum.addOutputParam);

        if (node.nodeId === VARIABLE_NODE_ID) {
          const groupedItems = globalVariableGroups
            .map<SelectItemType | null>((group) => {
              const prefix = `${group.groupKey}.`;
              const groupOutputList = outputList.filter((output) => output.id.startsWith(prefix));
              if (groupOutputList.length === 0) return null;

              return {
                label: group.name,
                value: group.groupKey,
                children: groupOutputList.map((output) => ({
                  label: output.id.slice(prefix.length) || output.id,
                  value: output.id
                }))
              };
            })
            .filter((item): item is SelectItemType => !!item);

          const defaultOutputList = outputList.filter(
            (output) =>
              !globalVariableGroups.some((group) => output.id.startsWith(`${group.groupKey}.`))
          );
          const defaultGroupItem: SelectItemType[] =
            defaultOutputList.length > 0
              ? [
                  {
                    label: '应用与系统变量',
                    value: GLOBAL_VARIABLE_DEFAULT_GROUP,
                    children: defaultOutputList.map((output) => ({
                      label: t((output.label as any) || ''),
                      value: output.id
                    }))
                  }
                ]
              : [];

          return {
            label: (
              <Flex alignItems={'center'}>
                <Avatar src={node.avatar} w={'1.25rem'} borderRadius={'xs'} />
                <Box ml={1}>{t(node.name as any)}</Box>
              </Flex>
            ),
            value: node.nodeId,
            children: [...defaultGroupItem, ...groupedItems]
          };
        }

        return {
          label: (
            <Flex alignItems={'center'}>
              <Avatar src={node.avatar} w={'1.25rem'} borderRadius={'xs'} />
              <Box ml={1}>{t(node.name as any)}</Box>
            </Flex>
          ),
          value: node.nodeId,
          children: outputList.map((output) => ({
            label: t((output.label as any) || ''),
            value: output.id
          }))
        };
      })
      .filter((item) => (item.children?.length || 0) > 0);

    return list;
  }, [
    appDetail.chatConfig,
    edges,
    globalVariableGroups,
    globalVariableOptions,
    nodeId,
    nodeList,
    t,
    valueType
  ]);

  const formatValue = useMemo(() => {
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
    ) {
      if (value[0] === VARIABLE_NODE_ID) {
        const selectedGroup = globalVariableGroups.find((group) =>
          value[1].startsWith(`${group.groupKey}.`)
        );

        if (selectedGroup) {
          return [VARIABLE_NODE_ID, selectedGroup.groupKey, value[1]];
        }

        const variableNode = referenceList.find((item) => item.value === VARIABLE_NODE_ID);
        const defaultGroup = variableNode?.children?.find(
          (item) => item.value === GLOBAL_VARIABLE_DEFAULT_GROUP
        );
        if (defaultGroup?.children?.some((item) => item.value === value[1])) {
          return [VARIABLE_NODE_ID, GLOBAL_VARIABLE_DEFAULT_GROUP, value[1]];
        }
      }

      return value as string[];
    }
    return undefined;
  }, [globalVariableGroups, referenceList, value]);

  return {
    referenceList,
    formatValue
  };
};
export const ReferSelector = ({ placeholder, value, list = [], onSelect }: SelectProps) => {
  const selectItemLabel = useMemo(() => {
    if (!value || value.length === 0) {
      return;
    }

    let currentList = list;
    const labelList: (string | React.ReactNode)[] = [];

    for (const selected of value) {
      if (!selected) break;

      const selectedItem = currentList.find((item) => item.value === selected);
      if (!selectedItem) {
        break;
      }

      labelList.push(selectedItem.label);
      currentList = selectedItem.children || [];
    }

    if (labelList.length === 0) {
      return undefined;
    }

    return labelList;
  }, [list, value]);

  const Render = useMemo(() => {
    return (
      <MultipleRowSelect
        label={
          selectItemLabel ? (
            <Flex alignItems={'center'}>
              {selectItemLabel.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <MyIcon name={'common/rightArrowLight'} mx={1} w={'14px'}></MyIcon>}
                  {item}
                </React.Fragment>
              ))}
            </Flex>
          ) : (
            <Box>{placeholder}</Box>
          )
        }
        value={value as any[]}
        list={list}
        onSelect={(e) => {
          if (!Array.isArray(e) || e.length < 2) return;
          const nodeId = e[0];
          const outputId = e[e.length - 1];
          if (typeof nodeId !== 'string' || typeof outputId !== 'string') return;

          onSelect([nodeId, outputId]);
        }}
      />
    );
  }, [list, onSelect, placeholder, selectItemLabel, value]);

  return Render;
};
