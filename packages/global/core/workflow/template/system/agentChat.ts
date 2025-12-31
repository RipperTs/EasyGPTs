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
  Input_Template_Text_Quote,
  Input_Template_UserChatInput
} from '../input';
import { getHandleConfig } from '../utils';
import { LLMModelTypeEnum } from '../../../ai/constants';

export const AgentChatModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.agentChat,
  flowNodeType: FlowNodeTypeEnum.agentChat,
  templateType: FlowNodeTemplateTypeEnum.ai,
  sourceHandle: getHandleConfig(true, true, false, true),
  targetHandle: getHandleConfig(true, true, false, true),
  avatar: 'core/workflow/template/aiAgent',
  name: 'Agent 对话',
  intro:
    'Plan-and-Execute 对话模式：结构化规划 → 逐步执行 → 持续重规划与收敛答复，适合复杂任务与数据分析场景。',
  showStatus: true,
  isTool: true,
  version: '485',
  inputs: [
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      key: NodeInputKeyEnum.agentIntentModel,
      renderTypeList: [FlowNodeInputTypeEnum.selectLLMModel, FlowNodeInputTypeEnum.reference],
      label: '意图识别模型',
      description: '用于预判任务是否需要“规划-执行”；留空则使用主模型。',
      valueType: WorkflowIOValueTypeEnum.string,
      required: false,
      llmModelType: LLMModelTypeEnum.all,
      value: ''
    },
    Input_Template_System_Prompt,
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
    Input_Template_History,
    Input_Template_Text_Quote,
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
      description: '结构化计划、重规划变化摘要、已完成步骤、耗时/循环等（用于调试与审计）',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
