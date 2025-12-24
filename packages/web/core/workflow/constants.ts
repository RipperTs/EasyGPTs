import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { i18nT } from '../../i18n/utils';
import type { PluginGroupSchemaType, TGroupType } from '../../../service/core/app/plugin/type';
import { TemplateTypeSchemaType } from '@fastgpt/global/core/app/type';
import { AppTemplateTypeEnum } from '@fastgpt/global/core/app/constants';

export const workflowNodeTemplateList = [
  {
    type: FlowNodeTemplateTypeEnum.systemInput,
    label: i18nT('common:core.module.template.System input module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.ai,
    label: i18nT('common:core.module.template.AI function'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.search,
    label: i18nT('common:core.workflow.template.Search'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.interactive,
    label: i18nT('common:core.workflow.template.Interactive'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.multimodal,
    label: i18nT('common:core.workflow.template.Multimodal'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.tools,
    label: i18nT('common:core.module.template.Tool module'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.communication,
    label: i18nT('app:workflow.template.communication'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.other,
    label: i18nT('common:common.Other'),
    list: []
  },
  {
    type: FlowNodeTemplateTypeEnum.teamApp,
    label: '',
    list: []
  }
];

export const systemPluginTemplateList: TGroupType[] = [
  {
    typeId: FlowNodeTemplateTypeEnum.tools,
    typeName: '工具'
  },
  {
    typeId: FlowNodeTemplateTypeEnum.search,
    typeName: '搜索'
  },
  {
    typeId: FlowNodeTemplateTypeEnum.database,
    typeName: '数据库'
  },
  {
    typeId: FlowNodeTemplateTypeEnum.multimodal,
    typeName: '多模态'
  },
  {
    typeId: FlowNodeTemplateTypeEnum.communication,
    typeName: '通信'
  },
  {
    typeId: FlowNodeTemplateTypeEnum.other,
    typeName: '其他'
  }
];

export const defaultGroup: PluginGroupSchemaType = {
  groupId: 'systemPlugin',
  groupAvatar: 'core/app/type/pluginLight',
  groupName: i18nT('common:core.module.template.System Plugin'),
  groupOrder: 0,
  groupTypes: systemPluginTemplateList
};

export const defaultTemplateTypes: TemplateTypeSchemaType[] = [
  {
    typeName: '文本创作',
    typeId: AppTemplateTypeEnum.writing,
    typeOrder: 0
  },
  {
    typeName: '图片生成',
    typeId: AppTemplateTypeEnum.imageGeneration,
    typeOrder: 1
  },
  {
    typeName: '联网搜索',
    typeId: AppTemplateTypeEnum.webSearch,
    typeOrder: 2
  },
  {
    typeName: '角色扮演',
    typeId: AppTemplateTypeEnum.roleplay,
    typeOrder: 3
  },
  {
    typeName: '办公服务',
    typeId: AppTemplateTypeEnum.officeServices,
    typeOrder: 4
  }
];
