import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import type { FlowNodeTemplateType } from '../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../constants';
import {
  Input_Template_SelectAIModel,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../input';
import { LLMModelTypeEnum } from '../../../ai/constants';
import { getHandleConfig } from '../utils';

export const TimeSemanticParseModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.timeSemanticParse,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.timeSemanticParse,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/timeParse',
  name: '时间语义化解析',
  intro:
    '将文本中的相对/模糊时间表达（如昨天、本周、近7天）解析为 yyyy-MM-dd；也支持输出时间范围 JSON。',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      ...Input_Template_System_Prompt,
      label: '系统提示词（可选）',
      description: '为空则使用默认提示词；建议仅微调，不要改变输出格式要求。',
      placeholder: '可留空，使用默认提示词。'
    },
    {
      key: NodeInputKeyEnum.timeSemanticParseType,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '解析类型',
      required: true,
      value: 'semantic_convert',
      list: [
        { label: '语义解析转换（输出文本）', value: 'semantic_convert' },
        { label: '解析时间范围（输出 JSON 文本）', value: 'parse_time' }
      ],
      toolDescription: '选择输出类型：语义解析转换 或 解析时间范围。'
    },
    {
      key: NodeInputKeyEnum.timeSemanticCurrentTime,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '当前时间（可选）',
      description:
        '用于相对时间解析。示例：2025-12-25 或 2025-12-25 13:00:00；为空则使用系统时间。',
      required: false,
      value: '',
      toolDescription: '用于相对时间解析的当前时间；为空则使用系统时间。'
    },
    {
      ...Input_Template_UserChatInput,
      label: '待解析文本',
      toolDescription: '包含相对/模糊时间表达的文本内容。'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.timeSemanticOriginalText,
      key: NodeOutputKeyEnum.timeSemanticOriginalText,
      label: '原始文本',
      description: '输入的原始文本内容。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.timeSemanticResult,
      key: NodeOutputKeyEnum.timeSemanticResult,
      label: '解析结果',
      description: '解析后的纯文本结果；选择“解析时间范围”时为 JSON 字符串。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '解析失败时返回错误信息；成功时为空字符串。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
