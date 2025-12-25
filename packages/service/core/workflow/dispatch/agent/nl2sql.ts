import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getAIApi } from '../../../ai/config';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { PROMPT_NL2SQL_SYSTEM } from '@fastgpt/global/core/ai/prompt/nl2sql';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.nl2sqlUserPrompt]?: string;
  [NodeInputKeyEnum.nl2sqlDatabaseSchema]: string;
  [NodeInputKeyEnum.nl2sqlRelationFields]?: string;
  [NodeInputKeyEnum.userChatInput]: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.sql]: string;
  [NodeOutputKeyEnum.error]: string;
}>;

const buildErrorResponse = (
  error: string,
  extra?: {
    query?: string;
    pluginOutput?: Record<string, unknown>;
    nodeInputs?: Record<string, unknown>;
    nodeOutputs?: Record<string, unknown>;
  }
): Response => {
  const pluginOutput = extra?.pluginOutput || { sql: '', error };

  return {
    [NodeOutputKeyEnum.sql]: '',
    [NodeOutputKeyEnum.error]: error,
    [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      query: extra?.query,
      errorText: error,
      error: { message: error },
      pluginOutput,
      textOutput: error,
      nodeInputs: extra?.nodeInputs,
      nodeOutputs: extra?.nodeOutputs
    }
  };
};

const extractSqlFromModelOutput = (raw: string) => {
  const text = raw.trim();
  if (!text) return '';

  const fenced = text.match(/```(?:sql)?\s*([\s\S]*?)\s*```/i)?.[1];
  const withoutFence = (fenced ?? text).trim();

  const withoutLabel = withoutFence.replace(/^sql\s*[:：]\s*/i, '').trim();
  const unquoted =
    (withoutLabel.startsWith('"') && withoutLabel.endsWith('"')) ||
    (withoutLabel.startsWith("'") && withoutLabel.endsWith("'"))
      ? withoutLabel.slice(1, -1).trim()
      : withoutLabel;

  const firstSqlIndex = unquoted.search(
    /\b(select|with|insert|update|delete|create|drop|pragma)\b/i
  );
  return (firstSqlIndex >= 0 ? unquoted.slice(firstSqlIndex) : unquoted).trim();
};

const formatDateYYYYMMDD = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const PROMPT_NL2SQL_TIME_RANGE_RULES_EN = `Time range interpretation rules (when the user question contains fuzzy/relative time expressions, you MUST convert them into explicit dates or date ranges before writing SQL; date format MUST be YYYY-MM-DD). Use the "current date" provided in the prompt as the reference date:
- "最近" = last 1 month (treat as past 30 days, inclusive of today)
- "本周" = current week (Monday to Sunday)
- "上周" = previous week (Monday to Sunday)
- "本月" = current month (1st to last day of month)
- "上月"/"上个月" = previous month (1st to last day of month)
- "今天" = today
- "昨天" = yesterday (today - 1 day)
- "前天" = the day before yesterday (today - 2 days)
- "近7天"/"最近一周" = past 7 days (inclusive of today)
- "近30天"/"最近30天" = past 30 days (inclusive of today)
- "今年" = current year (Jan 1 to Dec 31)
- "去年" = last year (Jan 1 to Dec 31)

Additional:
- "N天前" = N days before today (e.g. "7天前")
- For date ranges, prefer \`BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD'\` (inclusive) or equivalent \`>=\`/\`<=\`.`;

export async function dispatchNL2SQL({
  user,
  node,
  params: {
    model,
    systemPrompt,
    nl2sqlUserPrompt,
    nl2sqlDatabaseSchema,
    nl2sqlRelationFields,
    userChatInput
  }
}: Props): Promise<Response> {
  const llmModel = getLLMModel(model);

  if (!llmModel) {
    return buildErrorResponse('LLM model not found');
  }

  if (!nl2sqlDatabaseSchema) {
    return buildErrorResponse('Database schema is empty');
  }

  if (!userChatInput) {
    return buildErrorResponse('Question is empty');
  }

  const now = new Date();
  const currentDate = formatDateYYYYMMDD(now);
  const baseSystemPrompt = (systemPrompt?.trim() || PROMPT_NL2SQL_SYSTEM).trim();
  const finalSystemPrompt = `${baseSystemPrompt}\n\n${PROMPT_NL2SQL_TIME_RANGE_RULES_EN}\n`;

  const extraRules = nl2sqlUserPrompt?.trim();
  const relationFields = nl2sqlRelationFields?.trim();

  const userPrompt = `Your task is to convert a question into a SQL query, given a Postgres database schema.

Adhere to these rules:
- if you cannot answer the question with the available database schema, return 'I do not know'
- recall that the current date in YYYY-MM-DD format is ${currentDate}
${extraRules ? `${extraRules}\n` : ''}

DDL statements:
${nl2sqlDatabaseSchema}
${relationFields ? `\n${relationFields}` : ''}


The following SQL query best answers the question: \`${userChatInput}\`:
`;

  const messages: ChatCompletionMessageParam[] = [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: finalSystemPrompt
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: userPrompt
    }
  ];

  const ai = getAIApi({
    userKey: user.openaiAccount,
    timeout: 480000
  });

  let tokens = 0;
  try {
    const response = await ai.chat.completions.create({
      model: llmModel.model,
      temperature: 0.01,
      messages: messages as SdkChatCompletionMessageParam[],
      stream: false
    });

    tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));

    const raw = response.choices?.[0]?.message?.content || '';
    const sql = extractSqlFromModelOutput(raw);

    if (!sql) {
      return buildErrorResponse('Empty SQL output', {
        query: userChatInput,
        pluginOutput: { sql: '', error: 'Empty SQL output', userPrompt },
        nodeInputs: {
          systemPrompt: finalSystemPrompt,
          userPrompt,
          databaseSchema: nl2sqlDatabaseSchema,
          relationFields
        },
        nodeOutputs: {
          model: llmModel.model,
          tokens,
          rawResponse: raw
        }
      });
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: llmModel.model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    const pluginOutput = { sql, error: '', userPrompt };

    return {
      [NodeOutputKeyEnum.sql]: sql,
      [NodeOutputKeyEnum.error]: '',
      [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: userChatInput,
        nodeInputs: {
          systemPrompt: finalSystemPrompt,
          userPrompt,
          databaseSchema: nl2sqlDatabaseSchema,
          relationFields
        },
        nodeOutputs: {
          rawResponse: raw
        },
        pluginOutput,
        textOutput: sql
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
    const errText = getErrText(error, 'NL2SQL error');

    const { totalPoints, modelName } = formatModelChars2Points({
      model: llmModel.model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    const pluginOutput = { sql: '', error: errText, userPrompt };

    return {
      [NodeOutputKeyEnum.sql]: '',
      [NodeOutputKeyEnum.error]: errText,
      [DispatchNodeResponseKeyEnum.toolResponses]: pluginOutput,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: userChatInput,
        errorText: errText,
        error: { message: errText },
        nodeInputs: {
          systemPrompt: finalSystemPrompt,
          userPrompt,
          databaseSchema: nl2sqlDatabaseSchema,
          relationFields
        },
        pluginOutput,
        textOutput: errText
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
        tokens > 0
          ? [
              {
                moduleName: node.name,
                totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
                model: modelName,
                tokens
              }
            ]
          : []
    };
  }
}
