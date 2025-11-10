import { PdfParseInput, PdfParseResult } from '../types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Doc2x v2 解析流程：
 * 1) 预上传获取 uid 与预签名上传 URL（POST /api/v2/parse/preupload）
 * 2) 直传 PDF 至预签名 URL（PUT）
 * 3) 轮询解析状态获取页面 md（GET /api/v2/parse/status?uid=）
 * 4) 拼接 markdown，并返回统一结构
 */
type Doc2xPreuploadResp = {
  code?: string;
  data?: { url?: string; uid?: string };
};

type Doc2xStatusResp = {
  code?: string;
  data?: {
    status?: string;
    error?: string;
    result?: { pages?: Array<{ md?: string }> };
  };
};

export async function parseWithDoc2xV2(input: PdfParseInput): Promise<PdfParseResult> {
  const { buffer, filename, requestUrl, apiKey, embedImages = true } = input;

  const base = (requestUrl || 'https://v2.doc2x.noedgeai.com').replace(/\/$/, '');
  if (!apiKey) throw new Error('Doc2x: 缺少 apiKey');

  const start = Date.now();

  // 1) 预上传，获取 uid 与预签名 URL
  const preuploadResp = await fetch(`${base}/api/v2/parse/preupload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    }
  });
  if (!preuploadResp.ok) {
    throw new Error(`Doc2x 预上传失败: HTTP ${preuploadResp.status} ${await preuploadResp.text()}`);
  }
  const preuploadData = (await preuploadResp
    .json()
    .catch(() => ({}))) as unknown as Doc2xPreuploadResp;
  if (preuploadData.code !== 'success' && preuploadData.code !== 'ok') {
    throw new Error(`Doc2x 预上传返回异常: ${JSON.stringify(preuploadData)}`);
  }

  const uploadUrl: string | undefined = preuploadData?.data?.url;
  const uid: string | undefined = preuploadData?.data?.uid;
  if (!uploadUrl || !uid) {
    throw new Error('Doc2x 预上传未返回有效的 url 或 uid');
  }

  // 2) 直传文件到预签名 URL
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' });
  const uploadResp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/pdf'
    },
    body: pdfBlob,
    // @ts-ignore Node18+ duplex for fetch streaming body
    duplex: 'half'
  });
  if (!uploadResp.ok) {
    throw new Error(`Doc2x 文件上传失败: HTTP ${uploadResp.status} ${uploadResp.statusText}`);
  }

  // 3) 轮询解析状态
  const pollInterval = 4000;
  const maxRetry = 25; // ~100s
  let retry = 0;
  let lastStatus: string | undefined;
  let resultData: Doc2xStatusResp['data'] | undefined;

  while (retry < maxRetry) {
    const statusResp = await fetch(`${base}/api/v2/parse/status?uid=${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    });
    if (!statusResp.ok) {
      retry++;
      await sleep(pollInterval);
      continue;
    }
    const statusJson = (await statusResp.json().catch(() => ({}))) as unknown as Doc2xStatusResp;
    if (!['ok', 'success'].includes(statusJson?.code || '')) {
      // 非成功码，继续等待
      retry++;
      await sleep(pollInterval);
      continue;
    }
    lastStatus = statusJson?.data?.status;
    if (lastStatus === 'success') {
      resultData = statusJson?.data;
      break;
    }
    if (lastStatus === 'failed' || lastStatus === 'error') {
      throw new Error(statusJson?.data?.error || 'Doc2x 解析失败');
    }
    await sleep(pollInterval);
    retry++;
  }

  if (!resultData) {
    throw new Error(`Doc2x 解析超时或状态异常: ${lastStatus || 'unknown'}`);
  }

  // 4) 拼接 markdown
  const pages: Array<{ md?: string }> = Array.isArray(resultData?.result?.pages)
    ? (resultData?.result?.pages as Array<{ md?: string }>)
    : [];
  let markdown = pages.map((p) => p?.md || '').join('\n');

  // 简单清洗：
  markdown = markdown
    .replace(/\\[\(\)]/g, '$')
    .replace(/\\[\[\]]/g, '$$')
    .replace(/<!--\s*Media\s*-->/g, '')
    .replace(/<!--\s*Footnote\s*-->/g, '')
    .replace(/<img\s+src="([^"]+)"[^>]*>/g, '![img]($1)');

  if (!embedImages) {
    // 去除图片引用
    markdown = markdown.replace(/!\[[^\]]*\]\([^\)]*\)/g, '');
  }

  const end = Date.now();

  return {
    markdown,
    page: Array.isArray(pages) ? pages.length : null,
    duration: (end - start) / 1000,
    raw: resultData
  };
}
