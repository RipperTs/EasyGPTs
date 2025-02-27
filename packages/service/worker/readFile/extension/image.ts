import { ReadRawTextByBuffer, ReadFileResponse } from '../type';
import { readConfigData } from '../../../../../projects/app/src/service/common/system';
import json5 from 'json5';

export const readImageRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const base64Image = buffer.toString('base64');

  // 读取配置文件获取配置
  const configContent = readConfigData('config.json');
  const config = json5.parse(configContent);
  const ocrModel = config?.ocrModel?.model || 'Qwen/Qwen2-VL-72B-Instruct';

  // 从配置文件中获取 API URL 和 Key
  const baseUrl = config?.systemEnv?.oneapiUrl || 'http://10.6.80.35:3800/v1';
  const apiKey =
    config?.systemEnv?.chatApiKey || 'sk-P6BDiC6jdmKGvwlTF64f0dD7F531436fA8254a2589973aE0';

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

  // 直接使用 fetch 调用 API
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: ocrModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Image}`,
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
    })
  });

  const result = await response.json();
  const rawText = result.choices[0].message.content || '';

  return {
    rawText
  };
};
