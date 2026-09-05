import {
  datasetQuoteValueDesc,
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import type { FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../constants';
import { getDefaultWeKnoraSearchSettings } from '../../../../dataset/weknora';
import { getHandleConfig } from '../../utils';
import { Input_Template_UserChatInput } from '../../input';

const defaults = getDefaultWeKnoraSearchSettings();

export const WeKnoraSearchModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.weknoraSearch,
  flowNodeType: FlowNodeTypeEnum.weknoraSearch,
  templateType: FlowNodeTemplateTypeEnum.ai,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/dataset/externalDataset',
  name: 'WeKnoraX知识库',
  intro: '配置 WeKnora 服务并检索知识库，输出可用于 AI 对话和知识库搜索合并的引用。',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectWeKnoraDataset, FlowNodeInputTypeEnum.reference],
      label: '外部知识库',
      valueType: WorkflowIOValueTypeEnum.selectDataset,
      value: [],
      required: true
    },
    ...Object.entries(defaults)
      .filter(([key]) => key !== NodeInputKeyEnum.datasetSelectList)
      .map(([key, value]) => ({
        key,
        renderTypeList: [FlowNodeInputTypeEnum.hidden],
        label: '',
        value,
        required: key === NodeInputKeyEnum.weknoraConnectionId,
        valueType: Array.isArray(value)
          ? WorkflowIOValueTypeEnum.arrayString
          : typeof value === 'number'
            ? WorkflowIOValueTypeEnum.number
            : typeof value === 'boolean'
              ? WorkflowIOValueTypeEnum.boolean
              : WorkflowIOValueTypeEnum.string
      })),
    {
      ...Input_Template_UserChatInput,
      label: '用户问题',
      toolDescription: 'The question to search for in the configured WeKnora knowledge bases.'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.datasetQuoteQA,
      key: NodeOutputKeyEnum.datasetQuoteQA,
      label: '知识库引用',
      type: FlowNodeOutputTypeEnum.static,
      valueType: WorkflowIOValueTypeEnum.datasetQuote,
      valueDesc: datasetQuoteValueDesc
    }
  ]
};
