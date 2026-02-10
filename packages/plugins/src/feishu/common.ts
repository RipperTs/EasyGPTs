type RecordValue = Record<string, unknown>;

export type FeishuSendResponse = {
  result: {
    success: boolean;
    msgtype: string;
    response?: unknown;
    error?: string;
  };
};

const isRecord = (value: unknown): value is RecordValue => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const getOptionalString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

export const getRequiredString = (value: unknown, field: string): string => {
  const text = getOptionalString(value);
  if (!text) {
    throw new Error(`${field} 不能为空`);
  }
  return text;
};

export const parseJson = (value: unknown, field: string): unknown => {
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      throw new Error(`${field} 不能为空`);
    }

    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new Error(`${field} 必须是合法 JSON`);
    }
  }

  if (value === undefined || value === null) {
    throw new Error(`${field} 不能为空`);
  }

  return value;
};

export const parseJsonObject = (value: unknown, field: string): Record<string, unknown> => {
  const parsed = parseJson(value, field);
  if (!isRecord(parsed)) {
    throw new Error(`${field} 必须是 JSON 对象`);
  }

  return parsed;
};

export const parseJsonArray = (value: unknown, field: string): unknown[] => {
  const parsed = parseJson(value, field);
  if (!Array.isArray(parsed)) {
    throw new Error(`${field} 必须是 JSON 数组`);
  }

  return parsed;
};

export const sendFeishuMessage = async ({
  hook_url,
  msg_type,
  payload
}: {
  hook_url: unknown;
  msg_type: string;
  payload: Record<string, unknown>;
}): Promise<FeishuSendResponse> => {
  try {
    const hookUrl = getRequiredString(hook_url, 'hook_url');

    const res = await fetch(hookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const rawText = await res.text();
    let responseData: unknown = rawText;

    if (rawText) {
      try {
        responseData = JSON.parse(rawText) as unknown;
      } catch {}
    }

    const isApiSuccess =
      isRecord(responseData) && typeof responseData.code === 'number'
        ? responseData.code === 0
        : res.ok;

    const responseMsg =
      isRecord(responseData) && typeof responseData.msg === 'string' ? responseData.msg : undefined;

    return {
      result: {
        success: isApiSuccess,
        msgtype: msg_type,
        response: responseData,
        error: isApiSuccess ? undefined : responseMsg || `请求失败，HTTP ${res.status}`
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '发送失败';

    return {
      result: {
        success: false,
        msgtype: msg_type,
        error: message
      }
    };
  }
};
