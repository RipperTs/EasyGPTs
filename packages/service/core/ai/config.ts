import type { UserModelSchema } from '@fastgpt/global/support/user/type';
import OpenAI from '@fastgpt/global/core/ai';

const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

const normalize = (v?: string | null) => {
  if (!v) return undefined;
  const str = String(v).trim();
  if (!str) return undefined;
  const lowered = str.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'none') return undefined;
  return str;
};

const pickBaseUrl = (userKey?: UserModelSchema['openaiAccount']) => {
  const fromUser = normalize(userKey?.baseUrl);
  const fromGlobal = normalize(global?.systemEnv?.oneapiUrl as any);
  const fromEnvOneApi = normalize(process.env.ONEAPI_URL);
  const fromEnvOpenai = normalize(process.env.OPENAI_BASE_URL);
  return (
    fromUser ||
    fromGlobal ||
    fromEnvOneApi ||
    fromEnvOpenai ||
    DEFAULT_OPENAI_BASE_URL
  ).replace(/\/+$/, '');
};

const pickApiKey = (userKey?: UserModelSchema['openaiAccount']) => {
  const fromUser = normalize(userKey?.key);
  const fromGlobal = normalize(global?.systemEnv?.chatApiKey as any);
  const fromEnv = normalize(process.env.CHAT_API_KEY);
  return fromUser || fromGlobal || fromEnv || '';
};

export const getAIApi = (props?: {
  userKey?: UserModelSchema['openaiAccount'];
  timeout?: number;
}) => {
  const { userKey, timeout } = props || {};

  const baseUrl = pickBaseUrl(userKey);
  const apiKey = pickApiKey(userKey);

  return new OpenAI({
    baseURL: baseUrl,
    apiKey,
    httpAgent: global.httpsAgent,
    timeout,
    maxRetries: 2
  });
};

export const getAxiosConfig = (props?: { userKey?: UserModelSchema['openaiAccount'] }) => {
  const { userKey } = props || {};
  const baseUrl = pickBaseUrl(userKey);
  const apiKey = pickApiKey(userKey);

  return {
    baseUrl,
    authorization: apiKey ? `Bearer ${apiKey}` : ''
  };
};

// 向后兼容：导出默认的 OpenAI 基础地址（可能来自 ONEAPI_URL/OPENAI_BASE_URL）
export const openaiBaseUrl = pickBaseUrl();
