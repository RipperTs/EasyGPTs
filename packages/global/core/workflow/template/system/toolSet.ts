import { FlowNodeTemplateType } from '../../type/node';
import { FlowNodeTemplateTypeEnum } from '../../constants';
import { FlowNodeTypeEnum } from '../../node/constant';

export const ToolSetNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.toolSet,
  templateType: FlowNodeTemplateTypeEnum.other,
  flowNodeType: FlowNodeTypeEnum.toolSet,
  name: '',
  intro: '',
  avatar: '',
  isTool: true,
  showSourceHandle: false,
  showTargetHandle: false,
  showStatus: false,
  inputs: [],
  outputs: [],
  version: '481'
};
