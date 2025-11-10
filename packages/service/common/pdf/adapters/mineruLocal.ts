import { PdfParseInput, PdfParseResult } from '../types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function parseWithMineruLocal(input: PdfParseInput): Promise<PdfParseResult> {
  const { buffer, filename, requestUrl, apiKey, embedImages = true, extra } = input;

  if (!requestUrl) throw new Error('MinerU Local: 缺少 requestUrl 配置');
  const base = requestUrl.replace(/\/$/, '');

  const start = Date.now();

  const form = new FormData();
  const blob = new Blob([buffer], { type: 'application/pdf' });
  form.append('pdf_file', blob, filename);

  const headers: Record<string, string> = {};
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const submitUrl = `${base}/pdf_parse?parse_method=auto&is_json_md_dump=false&output_dir=.%2Foutput`;

  const maxSubmitRetries = 3;
  let submitRetry = 0;
  let resp: Response | undefined;

  while (submitRetry < maxSubmitRetries) {
    try {
      resp = await fetch(submitUrl, {
        method: 'POST',
        headers,
        body: form,
        // @ts-ignore
        duplex: 'half'
      });
      if (resp.status === 202 || resp.ok) break;
      submitRetry++;
      if (submitRetry >= maxSubmitRetries)
        throw new Error(`提交PDF解析任务失败: HTTP ${resp.status}`);
      await sleep(3000);
    } catch (e: any) {
      submitRetry++;
      if (submitRetry >= maxSubmitRetries)
        throw new Error(`提交PDF解析任务异常: ${e?.message || e}`);
      await sleep(5000);
    }
  }

  if (!resp) throw new Error('提交PDF解析任务失败: 未返回响应');
  const taskData = (await resp.json().catch(() => ({}))) as Record<string, any>;
  const taskId = (taskData as any)?.task_id || (taskData as any)?.taskId || (taskData as any)?.id;
  if (!taskId) throw new Error('提交任务成功但未返回任务ID');

  const pollInterval = 5000;
  const maxErrorRetries = 3;
  let errorRetry = 0;

  while (true) {
    try {
      const statusResp = await fetch(`${base}/task/${taskId}`, { headers });
      if (!statusResp.ok) {
        errorRetry++;
        if (errorRetry >= maxErrorRetries)
          throw new Error(`查询任务状态失败: HTTP ${statusResp.status}`);
        await sleep(pollInterval);
        continue;
      }
      errorRetry = 0;
      const statusData = (await statusResp.json()) as Record<string, any>;
      const status = (statusData as any)?.status || (statusData as any)?.state;
      if (status === 'completed' || status === 'success' || status === 'done') {
        const result = (statusData as any)?.result || {};
        const markdown = (result as any)?.markdown || (result as any)?.md || '';
        if (!markdown) throw new Error('解析文件失败，未找到markdown内容');

        const end = Date.now();
        return {
          markdown: markdown,
          page: result?.page ?? null,
          duration: (end - start) / 1000,
          raw: statusData
        };
      }
      if (status === 'failed' || status === 'error') {
        throw new Error(statusData?.error || '解析文件失败');
      }
      await sleep(pollInterval);
    } catch (e: any) {
      errorRetry++;
      if (errorRetry >= maxErrorRetries) throw new Error(`查询任务状态异常: ${e?.message || e}`);
      await sleep(pollInterval);
    }
  }
}
