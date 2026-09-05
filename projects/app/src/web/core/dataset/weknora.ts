import { GET, POST } from '@/web/common/api/request';
import type {
  WeKnoraConnectionParams,
  ValidateWeKnoraConnectionResponse,
  WeKnoraConnectionInfo,
  WeKnoraKnowledgeBase
} from '@fastgpt/global/core/dataset/weknora';

export const getWeKnoraConnectionInfo = (appId: string, connectionId: string) =>
  GET<WeKnoraConnectionInfo>('/core/app/weknora/connection', { appId, connectionId });

export const validateWeKnoraConnection = (data: WeKnoraConnectionParams) =>
  POST<ValidateWeKnoraConnectionResponse>('/core/app/weknora/connection', {
    ...data,
    action: 'validate'
  });

export const saveWeKnoraConnection = (data: WeKnoraConnectionParams) =>
  POST<WeKnoraConnectionInfo>('/core/app/weknora/connection', { ...data, action: 'save' });

export const getWeKnoraKnowledgeBases = (appId: string, connectionId: string) =>
  GET<WeKnoraKnowledgeBase[]>('/core/app/weknora/knowledgeBases', { appId, connectionId });
