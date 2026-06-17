import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import {
  WorkflowIOValueTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  FlowNodeTemplateTypeEnum
} from '../../../constants';
import { Input_Template_SelectAIModel } from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { getHandleConfig } from '../../utils';

export const DatabaseConnectorModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.databaseConnector,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.databaseConnector,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/datasource',
  name: '数据库查询',
  intro: '配置 MySQL / PostgreSQL / Oracle 连接并执行 SQL，支持通过AI自动分析错误并修复错误 SQL。',
  showStatus: true,
  isTool: true,
  version: '481',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all
    },
    {
      key: NodeInputKeyEnum.databaseType,
      renderTypeList: [FlowNodeInputTypeEnum.select],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '数据库类型',
      description: '选择要连接的数据库类型，目前支持 MySQL、PostgreSQL 和 Oracle。',
      list: [
        {
          label: 'MySQL',
          value: 'MySQL'
        },
        {
          label: 'PostgreSQL',
          value: 'PostgreSQL'
        },
        {
          label: 'Oracle',
          value: 'Oracle'
        }
      ],
      required: true
    },
    {
      key: NodeInputKeyEnum.databaseHost,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '主机地址',
      description: '数据库连接地址，例如：127.0.0.1 或 内网 IP。',
      required: true
    },
    {
      key: NodeInputKeyEnum.databasePort,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '端口',
      description: '数据库连接端口，例如 MySQL 默认 3306，PostgreSQL 默认 5432，Oracle 默认 1521。',
      required: true
    },
    {
      key: NodeInputKeyEnum.databaseName,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '数据库名称',
      description: '要连接的数据库名称。Oracle 请填写 service name。',
      required: true
    },
    {
      key: NodeInputKeyEnum.databaseUser,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '用户名',
      description: '数据库登录用户名。',
      required: true
    },
    {
      key: NodeInputKeyEnum.databasePassword,
      renderTypeList: [FlowNodeInputTypeEnum.reference, FlowNodeInputTypeEnum.input],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '密码',
      description: '数据库登录密码。',
      required: true
    },
    {
      key: NodeInputKeyEnum.databaseSql,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'SQL 语句',
      description: '要执行的 SQL，可以直接输入或引用上游节点输出。',
      placeholder: '例如：SELECT * FROM your_table LIMIT 10;',
      required: true,
      toolDescription: '执行数据库查询或写入的 SQL 语句。'
    },
    {
      key: NodeInputKeyEnum.databaseMaxRetry,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '自动修复重试次数',
      description: '当 SQL 执行失败时，利用 AI 自动修复并重试的最大次数，默认 3 次。',
      required: true,
      min: 1,
      max: 15,
      value: 3
    },
    {
      key: NodeInputKeyEnum.databaseTimeout,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '数据库执行超时时间（秒）',
      description: '单次 SQL 执行的最大等待时间，超时将中断查询并返回错误，默认 30 秒。',
      required: true,
      min: 1,
      max: 600,
      value: 30
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.success,
      key: NodeOutputKeyEnum.success,
      label: '是否执行成功',
      description: 'SQL 最终是否执行成功，true 表示成功，false 表示失败。',
      valueType: WorkflowIOValueTypeEnum.boolean,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.databaseQueryResult,
      key: NodeOutputKeyEnum.databaseQueryResult,
      label: 'SQL 执行结果',
      description: 'SQL 执行后的结果对象（查询返回的行或写入结果）。',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: 'SQL 执行失败时的错误详情（包含错误信息、数据库类型、实际执行的 SQL 等）。',
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
