import { authCert } from '@fastgpt/service/support/permission/auth/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';

export const authRootUser = async (req: ApiRequestProps<unknown, Record<string, unknown>>) => {
  const { isRoot } = await authCert({ req, authToken: true });
  if (!isRoot) return Promise.reject('无权限访问');
};
