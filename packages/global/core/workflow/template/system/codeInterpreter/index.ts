import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import type { FlowNodeTemplateType } from '../../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import { Input_Template_SelectAIModel, Input_Template_UserChatInput } from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { getHandleConfig } from '../../utils';

export const CodeInterpreterModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.codeInterpreter,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.codeInterpreter,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/codeInter',
  name: '代码解释器',
  intro:
    '能够依据用户的自然语言需求，生成并运行 Python 代码，以解决数据分析、编程和数学等领域的复杂问题。',
  showStatus: true,
  isTool: true,
  version: '492',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      key: NodeInputKeyEnum.codeInterpreterMaxRetry,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '自动修复重试次数',
      description: '代码运行失败时，AI 会分析报错并修复代码后重试。',
      required: true,
      min: 1,
      max: 10,
      value: 5
    },
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: '文档链接',
      description: '需要在代码中操作的文件，服务会自动下载到执行环境中。',
      required: false,
      value: []
    },
    {
      ...Input_Template_UserChatInput,
      label: '任务描述',
      toolDescription: '用自然语言描述你希望通过 Python 代码完成的任务。'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.result,
      key: NodeOutputKeyEnum.result,
      label: 'result',
      description: '统一输出：优先返回服务 result；若为空则返回 image_url；若仍为空则返回 files。',
      valueType: WorkflowIOValueTypeEnum.any,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '执行失败时返回错误信息；成功时为空字符串。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.execution_time,
      key: NodeOutputKeyEnum.execution_time,
      label: '执行耗时（秒）',
      valueType: WorkflowIOValueTypeEnum.number,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.image_url,
      key: NodeOutputKeyEnum.image_url,
      label: '图片地址',
      description: '代码执行最后产生图片的输出结果；没有则为空字符串。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.files,
      key: NodeOutputKeyEnum.files,
      label: '文件地址',
      description: '代码执行最后产生的文件地址',
      valueType: WorkflowIOValueTypeEnum.arrayString,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.inputs,
      key: NodeOutputKeyEnum.inputs,
      label: '输入文件',
      description: '输入的文件',
      valueType: WorkflowIOValueTypeEnum.arrayString,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
