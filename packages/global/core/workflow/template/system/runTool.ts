import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';
import { type FlowNodeTemplateType } from '../../type/node';

export const RunToolNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.tool,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.tool,
  showSourceHandle: false,
  showTargetHandle: false,
  isTool: true,
  intro: '',
  name: '',
  showStatus: true,
  version: '481',
  inputs: [],
  outputs: []
};
