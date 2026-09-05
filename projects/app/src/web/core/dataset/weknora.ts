import { GET, POST } from '@/web/common/api/request';
import type {
  SaveWeKnoraConnectionParams,
  SaveWeKnoraConnectionResponse,
  WeKnoraConnectionInfo,
  WeKnoraKnowledgeBase
} from '@fastgpt/global/core/dataset/weknora';

export const getWeKnoraConnectionInfo = (appId: string, connectionId: string) =>
  GET<WeKnoraConnectionInfo>('/core/app/weknora/connection', { appId, connectionId });

export const saveWeKnoraConnection = (data: SaveWeKnoraConnectionParams) =>
  POST<SaveWeKnoraConnectionResponse>('/core/app/weknora/connection', data);

export const getWeKnoraKnowledgeBases = (appId: string, connectionId: string) =>
  GET<WeKnoraKnowledgeBase[]>('/core/app/weknora/knowledgeBases', { appId, connectionId });
