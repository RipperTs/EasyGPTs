import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { FlowNodeTemplateType } from '../../type/node.d';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../constants';
import {
  Input_Template_History,
  Input_Template_SettingAiModel,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { chatNodeSystemPromptTip } from '../tip';
import { getHandleConfig } from '../utils';
import { LLMModelTypeEnum } from '../../../ai/constants';

export const AgentChatModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agentChat,
  flowNodeType: FlowNodeTypeEnum.agentChat,
  templateType: FlowNodeTemplateTypeEnum.ai,
  sourceHandle: getHandleConfig(true, true, false, true),
  targetHandle: getHandleConfig(true, true, false, true),
  avatar: 'core/workflow/template/toolCall',
  name: 'Agent 对话',
  intro: 'Plan-and-Execute：先规划再逐步执行（支持工具调用与重规划）',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
    },
    // --- ai settings modal
    {
      key: NodeInputKeyEnum.aiChatTemperature,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: undefined,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatMaxToken,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      value: undefined,
      valueType: WorkflowIOValueTypeEnum.number
    },
    {
      key: NodeInputKeyEnum.aiChatVision,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.aiChatReasoning,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.aiChatReasoningEffort,
      renderTypeList: [FlowNodeInputTypeEnum.hidden],
      label: '',
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'medium'
    },
    // --- agent settings
    {
      key: NodeInputKeyEnum.agentMaxPlanSteps,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      label: '最大计划步数',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 6,
      min: 1,
      max: 20
    },
    {
      key: NodeInputKeyEnum.agentMaxLoops,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      label: '最大循环次数',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 12,
      min: 1,
      max: 50
    },
    {
      ...Input_Template_System_Prompt,
      label: '系统提示词',
      description: chatNodeSystemPromptTip,
      placeholder: chatNodeSystemPromptTip
    },
    Input_Template_History,
    Input_Template_UserChatInput
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.answerText,
      key: NodeOutputKeyEnum.answerText,
      label: '最终答复',
      description: 'Agent 收敛后的最终回答内容',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.reasoningText,
      key: NodeOutputKeyEnum.reasoningText,
      label: '思考过程内容',
      description: '推理模型思考过程内容输出',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.rawResponse,
      key: NodeOutputKeyEnum.rawResponse,
      label: '执行详情',
      description: '计划、已完成步骤、最终决策等（用于调试）',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
