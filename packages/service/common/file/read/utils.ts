import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import FormData from 'form-data';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import type { ReadFileResponse, ImageType } from '../../../worker/readFile/type';
import { getOcrModelAsync } from '../../../core/ai/model';
import axios from 'axios';
import { addLog } from '../../system/log';
import { batchRun } from '@fastgpt/global/common/fn/utils';
import { addHours } from 'date-fns';
import { matchMdImgTextAndUpload } from '@fastgpt/global/common/string/markdown';
import { detectFileEncoding } from '@fastgpt/global/common/file/tools';

export type readRawTextByLocalFileParams = {
  teamId: string;
  path: string;
  metadata?: Record<string, any>;
  ocrModel?: string;
};
export const readRawTextByLocalFile = async (params: readRawTextByLocalFileParams) => {
  const { path } = params;

  const extension = path?.split('.')?.pop()?.toLowerCase() || '';

  const buffer = fs.readFileSync(path);
  const encoding = detectFileEncoding(buffer);

  const { rawText } = await readRawContentByFileBuffer({
    extension,
    isQAImport: false,
    teamId: params.teamId,
    encoding: encoding,
    buffer,
    metadata: params.metadata,
    ocrModel: params.ocrModel
  });

  return {
    rawText
  };
};

export const readRawContentByFileBuffer = async ({
  extension,
  isQAImport,
  teamId,
  buffer,
  encoding,
  metadata,
  ocrModel
}: {
  isQAImport?: boolean;
  extension: string;
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
  ocrModel?: string;
}) => {
  // 优先使用知识库传入的 OCR 模型；若未设置则尝试读取系统激活的 OCR 模型
  let finalOcrModel = ocrModel || '';
  const isImage = ['jpg', 'jpeg', 'png'].includes((extension || '').toLowerCase());
  if (!finalOcrModel && isImage) {
    try {
      const dbOcr = await getOcrModelAsync();
      finalOcrModel = dbOcr?.model || '';
    } catch (e) {
      // 忽略读取失败，交由后续校验报错
    }
  }

  // Custom read file service
  const customReadfileUrl = process.env.CUSTOM_READ_FILE_URL;
  const customReadFileExtension = process.env.CUSTOM_READ_FILE_EXTENSION || 'pdf';
  const customReadFileServiceType = process.env.CUSTOM_READ_FILE_SERVICE_TYPE || 'simple';
  const ocrParse = process.env.CUSTOM_READ_FILE_OCR || 'false';
  const readFileFromCustomService = async (): Promise<ReadFileResponse | undefined> => {
    if (
      !customReadfileUrl ||
      !customReadFileExtension ||
      !customReadFileExtension.includes(extension)
    )
      return;

    // 如果是PDF文件，先检查页数
    if (extension === 'pdf') {
      try {
        // 使用pdfjs获取页数
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        // @ts-ignore
        await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');

        // 将Buffer转换为Uint8Array
        const uint8Array = new Uint8Array(buffer);

        const loadingTask = pdfjs.getDocument(uint8Array);
        const doc = await loadingTask.promise;
        const numPages = doc.numPages;

        // 释放资源
        loadingTask.destroy();

        // 如果页数超过80页，直接使用本地解析服务
        if (numPages > 80) {
          addLog.warn(
            `PDF has ${numPages} pages, exceeding 80 page limit. Using local parsing service.`
          );
          return;
        }

        addLog.info(`PDF has ${numPages} pages, using external service for parsing.`);
      } catch (error) {
        addLog.error(`Failed to check PDF page count: ${error}. Falling back to external service.`);
      }
    }

    const start = Date.now();
    addLog.info('Parsing files from an external service');

    const data = new FormData();
    data.append('file', buffer, {
      filename: `file.${extension}`
    });
    data.append('extension', extension);
    data.append('ocr', ocrParse);
    data.append('type', customReadFileServiceType);
    const { data: response } = await axios.post<{
      success: boolean;
      message: string;
      data: {
        page: number;
        markdown: string;
        duration: number;
      };
    }>(customReadfileUrl, data, {
      timeout: 1200000,
      headers: {
        ...data.getHeaders()
      }
    });

    addLog.info(`Custom file parsing is complete, time: ${Date.now() - start}ms`);

    const rawText = response.data.markdown;
    const { text, imageList } = matchMdImgTextAndUpload(rawText);

    return {
      rawText: text,
      formatText: rawText,
      imageList
    };
  };

  const customRes = await readFileFromCustomService();
  let rawText: string;
  let formatText: string | undefined;
  let imageList: ImageType[] | undefined;

  if (customRes) {
    ({ rawText, formatText, imageList } = customRes);
  } else {
    if (isImage && !finalOcrModel) {
      throw new Error(
        'OCR 模型未配置，请在“系统设置-模型配置”新增并启用一个 OCR 模型，或在该知识库设置中选择 OCR 模型'
      );
    }
    const workerRes = await runWorker<ReadFileResponse>(WorkerNameEnum.readFile, {
      extension,
      encoding,
      buffer,
      teamId,
      ocrModel: finalOcrModel
    });
    ({ rawText, formatText, imageList } = workerRes);
  }

  // markdown data format
  if (imageList) {
    await batchRun(imageList, async (item) => {
      const src = await uploadMongoImg({
        type: MongoImageTypeEnum.collectionImage,
        base64Img: `data:${item.mime};base64,${item.base64}`,
        teamId,
        expiredTime: addHours(new Date(), 1),
        metadata: {
          ...metadata,
          mime: item.mime
        }
      });
      rawText = rawText.replace(item.uuid, src);
      if (formatText) {
        formatText = formatText.replace(item.uuid, src);
      }
    });
  }

  if (['csv', 'xlsx'].includes(extension)) {
    // qa data
    if (isQAImport) {
      rawText = rawText || '';
    } else {
      rawText = formatText || rawText;
    }
  }

  return { rawText };
};
