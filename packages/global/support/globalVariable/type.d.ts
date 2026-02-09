import { PermissionSchemaType } from '../permission/type';
import { GlobalVariablePermission } from '../permission/globalVariable/controller';

export type TeamGlobalVariableItemType = {
  key: string;
  value: string;
};

export type TeamGlobalVariableSchemaType = {
  _id: string;
  teamId: string;
  tmbId: string;
  updateTime: Date;
  variables: TeamGlobalVariableItemType[];
} & PermissionSchemaType;

export type TeamGlobalVariableDetailType = TeamGlobalVariableSchemaType & {
  permission: GlobalVariablePermission;
};
