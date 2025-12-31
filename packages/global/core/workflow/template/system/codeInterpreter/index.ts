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
  name: '代码执行器',
  intro: '在沙箱环境中执行 Python 代码。支持数据分析、可视化、文件处理等操作。',
  showStatus: true,
  isTool: true,
  version: '500',
  inputs: [
    {
      ...Input_Template_SelectAIModel,
      llmModelType: LLMModelTypeEnum.all,
      description: '仅在代码执行失败时用于自动修复代码。'
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
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: '文件链接',
      description:
        '需要在代码中操作的文件链接（http(s)）。可留空：将自动使用用户在当前对话中上传的文件。',
      required: false,
      value: []
    },
    {
      key: NodeInputKeyEnum.code,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.string,
      label: 'Python 代码',
      description: '要在沙箱环境中执行的 Python 代码。代码中可使用 FILES 变量访问文件列表。',
      placeholder:
        'import matplotlib.pyplot as plt\n\ndata = [1, 2, 3, 4, 5]\nplt.plot(data)\nplt.savefig("chart.png")',
      required: true,
      toolDescription: '要执行的 Python 代码'
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
    }
  ]
};
