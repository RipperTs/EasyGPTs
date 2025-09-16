import { ReadRawTextByBuffer, ReadFileResponse } from '../type.d';

export const readImageRawText = async ({
  buffer
}: ReadRawTextByBuffer): Promise<ReadFileResponse> => {
  const base64Image = buffer.toString('base64');

  // 通过本地 HTTP 接口获取 OCR 配置（避免在 worker 中直接依赖数据库）
  const port = process.env.PORT || '3000';
  const base = `http://127.0.0.1:${port}`;
  let ocrModel = '';
  let baseUrl = '';
  let apiKey = '';

  try {
    const headers: Record<string, string> = {};
    if (process.env.ROOT_KEY) headers['rootkey'] = process.env.ROOT_KEY as string;
    const confRes = await fetch(`${base}/api/model-config/ocr/active`, {
      method: 'GET',
      headers
    });
    if (confRes.ok) {
      const conf = (await confRes.json()) as {
        model?: string;
        requestUrl?: string;
        requestAuth?: string;
      } | null;
      if (conf) {
        ocrModel = conf.model || '';
        baseUrl = conf.requestUrl || '';
        apiKey = conf.requestAuth || '';
      }
    }
  } catch (e) {}

  if (!ocrModel || !baseUrl || !apiKey) {
    throw new Error('OCR 模型未配置');
  }

  if (!baseUrl || !apiKey) {
    throw new Error('API URL or Key is not set');
  }

  const prompt = `请识别图片中的内容，注意以下要求：
对于数学公式和普通文本：
1. 所有数学公式和数学符号都必须使用标准的LaTeX格式
2. 行内公式使用单个$符号包裹，如：$x^2$
3. 独立公式块使用两个$$符号包裹，如：$$\\sum_{i=1}^n i^2$$
4. 普通文本保持原样，不要使用LaTeX格式
5. 保持原文的段落格式和换行
6. 明显的换行使用\\n表示
7. 确保所有数学符号都被正确包裹在$或$$中

对于手写体文本:
1. 请尽量保持原文的格式，不要进行任何修改
2. 不要使用LaTeX格式
3. 对于无法识别的字符，请使用[UNK]表示
4. 不要使用任何额外的标记或符号

对于表格识别：
1. 保持表格的结构和布局, 使用Markdown表格格式
2. 对于表格中的每个单元格内容，准确转录文本
3. 对于跨行或跨列的单元格，适当合并
4. 保持原始文本的格式（如粗体、斜体等）

不要输出任何额外的解释或说明`;

  // 创建 AbortController 用于超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 180000); // 180秒超时

  try {
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
      }),
      signal: controller.signal
    });

    const result = await response.json();
    const rawText = result.choices[0].message.content || '';

    return {
      rawText
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('OCR 请求超时 (180秒)');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};
