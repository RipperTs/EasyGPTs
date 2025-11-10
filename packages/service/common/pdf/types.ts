export type PdfParserType = 'mineru' | 'doc2x' | 'mineru-local';

export type PdfParseResult = {
  markdown: string;
  page?: number | null;
  duration?: number;
  raw?: any;
};

export type PdfParserConfig = {
  baseUrl: string;
  apiKey?: string;
  defaultConfig?: Record<string, any>;
};

export type PdfParseInput = {
  buffer: Buffer;
  filename: string;
  type: PdfParserType;
  requestUrl?: string; // prefer override
  apiKey?: string;
  embedImages?: boolean; // adapter specific behavior
  extra?: Record<string, any>;
};
