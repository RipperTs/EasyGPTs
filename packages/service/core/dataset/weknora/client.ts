import axios from 'axios';
import type {
  WeKnoraConnectionConfig,
  WeKnoraKnowledgeBase
} from '@fastgpt/global/core/dataset/weknora';

export type WeKnoraSearchResult = {
  id: string;
  content: string;
  knowledge_id: string;
  knowledge_base_id: string;
  chunk_index: number;
  knowledge_title: string;
  knowledge_filename: string;
  score: number;
};

type WeKnoraResponse<T> = {
  success: boolean;
  data: T;
  error?: string | { code: string; message: string };
};

export type WeKnoraSearchRequest = {
  query_text: string;
  vector_threshold: number;
  keyword_threshold: number;
  match_count: number;
  disable_keywords_match: boolean;
  disable_vector_match: boolean;
  knowledge_ids: string[];
  tag_ids: string[];
};

export const createWeKnoraClient = (connection: WeKnoraConnectionConfig, signal?: AbortSignal) => {
  const request = async <T>(path: string, data?: WeKnoraSearchRequest): Promise<T> => {
    try {
      const response = await axios.request<WeKnoraResponse<T>>({
        url: `${connection.apiUrl}${path}`,
        method: data ? 'POST' : 'GET',
        data,
        headers: {
          'X-API-Key': connection.apiKey,
          ...(connection.tenantId ? { 'X-Tenant-ID': connection.tenantId } : {})
        },
        timeout: 30000,
        maxRedirects: 0,
        signal
      });
      if (response.data.success !== true) {
        const error = response.data.error;
        throw new Error(
          (typeof error === 'string' ? error : error?.message) || 'WeKnora 返回了失败响应'
        );
      }
      return response.data.data;
    } catch (error) {
      // Do not propagate Axios request configuration: it contains the API key.
      if (axios.isAxiosError<WeKnoraResponse<unknown>>(error)) {
        const status = error.response?.status;
        const responseError = error.response?.data?.error;
        const message =
          (typeof responseError === 'string' ? responseError : responseError?.message) ||
          error.message;
        throw new Error(
          `WeKnora 请求失败${status ? `（HTTP ${status}）` : ''}：${message.replaceAll(connection.apiKey, '***')}`
        );
      }
      if (error instanceof Error) {
        throw new Error(error.message.replaceAll(connection.apiKey, '***'));
      }
      throw new Error('WeKnora 请求失败');
    }
  };

  return {
    listKnowledgeBases: async () => {
      const data = await request<WeKnoraKnowledgeBase[] | null>('/knowledge-bases');
      if (data !== null && !Array.isArray(data)) {
        throw new Error('WeKnora 知识库列表格式错误');
      }
      return data ?? [];
    },
    getKnowledgeBase: (id: string) =>
      request<WeKnoraKnowledgeBase>(`/knowledge-bases/${encodeURIComponent(id)}`),
    search: async (id: string, params: WeKnoraSearchRequest) => {
      const data = await request<WeKnoraSearchResult[] | null>(
        `/knowledge-bases/${encodeURIComponent(id)}/hybrid-search`,
        params
      );
      // The WeKnora service serializes an empty retrieval result as null.
      if (data !== null && !Array.isArray(data)) {
        throw new Error('WeKnora 检索结果格式错误');
      }
      return data ?? [];
    }
  };
};

export const listWeKnoraKnowledgeBases = async (connection: WeKnoraConnectionConfig) => {
  const datasets = await createWeKnoraClient(connection).listKnowledgeBases();
  // The full KB response can include storage credentials. Only expose selection fields.
  return datasets.map(({ id, name, type, tenant_id, embedding_model_id, indexing_strategy }) => ({
    id,
    name,
    type,
    tenant_id,
    embedding_model_id,
    indexing_strategy: {
      vector_enabled: indexing_strategy.vector_enabled,
      keyword_enabled: indexing_strategy.keyword_enabled
    }
  }));
};
