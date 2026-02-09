import { DELETE, GET, POST } from '@/web/common/api/request';
import { TeamGlobalVariableDetailType } from '@fastgpt/global/support/globalVariable/type';
import {
  GlobalVariableCollaboratorDeleteParams,
  UpdateGlobalVariableBody,
  UpdateGlobalVariableCollaboratorBody
} from '@fastgpt/global/support/globalVariable/api';
import { CollaboratorItemType } from '@fastgpt/global/support/permission/collaborator';

export const getGlobalVariableDetail = () =>
  GET<TeamGlobalVariableDetailType>('/support/globalVariable/detail');

export const updateGlobalVariable = (body: UpdateGlobalVariableBody) =>
  POST<boolean>('/support/globalVariable/update', body);

export const getGlobalVariableCollaboratorList = () =>
  GET<CollaboratorItemType[]>('/support/globalVariable/collaborator/list');

export const updateGlobalVariableCollaborators = (body: UpdateGlobalVariableCollaboratorBody) =>
  POST<boolean>('/support/globalVariable/collaborator/update', body);

export const deleteGlobalVariableCollaborators = (params: GlobalVariableCollaboratorDeleteParams) =>
  DELETE<boolean>('/support/globalVariable/collaborator/delete', params);
