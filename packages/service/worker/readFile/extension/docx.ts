import mammoth from 'mammoth';
import { ReadRawTextByBuffer, ReadFileResponse, ImageType } from '../type';
import { html2md } from '../../htmlStr2Md/utils';
import fs from 'fs';
import path from 'path';
import { getNanoid } from '@fastgpt/global/common/string/tools';

/**
 * read docx to markdown
 */
export const readDocsFile = async ({
  buffer,
  teamId
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  try {
    const imageList: ImageType[] = [];

    // 创建图片保存目录
    const imgDir = path.join(process.cwd(), 'public/images', teamId);
    if (!fs.existsSync(imgDir)) {
      fs.mkdirSync(imgDir, { recursive: true });
    }

    // 自定义图片处理器
    const options = {
      convertImage: mammoth.images.imgElement(async (image) => {
        // 读取图片数据
        const imageBuffer = await image.read();
        // 生成唯一ID作为占位符
        const uuid = `IMAGE_${getNanoid(12)}_IMAGE`;
        // 获取MIME类型
        const mime = image.contentType;

        // 将图片转为base64格式
        const uint8Array = new Uint8Array(imageBuffer);
        const base64 = Buffer.from(uint8Array).toString('base64');

        // 添加到imageList
        imageList.push({
          uuid,
          base64,
          mime
        });

        // 返回uuid作为占位符
        return {
          src: uuid
        };
      })
    };

    const { value: html } = await mammoth.convertToHtml(
      {
        buffer
      },
      options
    );

    const rawText = html2md(html);

    return {
      rawText,
      imageList
    };
  } catch (error) {
    console.log('error doc read:', error);
    return Promise.reject('Can not read doc file, please convert to PDF');
  }
};
