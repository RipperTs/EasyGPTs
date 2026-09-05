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
  avatar: 'core/dataset/weknora',
  name: 'WeKnoraX 知识库',
  intro:
    '使用 WeKnoraX 的完整知识搜索，按服务端配置完成检索和重排，返回可用于 AI 对话的知识库引用。',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.datasetSelectList,
      renderTypeList: [FlowNodeInputTypeEnum.selectWeKnoraDataset],
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
