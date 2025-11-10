export type PdfParserType = 'mineru' | 'doc2x' | 'mineru-local';

export async function parsePdfFile({
  file,
  parserType,
  model,
  embedImages
}: {
  file: File;
  parserType?: PdfParserType;
  model?: string;
  embedImages?: boolean;
}) {
  const form = new FormData();
  form.append('file', file);
  form.append(
    'data',
    JSON.stringify({
      parserType,
      model,
      embedImages
    })
  );

  const resp = await fetch('/api/common/pdf/parse', {
    method: 'POST',
    body: form
  });
  if (!resp.ok) throw new Error(`解析失败: HTTP ${resp.status}`);
  const json = await resp.json();
  if (json?.code && json.code !== 200) throw new Error(json?.error || '解析失败');
  return json.data as { markdown: string; page?: number; duration?: number };
}
