import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type.d';
import { getAIApi } from '../config';
import { countGptMessagesTokens } from '../../../common/string/tiktoken/index';
import { loadRequestMessages } from '../../chat/utils';
import {
  PROMPT_QUESTION_GUIDE,
  PROMPT_QUESTION_GUIDE_FOOTER
} from '@fastgpt/global/core/ai/prompt/agent';

export async function createQuestionGuide({
  messages,
  model,
  customPrompt
}: {
  messages: ChatCompletionMessageParam[];
  model: string;
  customPrompt?: string;
}) {
  const concatMessages: ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: 'user',
      content: `${customPrompt || PROMPT_QUESTION_GUIDE}\n${PROMPT_QUESTION_GUIDE_FOOTER}`
    }
  ];

  const ai = getAIApi({
    timeout: 480000
  });
  const data = await ai.chat.completions.create({
    model: model,
    temperature: 0.6,
    max_tokens: 500,
    messages: await loadRequestMessages({
      messages: concatMessages,
      useVision: false
    }),
    stream: false,
    // 启用结构化输出内容, 尽可能避免json解析错误
    response_format: {
      type: 'json_object'
    }
  });

  const answer = data.choices?.[0]?.message?.content || '';

  const start = answer.indexOf('[');
  const end = answer.lastIndexOf(']');

  const tokens = await countGptMessagesTokens(concatMessages);

  if (start === -1 || end === -1) {
    return {
      result: [],
      tokens: 0
    };
  }

  const jsonStr = answer
    .substring(start, end + 1)
    .replace(/(\\n|\\)/g, '')
    .replace(/  /g, '');

  try {
    return {
      result: JSON.parse(jsonStr),
      tokens
    };
  } catch (error) {
    return {
      result: [],
      tokens: 0
    };
  }
}
