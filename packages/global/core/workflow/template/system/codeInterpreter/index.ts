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
  name: '代码解释器（Python）',
  intro:
    '面向 Agent 的 Python 代码解释器：可直接输入任务描述，由系统自动生成并执行 Python（含自动修复重试），适合数据分析/文件处理/科学计算等高 Token 任务。',
  showStatus: true,
  isTool: true,
  version: '503',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all,
      description: '用于自动生成/修复 Python 代码（执行器只负责运行代码）。'
    },
    {
      key: NodeInputKeyEnum.aiSystemPrompt,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '系统提示词（可选）',
      max: 3000,
      value: '',
      description:
        '仅影响“生成/修复代码”的策略，不影响沙箱执行环境。建议留空使用默认最佳实践提示词。'
    },
    {
      key: NodeInputKeyEnum.codeInterpreterMaxRetry,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '自动修复重试次数',
      description: '代码运行失败时，AI 会分析报错并修复代码后重试。',
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
      description: '请求代码执行服务的超时时间（仅影响请求等待时间）。',
      required: true,
      min: 5,
      max: 600,
      value: 120
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
      toolDescription: '需要处理的文件链接列表（http(s)），可留空'
    },
    {
      key: NodeInputKeyEnum.userChatInput,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: '任务描述',
      description:
        '用自然语言描述你希望通过 Python 完成的任务（数据分析/计算/文件处理等）。若提供了“Python 代码”，则以代码为准。',
      placeholder:
        '例如：读取上传的 CSV，按城市统计订单金额，输出 Top10，并画出柱状图保存为图片；同时导出统计结果为 result.csv。',
      required: false,
      toolDescription: '要完成的任务描述（会自动生成并执行 Python 代码）'
    },
    {
      key: NodeInputKeyEnum.code,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'Python 代码（可选）',
      description:
        '可选：直接提供要执行的 Python 代码（高级用法）。代码中可使用 FILES 变量访问文件列表。',
      placeholder:
        'import matplotlib.pyplot as plt\n\ndata = [1, 2, 3, 4, 5]\nplt.plot(data)\nplt.savefig("chart.png")',
      required: false,
      toolDescription: '可选：直接提供要执行的 Python 代码（若不提供则根据任务描述自动生成）'
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.result,
      key: NodeOutputKeyEnum.result,
      label: '结果输出',
      description:
        '统一输出：优先返回服务 result；若为空则返回 image_url；若仍为空则返回 files（以换行拼接）。',
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.error,
      key: NodeOutputKeyEnum.error,
      label: '错误信息',
      description: '执行失败时返回错误信息；成功时为空字符串。',
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
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.files,
      key: NodeOutputKeyEnum.files,
      label: '生成文件',
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
