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
import {
  Input_Template_SelectAIModel,
  Input_Template_System_Prompt,
  Input_Template_UserChatInput
} from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { PROMPT_NL2SQL_RULES_PLACEHOLDER } from '../../../../ai/prompt/nl2sql';
import { getHandleConfig } from '../../utils';

export const NL2SQLModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.nl2sql,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.nl2sql,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/sqlgen',
  name: 'NL2SQL',
  intro: '将用户的自然语言问题转换为对应的SQL查询语句，支持多种数据库类型。',
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
      description: '为空则使用默认系统提示词。',
      placeholder: '可留空，使用默认系统提示词。'
    },
    {
      key: NodeInputKeyEnum.nl2sqlUserPrompt,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '生成规则(可选)',
      description: '补充生成规则内容，会拼接到提示词规则段落中。',
      placeholder: PROMPT_NL2SQL_RULES_PLACEHOLDER,
      max: 3000,
      value: ''
    },
    {
      key: NodeInputKeyEnum.nl2sqlDatabaseSchema,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      label: '数据库schema',
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      description: '数据库 DDL 或 Schema 描述，用于辅助生成 SQL。',
      placeholder: '例如：CREATE TABLE ...'
    },
    {
      key: NodeInputKeyEnum.nl2sqlRelationFields,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.textarea],
      label: '关联字段',
      required: false,
      valueType: WorkflowIOValueTypeEnum.string,
      description: '可选：补充表之间的关联字段/Join 关系说明。',
      placeholder: '例如：orders.user_id = users.id'
    },
    {
      ...Input_Template_UserChatInput,
      label: '用户问题',
      toolDescription: '要转换成 SQL 的自然语言问题。'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.sql,
      key: NodeOutputKeyEnum.sql,
      label: 'SQL',
      description: '生成的 SQL 语句；若发生错误则为空字符串。',
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '生成失败时返回错误信息；成功时为空字符串。',
      required: true,
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
