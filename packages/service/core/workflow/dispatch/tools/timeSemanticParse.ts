import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getAIApi } from '../../../ai/config';
import { getLLMModel, ModelTypeEnum } from '../../../../core/ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { getErrText } from '@fastgpt/global/common/error/utils';

type ParseType = 'semantic_convert' | 'parse_time';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.timeSemanticParseType]?: ParseType;
  [NodeInputKeyEnum.timeSemanticCurrentTime]?: string;
  [NodeInputKeyEnum.userChatInput]: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.timeSemanticOriginalText]: string;
  [NodeOutputKeyEnum.timeSemanticResult]: string;
  [NodeOutputKeyEnum.error]: string;
}>;

const DEFAULT_SYSTEM_PROMPT = `你是一个“时间语义化解析器”。
你的任务是：基于当前时间，把用户文本中的相对/模糊时间表达解析为具体日期（yyyy-MM-dd），并严格遵守输出格式要求。

时间范围识别规则：
- "最近" = 最近一个月（按过去30天处理，含今天）
- "本周" = 当前周（周一到周日）
- "上周" = 上一周（周一到周日）
- "本月" = 当前月份（1号到月底）
- "上月"/"上个月" = 上一个月（1号到月底）
- "今天" = 当前日期
- "昨天" = 当前日期的前一天
- "前天" = 当前日期的前两天
- "近7天"/"最近一周" = 过去7天（含今天）
- "近30天"/"最近30天" = 过去30天（含今天）
- "今年" = 当前年份1月1日到12月31日
- "去年" = 去年1月1日到12月31日

通用要求：
- 绝对不能改变原句含义；除时间表达的解析外，不得新增/删除/改写其他信息。
- 如果文本不包含任何时间实体：原样返回（semantic_convert）；parse_time 输出 has_time=false 且 ranges 为空数组。
- 所有日期格式必须是 yyyy-MM-dd，范围用 start_date / end_date 表示；单日则 start_date=end_date。`;

const formatDateYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const extractMaybeFencedContent = (raw: string) => {
  const text = raw.trim();
  if (!text) return '';
  return (text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] ?? text).trim();
};

const buildErrorResponse = (
  originalText: string,
  error: string,
  extra?: Record<string, unknown>
) => {
  const pluginOutput = {
    original_text: originalText,
    result: '',
    error,
    ...extra
  };

  return {
    [NodeOutputKeyEnum.timeSemanticOriginalText]: originalText,
    [NodeOutputKeyEnum.timeSemanticResult]: '',
    [NodeOutputKeyEnum.error]: error,
    [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText: error,
      error: { message: error },
      pluginOutput,
      textOutput: error
    }
  };
};

export async function dispatchTimeSemanticParse({
  user,
  node,
  params: { model, systemPrompt, timeSemanticParseType, timeSemanticCurrentTime, userChatInput }
}: Props): Promise<Response> {
  const llmModel = getLLMModel(model);
  if (!llmModel) return buildErrorResponse(userChatInput || '', 'LLM model not found');

  const originalText = userChatInput ?? '';
  if (!originalText.trim()) {
    return buildErrorResponse(originalText, 'Text is empty');
  }

  const parseType: ParseType = timeSemanticParseType || 'semantic_convert';
  const promptNow = timeSemanticCurrentTime?.trim();
  const nowText = promptNow || formatDateYYYYMMDD(new Date());

  const finalSystemPrompt = systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT;

  const userPrompt =
    parseType === 'parse_time'
      ? `当前时间：${nowText}
解析类型：parse_time（解析时间范围）

请输出“严格的 JSON 字符串”，不要包含任何解释、不要使用 Markdown 代码块。
JSON 格式如下：
{"has_time": boolean, "ranges": [{"start_date": "yyyy-MM-dd", "end_date": "yyyy-MM-dd"}]}

要求：
- 可以输出多段 ranges（例如“上周和本周”）。
- 单日：start_date=end_date。
- 如果没有时间实体：{"has_time": false, "ranges": []}

用户文本：
${originalText}`
      : `当前时间：${nowText}
解析类型：semantic_convert（语义解析转换）

请仅输出“转换后的文本”，不要包含任何解释、不要使用 Markdown 代码块。
要求：
- 只对时间表达做解析，把相对/模糊时间替换为具体日期 yyyy-MM-dd；如果是时间范围，用 yyyy-MM-dd~yyyy-MM-dd 表示。
- 除时间表达外，其他内容必须与原文保持一致（不能改写语气、不能增删信息）。
- 如果没有时间实体：原样返回原文本。

用户文本：
${originalText}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: ChatCompletionRequestMessageRoleEnum.System, content: finalSystemPrompt },
    { role: ChatCompletionRequestMessageRoleEnum.User, content: userPrompt }
  ];

  const ai = getAIApi({
    userKey: user.openaiAccount,
    timeout: 480000
  });

  try {
    const response = await ai.chat.completions.create({
      model: llmModel.model,
      temperature: 0.01,
      messages: messages as SdkChatCompletionMessageParam[],
      stream: false
    });

    const tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));
    const raw = response.choices?.[0]?.message?.content || '';
    const resultText = extractMaybeFencedContent(raw);

    if (!resultText) {
      return buildErrorResponse(originalText, 'Empty model output', {
        rawResponse: raw
      });
    }

    let normalizedResult = resultText;
    let parseError = '';

    if (parseType === 'parse_time') {
      try {
        const parsed = JSON.parse(resultText) as unknown;
        normalizedResult = JSON.stringify(parsed);
      } catch (err) {
        parseError = getErrText(err, 'Invalid JSON output');
      }
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: llmModel.model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    const pluginOutput = {
      original_text: originalText,
      result: normalizedResult,
      error: parseError,
      parse_type: parseType,
      now: nowText
    };

    return {
      [NodeOutputKeyEnum.timeSemanticOriginalText]: originalText,
      [NodeOutputKeyEnum.timeSemanticResult]: normalizedResult,
      [NodeOutputKeyEnum.error]: parseError,
      [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: originalText,
        pluginOutput,
        nodeInputs: {
          systemPrompt: finalSystemPrompt,
          parseType,
          now: nowText
        },
        nodeOutputs: {
          rawResponse: raw
        },
        textOutput: normalizedResult
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: [
        {
          moduleName: node.name,
          totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
          model: modelName,
          tokens
        }
      ]
    };
  } catch (error) {
    return buildErrorResponse(originalText, getErrText(error, 'Time semantic parse error'), {
      parse_type: parseType,
      now: nowText
    });
  }
}
