import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getAIApi } from '../../../ai/config';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { ModelTypeEnum, getLLMModel } from '../../../ai/model';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam as OpenAIChatMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.databaseType]: string;
  [NodeInputKeyEnum.databaseHost]: string;
  [NodeInputKeyEnum.databasePort]: string | number;
  [NodeInputKeyEnum.databaseName]: string;
  [NodeInputKeyEnum.databaseUser]: string;
  [NodeInputKeyEnum.databasePassword]: string;
  [NodeInputKeyEnum.databaseSql]: string;
  [NodeInputKeyEnum.databaseMaxRetry]?: number;
  [NodeInputKeyEnum.databaseTimeout]?: number;
}>;

type DatabaseErrorOutput = {
  message: string;
  sql?: string;
  databaseType?: string;
};

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.success]: boolean;
  [NodeOutputKeyEnum.databaseQueryResult]?: unknown;
  [NodeOutputKeyEnum.error]?: DatabaseErrorOutput;
}>;

type QueryConfig = {
  databaseType: string;
  host: string;
  port: string | number;
  databaseName: string;
  user: string;
  password: string;
  sql: string;
  timeoutMs: number;
};

const promiseWithTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void
): Promise<T> => {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        onTimeout && onTimeout();
      } catch (error) {}
      reject(new Error('Database query timeout'));
    }, timeoutMs);

    promise
      .then((res) => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

const executeQuery = async ({
  databaseType,
  host,
  port,
  databaseName,
  user,
  password,
  sql,
  timeoutMs
}: QueryConfig): Promise<unknown> => {
  const portNumber = Number.parseInt(String(port), 10);
  const safePort = Number.isNaN(portNumber)
    ? databaseType.toLowerCase().includes('postgres')
      ? 5432
      : 3306
    : portNumber;

  const type = databaseType.toLowerCase();

  if (type.includes('postgres')) {
    const client = new PgClient({
      host,
      port: safePort,
      database: databaseName,
      user,
      password
    });

    try {
      await client.connect();
      const res = await promiseWithTimeout(client.query(sql), timeoutMs, () => {
        client.end().catch(() => {});
      });
      return res.rows;
    } finally {
      // 防止连接泄漏
      await client.end().catch(() => {});
    }
  }

  if (type.includes('mysql')) {
    const connection = await mysql.createConnection({
      host,
      port: safePort,
      database: databaseName,
      user,
      password
    });

    try {
      const result = await promiseWithTimeout(connection.execute(sql), timeoutMs, () => {
        // destroy 会立即关闭连接，避免长时间占用
        connection.destroy();
      });
      const [rows] = result as [unknown, unknown];
      return rows;
    } finally {
      await connection.end().catch(() => {});
    }
  }

  throw new Error(`Unsupported database type: ${databaseType}`);
};

const buildFixSqlMessages = ({
  databaseType,
  originalSql,
  currentSql,
  errorText
}: {
  databaseType: string;
  originalSql: string;
  currentSql: string;
  errorText: string;
}): any[] => {
  const systemPrompt =
    '你是一名资深数据库工程师，负责根据数据库报错信息自动修复 SQL 语句。' +
    '请只返回可以直接执行的 SQL 语句，不要包含任何解释或多余内容。';

  const userPrompt = `数据库类型: ${databaseType}
原始 SQL:
${originalSql}

本次执行的 SQL:
${currentSql}

报错信息:
${errorText}

请返回一个修复后的 SQL 语句，要求：
- 只返回一条 SQL 语句；
- 不要使用代码块包裹（不要包含\`\`\`）；
- 不要返回任何额外说明文字。`;

  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: systemPrompt
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: userPrompt
    }
  ];
};

const extractSqlFromAnswer = (answer: string): string => {
  if (!answer) return '';

  const trimmed = answer.trim();

  // 尝试从代码块中提取
  const codeBlockMatch = trimmed.match(/```[a-zA-Z]*\s*([\s\S]*?)```/);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  return trimmed;
};

const fixSqlWithAI = async ({
  model,
  databaseType,
  originalSql,
  currentSql,
  errorText,
  aiParams
}: {
  model: string;
  databaseType: string;
  originalSql: string;
  currentSql: string;
  errorText: string;
  aiParams: Parameters<typeof getAIApi>[0];
}): Promise<{
  sql: string;
  tokens: number;
}> => {
  const ai = getAIApi(aiParams);
  const messages = buildFixSqlMessages({
    databaseType,
    originalSql,
    currentSql,
    errorText
  });

  const requestMessages = messages as unknown as OpenAIChatMessageParam[];

  const response = await ai.chat.completions.create({
    model,
    temperature: 0,
    messages: requestMessages
  });

  const answer = response.choices?.[0]?.message?.content || '';
  const fixedSql = extractSqlFromAnswer(answer);

  const completeMessages: ChatCompletionMessageParam[] = [
    ...messages,
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: answer
    }
  ];

  const tokens = await countGptMessagesTokens(completeMessages);

  return {
    sql: fixedSql,
    tokens
  };
};

