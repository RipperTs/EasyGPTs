import { DELETE, GET, POST } from '@/web/common/api/request';
import {
  TeamGlobalVariableGroupDetailType,
  TeamGlobalVariableGroupSchemaType
} from '@fastgpt/global/support/globalVariable/type';
import {
  CreateGlobalVariableGroupBody,
  GlobalVariableCollaboratorDeleteParams,
  GlobalVariableGroupDeleteParams,
  UpdateGlobalVariableGroupBody,
  UpdateGlobalVariableGroupCollaboratorBody
} from '@fastgpt/global/support/globalVariable/api';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

export const getGlobalVariableGroupList = () =>
  GET<TeamGlobalVariableGroupDetailType[]>('/support/globalVariable/group/list');

export const createGlobalVariableGroup = (body: CreateGlobalVariableGroupBody) =>
  POST<TeamGlobalVariableGroupSchemaType>('/support/globalVariable/group/create', body);

export const updateGlobalVariableGroup = (body: UpdateGlobalVariableGroupBody) =>
  POST<boolean>('/support/globalVariable/group/update', body);

export const deleteGlobalVariableGroup = (params: GlobalVariableGroupDeleteParams) =>
  DELETE<boolean>('/support/globalVariable/group/delete', params);

export const getGlobalVariableGroupCollaboratorList = (groupId: string) =>
  GET<CollaboratorItemType[]>('/support/globalVariable/group/collaborator/list', { groupId });

export const updateGlobalVariableGroupCollaborators = (
  body: UpdateGlobalVariableGroupCollaboratorBody
) => POST<boolean>('/support/globalVariable/group/collaborator/update', body);

export const deleteGlobalVariableCollaborators = (params: GlobalVariableCollaboratorDeleteParams) =>
  DELETE<boolean>('/support/globalVariable/group/collaborator/delete', params);
