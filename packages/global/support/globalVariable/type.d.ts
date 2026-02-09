import { PermissionSchemaType } from '../permission/type';
import { GlobalVariablePermission } from '../permission/globalVariable/controller';

export type TeamGlobalVariableItemType = {
  key: string;
  value: string;
};

export type TeamGlobalVariableGroupSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  name: string;
  groupKey: string;
  updateTime: Date;
  variables: TeamGlobalVariableItemType[];
} & PermissionSchemaType;

export type TeamGlobalVariableGroupDetailType = TeamGlobalVariableGroupSchemaType & {
  permission: GlobalVariablePermission;
};