export const dispatchDatabaseConnector = async (props: Props): Promise<Response> => {
  const {
    user,
    node,
    params: {
      model,
      system_databaseType: databaseType,
      system_databaseHost: host,
      system_databasePort: port,
      system_databaseName: databaseName,
      system_databaseUser: dbUser,
      system_databasePassword: password,
      system_databaseSql: originalSql,
      system_databaseMaxRetry: maxRetryInput,
      system_databaseTimeout: timeoutInput
    }
  } = props;

  if (!databaseType || !host || !port || !databaseName || !dbUser || !password) {
    return Promise.reject('Database connection config is incomplete');
  }
  if (!originalSql) {
    return Promise.reject('SQL is empty');
  }

  const llmModel = getLLMModel(model);
  if (!llmModel) {
    return Promise.reject('LLM model not found');
  }

  const maxRetry =
    typeof maxRetryInput === 'number' && maxRetryInput > 0 && maxRetryInput <= 10
      ? maxRetryInput
      : 3;

  const timeoutRaw = typeof timeoutInput === 'number' ? timeoutInput : Number(timeoutInput ?? NaN);
  const timeoutSec =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0 && timeoutRaw <= 600 ? timeoutRaw : 30;
  const timeoutMs = timeoutSec * 1000;

  const aiParams = {
    userKey: user.openaiAccount,
    timeout: 480000
  } as const;

  let currentSql = originalSql;
  let lastError: unknown;
  let totalTokens = 0;
  let tryCount = 0;

  while (tryCount < maxRetry) {
    try {
      const result = await executeQuery({
        databaseType,
        host,
        port,
        databaseName,
        user: dbUser,
        password,
        sql: currentSql,
        timeoutMs
      });

      const { totalPoints, modelName } = formatModelChars2Points({
        model: llmModel.model,
        tokens: totalTokens,
        modelType: ModelTypeEnum.llm
      });

      return {
        [NodeOutputKeyEnum.success]: true,
        [NodeOutputKeyEnum.databaseQueryResult]: result,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
          model: modelName,
          tokens: totalTokens,
          databaseType,
          databaseHost: host,
          databasePort: port,
          databaseName,
          originalSql,
          executedSql: currentSql,
          tryCount: tryCount + 1,
          databaseTimeout: timeoutSec,
          errorMessage: lastError ? getErrText(lastError) : undefined
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
          totalTokens > 0
            ? [
                {
                  moduleName: node.name,
                  totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
                  model: modelName,
                  tokens: totalTokens
                }
              ]
            : []
      };
    } catch (error) {
      lastError = error;
      tryCount += 1;

      if (tryCount >= maxRetry) {
        const { totalPoints, modelName } = formatModelChars2Points({
          model: llmModel.model,
          tokens: totalTokens,
          modelType: ModelTypeEnum.llm
        });

        const errorOutput: DatabaseErrorOutput = {
          message: getErrText(error, 'Database query error'),
          sql: currentSql,
          databaseType
        };

        return {
          [NodeOutputKeyEnum.success]: false,
          [NodeOutputKeyEnum.error]: errorOutput,
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
            model: modelName,
            tokens: totalTokens,
            databaseType,
            databaseHost: host,
            databasePort: port,
            databaseName,
            originalSql,
            executedSql: currentSql,
            tryCount,
            databaseTimeout: timeoutSec,
            errorMessage: getErrText(error, 'Database query error')
          },
          [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
            totalTokens > 0
              ? [
                  {
                    moduleName: node.name,
                    totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
                    model: modelName,
                    tokens: totalTokens
                  }
                ]
              : []
        };
      }

      // 使用 AI 修复 SQL 后重试
      try {
        const { sql, tokens } = await fixSqlWithAI({
          model: llmModel.model,
          databaseType,
          originalSql,
          currentSql,
          errorText: getErrText(error, 'Database query error'),
          aiParams
        });

        totalTokens += tokens;

        if (!sql || sql.trim() === currentSql.trim()) {
          // AI 无法给出新的 SQL，直接退出循环
          break;
        }

        currentSql = sql;
      } catch (aiError) {
        lastError = aiError;
        // AI 修复失败，直接退出循环
        break;
      }
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: llmModel.model,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  const finalError: DatabaseErrorOutput = {
    message: getErrText(lastError, 'Database query error'),
    sql: currentSql,
    databaseType
  };

  return {
    [NodeOutputKeyEnum.success]: false,
    [NodeOutputKeyEnum.error]: finalError,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      tokens: totalTokens,
      databaseType,
      databaseHost: host,
      databasePort: port,
      databaseName,
      originalSql,
      executedSql: currentSql,
      tryCount,
      databaseTimeout: timeoutSec,
      errorMessage: finalError.message
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
      totalTokens > 0
        ? [
            {
              moduleName: node.name,
              totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
              model: modelName,
              tokens: totalTokens
            }
          ]
        : []
  };
};
