import crypto from 'crypto';

type DingtalkMsgType = 'text' | 'link' | 'markdown' | 'actionCard' | 'feedCard';

type Props = {
  hook_url: string;
  secret?: string;
  body: unknown;
};

type Response = {
  result: {
    success: boolean;
    msgtype?: string;
    signed: boolean;
    response?: unknown;
    error?: string;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toRecord = (value: unknown, field: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`${field} 必须是对象`);
  }
  return value;
};

const toString = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} 必须是非空字符串`);
  }
  return value;
};

const getOptionalString = (value: unknown): string => {
  return typeof value === 'string' ? value.trim() : '';
};

const parseBody = (body: unknown): Record<string, unknown> => {
  if (typeof body === 'string') {
    const text = body.trim();
    if (!text) {
      throw new Error('body 不能为空');
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return toRecord(parsed, 'body');
    } catch {
      throw new Error('body 字符串必须是合法 JSON');
    }
  }

  return toRecord(body, 'body');
};

const validateAt = (value: unknown) => {
  if (!isRecord(value)) return;

  const { atMobiles, atUserIds, isAtAll } = value;
  if (atMobiles !== undefined) {
    if (!Array.isArray(atMobiles) || !atMobiles.every((item) => typeof item === 'string')) {
      throw new Error('at.atMobiles 必须是字符串数组');
    }
  }
  if (atUserIds !== undefined) {
    if (!Array.isArray(atUserIds) || !atUserIds.every((item) => typeof item === 'string')) {
      throw new Error('at.atUserIds 必须是字符串数组');
    }
  }
  if (isAtAll !== undefined && typeof isAtAll !== 'boolean') {
    throw new Error('at.isAtAll 必须是布尔值');
  }
};

const validateText = (body: Record<string, unknown>) => {
  const text = toRecord(body.text, 'text');
  toString(text.content, 'text.content');
};

const validateLink = (body: Record<string, unknown>) => {
  const link = toRecord(body.link, 'link');
  toString(link.title, 'link.title');
  toString(link.text, 'link.text');
  toString(link.messageUrl, 'link.messageUrl');
};

const validateMarkdown = (body: Record<string, unknown>) => {
  const markdown = toRecord(body.markdown, 'markdown');
  toString(markdown.title, 'markdown.title');
  toString(markdown.text, 'markdown.text');
};

const validateActionCard = (body: Record<string, unknown>) => {
  const actionCard = toRecord(body.actionCard, 'actionCard');
  toString(actionCard.title, 'actionCard.title');
  toString(actionCard.text, 'actionCard.text');
};

const validateFeedCard = (body: Record<string, unknown>) => {
  const feedCard = toRecord(body.feedCard, 'feedCard');
  const links = feedCard.links;
  if (!Array.isArray(links) || links.length === 0) {
    throw new Error('feedCard.links 必须是非空数组');
  }
  for (const item of links) {
    const link = toRecord(item, 'feedCard.links[]');
    toString(link.title, 'feedCard.links[].title');
    toString(link.messageURL, 'feedCard.links[].messageURL');
  }
};

const validateByMsgType = (msgtype: string, body: Record<string, unknown>) => {
  validateAt(body.at);

  const checkerMap: Record<DingtalkMsgType, (payload: Record<string, unknown>) => void> = {
    text: validateText,
    link: validateLink,
    markdown: validateMarkdown,
    actionCard: validateActionCard,
    feedCard: validateFeedCard
  };

  if (msgtype in checkerMap) {
    checkerMap[msgtype as DingtalkMsgType](body);
  }
};

const buildSignedUrl = (hookUrl: string, secret: string) => {
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');

  const url = new URL(hookUrl);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);

  return url.toString();
};

const main = async ({ hook_url, secret, body }: Props): Promise<Response> => {
  try {
    const hookUrl = toString(hook_url, 'hook_url');
    const parsedBody = parseBody(body);

    const msgtype = toString(parsedBody.msgtype, 'msgtype');
    validateByMsgType(msgtype, parsedBody);

    const secretText = getOptionalString(secret);
    const finalUrl = secretText ? buildSignedUrl(hookUrl, secretText) : hookUrl;

    const res = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(parsedBody)
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
        signed: Boolean(getOptionalString(secret)),
        error: message
      }
    };
  }
};

export default main;
