import { NullPermission, PermissionKeyEnum, PermissionList } from '../constant';
import { PermissionListType } from '../type';

export enum GlobalVariablePermissionKeyEnum {}

export const GlobalVariablePermissionList: PermissionListType = {
  [PermissionKeyEnum.read]: {
    ...PermissionList[PermissionKeyEnum.read],
    name: '可读取变量',
    description: '可在工作流中读取全局变量'
  },
  [PermissionKeyEnum.write]: {
    ...PermissionList[PermissionKeyEnum.write],
    name: '可编辑变量',
    description: '可新增、编辑、删除全局变量'
  },
  [PermissionKeyEnum.manage]: {
    ...PermissionList[PermissionKeyEnum.manage],
    name: '可管理权限',
    description: '可配置默认权限和协作者权限'
  }
};

export const GlobalVariableDefaultPermissionVal = NullPermission;
