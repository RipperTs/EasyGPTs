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
  name: '代码生成器',
  intro:
    '根据用户的自然语言需求，生成可执行的 Python 代码。可配合代码执行器使用，实现从需求到执行的完整流程。',
  showStatus: true,
  isTool: true,
  version: '501',
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
