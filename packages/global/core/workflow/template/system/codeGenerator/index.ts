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

export const CodeGeneratorModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.codeGenerator,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.codeGenerator,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/codeGenerator',
  name: '（已废弃）代码生成器',
  intro:
    '已废弃：请直接使用「代码解释器（Python）」节点（可直接输入任务描述，自动生成并执行 Python，并支持自动修复重试）。',
  showStatus: true,
  isTool: false,
  version: '503',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      key: NodeInputKeyEnum.aiSystemPrompt,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'System Prompt',
      max: 3000,
      value: '',
      placeholder:
        '你可以自定义 System Prompt，引导 AI 生成符合特定需求的代码。留空则使用默认 Prompt。'
    },
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: '文件链接',
      description:
        '需要在代码中操作的文件链接（http(s)）。可留空：将自动使用用户在当前对话中上传的文件。',
      required: false,
      value: [],
      toolDescription: '需要处理的文件链接列表，可留空'
    },
    {
      ...Input_Template_UserChatInput,
      label: '任务描述',
      toolDescription: '用自然语言描述你希望通过 Python 代码完成的任务。'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.code,
      key: NodeOutputKeyEnum.code,
      label: '生成的代码',
      description: 'AI 生成的 Python 代码，可直接传给代码执行器执行。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
