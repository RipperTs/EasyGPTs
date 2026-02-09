import { UpdateClbPermissionProps } from '../permission/collaborator';
import { PermissionValueType } from '../permission/type';
import { TeamGlobalVariableItemType } from './type';

export type CreateGlobalVariableGroupBody = {
  name: string;
  groupKey: string;
};

export type UpdateGlobalVariableGroupBody = {
  groupId: string;
  name?: string;
  groupKey?: string;
  variables?: TeamGlobalVariableItemType[];
  defaultPermission?: PermissionValueType;
};

export type UpdateGlobalVariableGroupCollaboratorBody = UpdateClbPermissionProps & {
  groupId: string;
};

export type GlobalVariableGroupDeleteParams = {
  groupId: string;
};

export type GlobalVariableCollaboratorDeleteParams = {
  groupId: string;
  tmbId: string;
};
