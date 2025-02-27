import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getUploadModel } from '@fastgpt/service/common/upload';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { readRawTextByLocalFile } from '@fastgpt/service/common/file/read';
import { splitText2Chunks } from '@fastgpt/global/common/string/textSplit';
import { predictDataLimitLength } from '@fastgpt/global/common/file/text';
import { checkDatasetLimit } from '@/service/support/permission/dataset';
import { uploadFile } from '@fastgpt/service/common/file/upload';
import { removeFilesByPaths } from '@fastgpt/service/common/file/tools';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { OpenAI } from 'openai';
import { getSystemConfig } from '@fastgpt/service/common/systemConfig';

type FileCreateDatasetCollectionParams = {
  datasetId: string;
  trainingType?: `${TrainingModeEnum}`;
  chunkSize?: number;
  chunkSplitter?: string;
  qaPrompt?: string;
  fileMetadata?: Record<string, any>;
  collectionMetadata?: Record<string, any>;
};

type CreateCollectionResponse = Promise<NextApiResponse<any>>;

async function handler(req: NextApiRequest, res: NextApiResponse<any>): CreateCollectionResponse {
  const upload = getUploadModel({
    maxSize: global.feConfigs?.uploadFileMaxSize
  });
  let filePaths: string[] = [];

  try {
    const { file, data, bucketName } = await upload.doUpload<FileCreateDatasetCollectionParams>(
      req,
      res,
      BucketNameEnum.dataset
    );
    filePaths = [file.path];

    if (!file || !bucketName) {
      throw new Error('file is empty');
    }

    const { teamId, tmbId, dataset } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal,
      datasetId: data.datasetId
    });

    const {
      trainingType = TrainingModeEnum.chunk,
      chunkSize = 512,
      chunkSplitter,
      qaPrompt
    } = data;
    const { fileMetadata, collectionMetadata, ...collectionData } = data;
    const collectionName = file.originalname;

    const relatedImgId = getNanoid();

    let rawText = '';

    // 检查是否是图片文件
    if (/\.(jpg|jpeg|png)$/i.test(file.originalname)) {
      // 读取文件内容为 base64
      const fileBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = [];
        const readStream = require('fs').createReadStream(file.path);
        readStream.on('data', (chunk: Buffer) => chunks.push(chunk));
        readStream.on('end', () => resolve(Buffer.concat(chunks)));
        readStream.on('error', reject);
      });
      const base64Image = fileBuffer.toString('base64');

      // 获取系统配置
      const systemConfig = await getSystemConfig();
      const { ocrModel } = systemConfig;

      // 创建 OpenAI 客户端
      const client = new OpenAI({
        apiKey: process.env.CHAT_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL
      });

      const prompt = `请识别图片中的内容，注意以下要求：
对于数学公式和普通文本：
1. 所有数学公式和数学符号都必须使用标准的LaTeX格式
2. 行内公式使用单个$符号包裹，如：$x^2$
3. 独立公式块使用两个$$符号包裹，如：$$\\sum_{i=1}^n i^2$$
4. 普通文本保持原样，不要使用LaTeX格式
5. 保持原文的段落格式和换行
6. 明显的换行使用\\n表示
7. 确保所有数学符号都被正确包裹在$或$$中

不要输出任何额外的解释或说明`;

      // 调用 OpenAI API 进行图片识别
      const response = await client.chat.completions.create({
        model: ocrModel || 'Qwen/Qwen2-VL-72B-Instruct',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:${file.mimetype};base64,${base64Image}`,
                  detail: 'auto'
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }
        ],
        stream: false,
        temperature: 0.0,
        max_tokens: 4096
      });

      rawText = response.choices[0].message.content || '';
    } else {
      // 非图片文件,使用原有的文件读取逻辑
      const result = await readRawTextByLocalFile({
        teamId,
        path: file.path,
        metadata: {
          ...fileMetadata,
          relatedId: relatedImgId
        }
      });
      rawText = result.rawText;
    }

    // 2. upload file
    const fileId = await uploadFile({
      teamId,
      tmbId,
      bucketName,
      path: file.path,
      filename: file.originalname,
      contentType: file.mimetype,
      metadata: fileMetadata
    });

    // 3. delete tmp file
    removeFilesByPaths(filePaths);

    // 4. split raw text to chunks
    const { chunks } = splitText2Chunks({
      text: rawText,
      chunkLen: chunkSize,
      overlapRatio: trainingType === TrainingModeEnum.chunk ? 0.2 : 0,
      customReg: chunkSplitter ? [chunkSplitter] : []
    });

    // 5. check dataset limit
    await checkDatasetLimit({
      teamId,
      insertLen: predictDataLimitLength(trainingType, chunks)
    });

    return jsonRes(res, {
      data: {
        collectionName,
        chunks,
        fileId,
        relatedImgId
      }
    });
  } catch (error) {
    // delete tmp file
    removeFilesByPaths(filePaths);

    jsonRes(res, {
      code: 500,
      error
    });
  }
}

export default handler;
