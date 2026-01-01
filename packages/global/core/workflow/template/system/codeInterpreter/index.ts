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
import { Input_Template_SelectAIModel } from '../../input';
import { LLMModelTypeEnum } from '../../../../ai/constants';
import { getHandleConfig } from '../../utils';

export const CodeInterpreterModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.codeInterpreter,
  templateType: FlowNodeTemplateTypeEnum.ai,
  flowNodeType: FlowNodeTypeEnum.codeInterpreter,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/codeInter',
  name: 'Python 数据分析沙箱',
  intro:
    '面向 Agent 的 Python 分析/计算工具：输入“任务描述 + 文件链接”，自动生成并执行 Python（含自动修复重试），适合数据分析、文件处理、科学计算、表格/CSV/Excel 处理、绘图与生成报告等高 Token 任务。',
  showStatus: true,
  isTool: true,
  version: '504',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all,
      description: '用于自动生成/修复 Python 代码（沙箱只负责运行代码）。'
    },
    {
      key: NodeInputKeyEnum.aiSystemPrompt,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '代码策略提示词（可选）',
      max: 3000,
      value: '',
      description:
        '仅影响“生成/修复代码”的策略，不影响沙箱执行环境。一般留空即可；需要强约束输出/库使用/格式时再填写。'
    },
    {
      key: NodeInputKeyEnum.codeInterpreterMaxRetry,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '自动修复次数',
      description: '运行失败/输出不合规（过长/Base64）时，自动让模型修复代码并重试。',
      required: true,
      min: 1,
      max: 10,
      value: 5
    },
    {
      key: NodeInputKeyEnum.codeInterpreterTimeout,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '执行超时（秒）',
      description: '请求沙箱执行服务的超时时间（仅影响本次请求等待时间）。',
      required: true,
      min: 5,
      max: 600,
      value: 120
    },
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: '输入文件链接（可选）',
      description:
        '需要在沙箱中操作的文件链接（http(s)）。可留空：将自动使用用户在当前对话中上传的文件。',
      required: false,
      value: [],
      toolDescription: '可选：输入文件 URL 列表（http(s)），沙箱会自动下载到当前工作目录'
    },
    {
      key: NodeInputKeyEnum.userChatInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '任务描述',
      description:
        '用自然语言描述你希望通过 Python 完成的任务（数据分析/计算/文件处理等）。建议写清：输入文件是什么、要做什么处理、希望输出什么（文本/图片/文件）。',
      placeholder:
        '例如：读取上传的 CSV，按城市统计订单金额，输出 Top10（文本摘要），并画柱状图保存为图片；同时导出统计结果为 result.csv。',
      required: true,
      toolDescription:
        '必填：要完成的任务描述（用于自动生成并执行 Python）。请写清输入文件/处理目标/期望输出（文本摘要/图片/文件）'
    },
    {
      key: NodeInputKeyEnum.code,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '高级：直接运行 Python 代码（可选）',
      description:
        '仅供手动调试：可从上游节点引用一段 Python 代码并执行。工具调用模式不会使用该字段（会被服务端拒绝）。代码中可使用 FILES 变量访问文件列表。',
      required: false
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.result,
      key: NodeOutputKeyEnum.result,
      label: '文本结果（摘要）',
      description:
        '统一输出：优先返回 stdout 的摘要文本；若为空则返回 image_url；若仍为空则返回 files（以换行拼接）。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '执行失败时返回错误信息；成功时为空字符串。Agent 可据此重试/改写任务描述。',
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
      description: '绘图/可视化产物（如保存 png/jpg）对应的图片 URL（若有）。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.files,
      key: NodeOutputKeyEnum.files,
      label: '生成文件',
      description: '代码运行过程中生成的文件 URL（如 CSV/JSON/XLSX/ZIP 等）。',
      valueType: WorkflowIOValueTypeEnum.arrayString,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.inputs,
      key: NodeOutputKeyEnum.inputs,
      label: '输入文件',
      valueType: WorkflowIOValueTypeEnum.arrayString,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.code,
      key: NodeOutputKeyEnum.code,
      label: '最终执行代码',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
