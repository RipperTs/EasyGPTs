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
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.codeInterpreter,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/codeRun',
  name: '代码解释器（Python）',
  intro: '根据自然语言任务自动生成并执行 Python 代码，失败会基于报错自动修复并重试。',
  showStatus: true,
  isTool: true,
  version: '482',
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
      description: '代码运行失败时，AI 会分析报错并修复代码后重试；默认 3 次。',
      required: true,
      min: 1,
      max: 10,
      value: 3
    },
    {
      key: NodeInputKeyEnum.codeInterpreterTimeout,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '代码运行超时时间（秒）',
      description: '单次代码执行的最大等待时间，超时将终止运行；默认 120 秒。',
      required: true,
      min: 1,
      max: 600,
      value: 120
    },
    {
      ...Input_Template_UserChatInput,
      label: '任务描述',
      toolDescription: '用自然语言描述你希望通过 Python 代码完成的任务。'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.success,
      key: NodeOutputKeyEnum.success,
      label: '是否执行成功',
      valueType: WorkflowIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: 'generatedCode',
      key: 'generatedCode',
      label: '最终执行代码',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: 'executionLog',
      key: 'executionLog',
      label: '运行日志',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.rawResponse,
      key: NodeOutputKeyEnum.rawResponse,
      label: '完整结果',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '执行失败时返回错误信息；成功时为空字符串。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
