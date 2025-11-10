import { uploadMongoImg } from '../image/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';

import { WorkerNameEnum, runWorker } from '../../../worker/utils';
import fs from 'fs';
import type { ReadFileResponse, ImageType } from '../../../worker/readFile/type';
import { getOcrModelAsync } from '../../../core/ai/model';
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
  pdfModel?: string;
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
    ocrModel: params.ocrModel,
    pdfModel: params.pdfModel
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
  ocrModel,
  pdfModel
}: {
  isQAImport?: boolean;
  extension: string;
  teamId: string;
  buffer: Buffer;
  encoding: string;
  metadata?: Record<string, any>;
  ocrModel?: string;
  pdfModel?: string;
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

  // PDF：优先使用内部 PDF 解析（显式设置了 pdfModel）；失败或未设置则走本地解析
  if (extension === 'pdf') {
    if (pdfModel) {
      try {
        const { parsePdfByType } = await import('../../pdf/parser');
        const parsed = await parsePdfByType({ buffer, filename: 'file.pdf', model: pdfModel });
        const rawText = parsed.markdown || '';
        const { text, imageList } = matchMdImgTextAndUpload(rawText);
        return { rawText: text, formatText: rawText, imageList };
      } catch (err) {
        addLog.warn(`Internal PDF parser failed, fallback to local. ${err}`);
      }
    }
  }

  // 统一走本地 worker 解析
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
  let { rawText, formatText, imageList } = workerRes;

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
