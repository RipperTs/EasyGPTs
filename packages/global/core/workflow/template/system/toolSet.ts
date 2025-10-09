import { FlowNodeTemplateType } from '../../type/node.d';
import { getHandleConfig } from '../utils';
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
  sourceHandle: getHandleConfig(false, false, false, false),
  targetHandle: getHandleConfig(false, false, false, false),
  showStatus: false,
  inputs: [],
  outputs: [],
  version: '481'
};
