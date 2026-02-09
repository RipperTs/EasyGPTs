import { UpdateClbPermissionProps } from '../permission/collaborator';
import { PermissionValueType } from '../permission/type';
import { TeamGlobalVariableItemType } from './type';

export type UpdateGlobalVariableBody = {
  variables?: TeamGlobalVariableItemType[];
  defaultPermission?: PermissionValueType;
};

export type UpdateGlobalVariableCollaboratorBody = UpdateClbPermissionProps;

export type GlobalVariableCollaboratorDeleteParams = {
  tmbId: string;
};
