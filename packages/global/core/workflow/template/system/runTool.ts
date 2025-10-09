import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node.d';
import { getHandleConfig } from '../utils';

export const RunToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tool,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.tool,
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  isTool: true,
  intro: '',
  name: '',
  showStatus: true,
  version: '481',
  inputs: [],
  outputs: []
};
