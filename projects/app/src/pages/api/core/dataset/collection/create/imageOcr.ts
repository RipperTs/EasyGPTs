import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getUploadModel } from '@fastgpt/service/common/upload';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { OpenAI } from 'openai';
import { getSystemConfig } from '@fastgpt/service/common/systemConfig';

type Props = {
  file: Express.Multer.File;
  bucketName: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const upload = getUploadModel({
    maxSize: global.feConfigs?.uploadFileMaxSize
  });

  try {
    const { file, bucketName } = await upload.doUpload<Props>(req, res, BucketNameEnum.dataset);

    if (!file || !bucketName) {
      throw new Error('file is empty');
    }

    await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      per: WritePermissionVal
    });

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

    // 获取识别结果
    const ocrResult = response.choices[0].message.content;

    // 删除临时文件
    require('fs').unlinkSync(file.path);

    return jsonRes(res, {
      data: ocrResult
    });
  } catch (error) {
    console.log(error);
    jsonRes(res, {
      code: 500,
      error: error
    });
  }
}
