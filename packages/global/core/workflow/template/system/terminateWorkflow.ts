import { FlowNodeInputTypeEnum, FlowNodeTypeEnum } from '../../node/constant';
import type { FlowNodeTemplateType } from '../../type/node';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../constants';
import { getHandleConfig } from '../utils';

export const TerminateWorkflowModule: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.terminateWorkflow,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.terminateWorkflow,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/stopTool',
  name: '终止工作流',
  intro: '立即终止整个工作流，并将错误信息作为结果返回。',
  showStatus: true,
  version: '481',
  inputs: [
    {
      key: NodeInputKeyEnum.terminateError,
      renderTypeList: [FlowNodeInputTypeEnum.textarea, FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.any,
      required: true,
      label: '错误信息',
      description: '支持变量引用；执行到此节点后，整个工作流将立即结束，并返回该错误信息。',
      placeholder: '请输入错误信息，或引用上游节点的 error 输出'
    }
  ],
  outputs: []
};
