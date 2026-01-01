import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { FlowNodeTemplateType } from '../../../type/node';
import { getHandleConfig } from '../../utils';

export const ReadFilesNodes: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.readFiles,
  templateType: FlowNodeTemplateTypeEnum.tools,
  flowNodeType: FlowNodeTypeEnum.readFiles,
  sourceHandle: getHandleConfig(true, true, true, true),
  targetHandle: getHandleConfig(true, true, true, true),
  avatar: 'core/workflow/template/readFiles',
  name: i18nT('app:workflow.read_files'),
  intro: '解析对话中所有上传的文档，并返回对应文档内容和文档名称以及文档访问链接信息。',
  showStatus: true,
  version: '494',
  isTool: true,
  inputs: [
    {
      key: NodeInputKeyEnum.fileUrlList,
      renderTypeList: [FlowNodeInputTypeEnum.reference],
      valueType: WorkflowIOValueTypeEnum.arrayString,
      label: i18nT('app:workflow.file_url'),
      required: true,
      value: []
    },
    {
      key: NodeInputKeyEnum.readFilesMaxLength,
      renderTypeList: [FlowNodeInputTypeEnum.numberInput],
      valueType: WorkflowIOValueTypeEnum.number,
      label: '输出内容最大长度',
      description: '用于截断节点输出文本的最大字符数；0 表示不截断。',
      required: false,
      min: 0,
      value: 0
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.text,
      key: NodeOutputKeyEnum.text,
      label: i18nT('app:workflow.read_files_result'),
      description: i18nT('app:workflow.read_files_result_desc'),
      valueType: WorkflowIOValueTypeEnum.string,
      type: FlowNodeOutputTypeEnum.static
    },
    {
      id: NodeOutputKeyEnum.readFilesFileList,
      key: NodeOutputKeyEnum.readFilesFileList,
      label: '文件列表（JSON）',
      description: '数组 JSON：每项包含 filename 和 url（文件下载链接）。',
      valueType: WorkflowIOValueTypeEnum.arrayObject,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
