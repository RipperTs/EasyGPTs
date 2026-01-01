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
    '参考 Google Agent 白皮书的编排思想：Mission/Scene → Think/Act/Observe 循环，结合工具调用、短期工作记忆与可观测 Trace，适合复杂任务与多工具协作。',
  showStatus: true,
  isTool: true,
  version: '484',
  inputs: [
    {
      ...Input_Template_SettingAiModel,
      llmModelType: LLMModelTypeEnum.all
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
      key: NodeInputKeyEnum.agentOrchestrationMode,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      label: '编排模式',
      description: '选择 Agent 的整体编排方式：规划执行（Plan-and-Execute）或 ReAct 循环。',
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'plan_execute',
      list: [
        { label: '规划执行（Plan-and-Execute）', value: 'plan_execute' },
        { label: '思考-行动-观察（ReAct）', value: 'react' }
      ]
    },
    {
      key: NodeInputKeyEnum.agentToolAccess,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      label: '工具权限',
      description: '最小权限优先：在不影响任务完成前提下，尽量减少可调用工具范围。',
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'standard',
      list: [
        { label: '最小权限（仅检索/分析类工具）', value: 'readOnly' },
        { label: '标准（默认）', value: 'standard' },
        { label: '完全（允许全部已连接工具）', value: 'full' }
      ]
    },
    {
      key: NodeInputKeyEnum.agentToolPreference,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      label: '代码解释器倾向',
      description:
        '当存在代码解释器工具时，是否在提示词中引导模型优先使用（仅限确需计算/文件处理的步骤）。',
      valueType: WorkflowIOValueTypeEnum.string,
      value: 'strong',
      list: [
        { label: '无', value: 'none' },
        { label: '提示', value: 'light' },
        { label: '强制', value: 'strong' }
      ]
    },
    {
      key: NodeInputKeyEnum.agentEnableClarify,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      label: '允许先澄清',
      description: '当关键信息缺失会导致工具调用/分析明显不可靠时，先返回澄清问题。',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.agentEnableWorkingMemory,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      label: '启用工作记忆',
      description: '将目标/约束/已知事实压缩成短期记忆，贯穿多步执行，减少上下文漂移。',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.agentEnableStepMemory,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      label: '抽取步骤记忆',
      description: '每步执行后抽取事实/数字/假设/待确认点，供最终答复合成与审计。',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.agentEnableCritic,
      renderTypeList: [FlowNodeInputTypeEnum.switch],
      label: '启用 Critic 质检',
      description: '对关键步骤进行质量评估；分数过低会触发重试或重规划。',
      valueType: WorkflowIOValueTypeEnum.boolean,
      value: true
    },
    {
      key: NodeInputKeyEnum.agentCriticThreshold,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      label: 'Critic 失败阈值',
      description: '当步骤质量评分低于该阈值（0-10）时，视为失败并触发重试（若开启）。',
      valueType: WorkflowIOValueTypeEnum.number,
      value: 4,
      min: 0,
      max: 10
    },
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
      description:
        'Mission/Scene/Plan/Act/Observe 的 Trace、结构化计划、重规划摘要、已完成步骤、工作记忆与使用量统计（用于调试与审计）',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
