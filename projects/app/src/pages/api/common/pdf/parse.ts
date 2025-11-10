import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { jsonRes } from '@fastgpt/service/common/response';
import { getUploadModel } from '@fastgpt/service/common/file/multer';
import { readFileSync } from 'fs';
import { removeFilesByPaths } from '@fastgpt/service/common/file/utils';
import type { PdfParserType } from '@fastgpt/service/common/pdf/types';
import { parsePdfByType } from '@fastgpt/service/common/pdf/parser';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const filePaths: string[] = [];
  try {
    const upload = getUploadModel({ maxSize: 100 });
    const { file, data } = await upload.doUpload<{
      parserType?: PdfParserType;
      model?: string;
      embedImages?: boolean;
    }>(req, res);

    const buffer = readFileSync(file.path);
    filePaths.push(file.path);
    const { parserType, model, embedImages } = data || {};

    const result = await parsePdfByType({
      buffer,
      filename: file.originalname,
      type: parserType,
      model,
      embedImages
    });

    jsonRes(res, { data: result });
  } catch (error) {
    jsonRes(res, { code: 500, error });
  }
  removeFilesByPaths(filePaths);
}

export default NextAPI(handler);

export const config = {
  api: {
    bodyParser: false
  }
};
