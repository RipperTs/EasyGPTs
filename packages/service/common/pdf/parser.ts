import { MongoPDFModel } from '../../core/model/pdfSchema';
import type { PdfParseInput, PdfParseResult, PdfParserType } from './types';
import type { PDFModelSchema } from '@fastgpt/global/core/model/type.d';
import { parseWithMineruLocal } from './adapters/mineruLocal';

type AdapterFn = (input: PdfParseInput) => Promise<PdfParseResult>;

const adapters: Record<PdfParserType, AdapterFn> = {
  'mineru-local': parseWithMineruLocal,
  mineru: async () => {
    throw new Error('mineru 适配器未实现');
  },
  doc2x: async () => {
    throw new Error('doc2x 适配器未实现');
  }
};

export async function parsePdfByType(params: {
  buffer: Buffer;
  filename: string;
  type?: PdfParserType;
  model?: string;
  embedImages?: boolean;
  extra?: Record<string, any>;
}): Promise<PdfParseResult> {
  const { buffer, filename, type, model, embedImages, extra } = params;

  // 1) 大文件直接本地解析（>100 页）
  const pageCount = await getPdfPageCount(buffer).catch(() => 0);
  if (pageCount > 100) {
    const start = Date.now();
    const { readPdfFile } = await import('../../worker/readFile/extension/pdf');
    const local = await readPdfFile({ buffer } as any);
    return {
      markdown: local.rawText || '',
      page: pageCount,
      duration: (Date.now() - start) / 1000
    };
  }

  // 2) 如果未指定模型/类型，则默认走本地解析
  if (!model && !type) {
    const start = Date.now();
    const { readPdfFile } = await import('../../worker/readFile/extension/pdf');
    const local = await readPdfFile({ buffer } as any);
    return {
      markdown: local.rawText || '',
      page: pageCount || null,
      duration: (Date.now() - start) / 1000
    };
  }

  // 读取模型配置：优先按 model，其次按 type，默认取第一个激活模型
  const query: Record<string, unknown> = model
    ? { model }
    : type
      ? { type, isActive: true }
      : { isActive: true };
  const doc = (await MongoPDFModel.findOne(query).lean()) as PDFModelSchema | null;
  if (!doc) {
    // 无匹配配置，回退到本地解析
    const start = Date.now();
    const { readPdfFile } = await import('../../worker/readFile/extension/pdf');
    const local = await readPdfFile({ buffer } as any);
    return {
      markdown: local.rawText || '',
      page: pageCount || null,
      duration: (Date.now() - start) / 1000
    };
  }

  const realType = doc.type as PdfParserType;
  const adapter = adapters[realType];
  if (!adapter) throw new Error(`未匹配到解析适配器: ${realType}`);

  return adapter({
    buffer,
    filename,
    type: realType,
    requestUrl: doc.requestUrl || '',
    apiKey: (doc as any).apiKey || '',
    embedImages,
    extra,
    defaultConfig: (doc as any).defaultConfig || {}
  } as PdfParseInput);
}

async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // @ts-ignore - ensure worker loaded in Node
  await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
  // Use a fresh Uint8Array to avoid detached ArrayBuffer issues
  // Always pass a plain Uint8Array (not Node Buffer)
  const data = Uint8Array.from(buffer);
  const loadingTask = (pdfjs as any).getDocument({ data });
  const doc = await loadingTask.promise;
  const pages = doc.numPages || 0;
  loadingTask.destroy();
  return pages;
}
