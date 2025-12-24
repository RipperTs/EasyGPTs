import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getAIApi } from '../../../ai/config';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
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
    return {
      [NodeOutputKeyEnum.sql]: '',
      [NodeOutputKeyEnum.error]: 'LLM model not found'
    };
  }

  if (!nl2sqlDatabaseSchema) {
    return {
      [NodeOutputKeyEnum.sql]: '',
      [NodeOutputKeyEnum.error]: 'Database schema is empty'
    };
  }

  if (!userChatInput) {
    return {
      [NodeOutputKeyEnum.sql]: '',
      [NodeOutputKeyEnum.error]: 'Question is empty'
    };
  }

  const finalSystemPrompt = systemPrompt?.trim() || PROMPT_NL2SQL_SYSTEM;
  const currentDate = formatDateYYYYMMDD(new Date());

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

  console.log('生成的NL2SQL提示词：');
  console.log(userPrompt);

  const messages: any[] = [
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
      messages,
      stream: false
    });

    tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));

    const raw = response.choices?.[0]?.message?.content || '';
    const sql = extractSqlFromModelOutput(raw);

    if (!sql) {
      return {
        [NodeOutputKeyEnum.sql]: '',
        [NodeOutputKeyEnum.error]: 'Empty SQL output',
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          model: llmModel.model,
          tokens,
          query: userChatInput,
          databaseSchema: nl2sqlDatabaseSchema,
          relationFields,
          systemPrompt: finalSystemPrompt,
          userPrompt,
          rawResponse: raw
        }
      };
    }

    const { totalPoints, modelName } = formatModelChars2Points({
      model: llmModel.model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    return {
      [NodeOutputKeyEnum.sql]: sql,
      [NodeOutputKeyEnum.error]: '',
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: userChatInput,
        databaseSchema: nl2sqlDatabaseSchema,
        relationFields,
        systemPrompt: finalSystemPrompt,
        userPrompt,
        rawResponse: raw
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

    return {
      [NodeOutputKeyEnum.sql]: '',
      [NodeOutputKeyEnum.error]: errText,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: userChatInput,
        databaseSchema: nl2sqlDatabaseSchema,
        relationFields,
        systemPrompt: finalSystemPrompt,
        userPrompt,
        error: errText
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
