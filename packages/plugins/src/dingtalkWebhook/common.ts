import crypto from 'crypto';

export type DingtalkSendResponse = {
  result: {
    success: boolean;
    msgtype: string;
    signed: boolean;
    response?: unknown;
    error?: string;
  };
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

export const getAutoTitle = (title: unknown, content: string): string => {
  const customTitle = getOptionalString(title);
  if (customTitle) return customTitle;

  if (content.length <= 15) return content;
  return `${content.slice(0, 15)}...`;
};

export const parseListText = (value: unknown): string[] => {
  const text = getOptionalString(value);
  if (!text) return [];

  return text
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
};

export const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;

  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }

  return undefined;
};

export const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
};

export const buildAt = ({
  at_user_ids,
  at_mobiles,
  is_at_all
}: {
  at_user_ids?: unknown;
  at_mobiles?: unknown;
  is_at_all?: unknown;
}): Record<string, unknown> | undefined => {
  const atUserIds = parseListText(at_user_ids);
  const atMobiles = parseListText(at_mobiles);
  const isAtAll = parseBoolean(is_at_all);

  // 仅当有@对象或显式@全员时才下发 at 字段
  if (atUserIds.length === 0 && atMobiles.length === 0 && isAtAll !== true) {
    return undefined;
  }

  const at: Record<string, unknown> = {};
  if (atUserIds.length > 0) at.atUserIds = atUserIds;
  if (atMobiles.length > 0) at.atMobiles = atMobiles;
  if (isAtAll !== undefined) at.isAtAll = isAtAll;

  return at;
};

type FeedLink = {
  title: string;
  messageURL: string;
  picURL?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseFeedLinks = (value: unknown): FeedLink[] => {
  let data: unknown = value;

  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) {
      throw new Error('feed_links_json 不能为空');
    }
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      throw new Error('feed_links_json 必须是合法 JSON 数组');
    }
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('feed_links_json 必须是非空数组');
  }

  return data.map((item, idx) => {
    if (!isRecord(item)) {
      throw new Error(`feed_links_json[${idx}] 必须是对象`);
    }

    const title = getRequiredString(item.title, `feed_links_json[${idx}].title`);
    const messageURL = getRequiredString(
      item.messageURL ?? item.messageUrl ?? item.message_url,
      `feed_links_json[${idx}].messageURL`
    );

    const picURL = getOptionalString(item.picURL ?? item.picUrl ?? item.pic_url);

    return {
      title,
      messageURL,
      ...(picURL ? { picURL } : {})
    };
  });
};

const buildSignedUrl = (hookUrl: string, secret: string): string => {
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');

  const url = new URL(hookUrl);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);

  return url.toString();
};

export const sendDingtalkMessage = async ({
  hook_url,
  secret,
  msgtype,
  payload
}: {
  hook_url: unknown;
  secret?: unknown;
  msgtype: string;
  payload: Record<string, unknown>;
}): Promise<DingtalkSendResponse> => {
  try {
    const hookUrl = getRequiredString(hook_url, 'hook_url');
    const secretText = getOptionalString(secret);
    const finalUrl = secretText ? buildSignedUrl(hookUrl, secretText) : hookUrl;

    const res = await fetch(finalUrl, {
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
      isRecord(responseData) && typeof responseData.errcode === 'number'
        ? responseData.errcode === 0
        : res.ok;

    const responseErrMsg =
      isRecord(responseData) && typeof responseData.errmsg === 'string'
        ? responseData.errmsg
        : undefined;

    return {
      result: {
        success: isApiSuccess,
        msgtype,
        signed: Boolean(secretText),
        response: responseData,
        error: isApiSuccess ? undefined : responseErrMsg || `请求失败，HTTP ${res.status}`
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '发送失败';

    return {
      result: {
        success: false,
        msgtype,
        signed: Boolean(getOptionalString(secret)),
        error: message
      }
    };
  }
};
