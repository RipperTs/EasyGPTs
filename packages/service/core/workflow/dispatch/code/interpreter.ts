import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { formatHttpError } from '../utils';
import { getAIApi } from '../../../ai/config';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { ModelTypeEnum, getLLMModel } from '../../../ai/model';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import type {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.codeInterpreterMaxRetry]?: number;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.userChatInput]: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.error]: string;
  [NodeOutputKeyEnum.result]: string | string[];
  [NodeOutputKeyEnum.execution_time]: number;
  [NodeOutputKeyEnum.image_url]: string;
  [NodeOutputKeyEnum.files]: string[];
  [NodeOutputKeyEnum.inputs]: string[];
}>;

const DEFAULT_SYSTEM_PROMPT =
  '你是一名资深 Python 工程师，负责把用户的自然语言任务转换为可执行的 Python 代码，并在代码执行器环境中运行。\n' +
  '要求：\n' +
  '- 必须定义 `def main(task):` 作为入口，返回值必须是可 JSON 序列化的 dict；\n' +
  '- 仅输出一段 Python 代码（建议使用 ```python 代码块```），不要包含任何解释；\n' +
  '- 优先使用标准库；如需第三方库（如 pandas/numpy/matplotlib），遇到 ImportError 必须降级为标准库方案；\n' +
  '- 代码中可以使用 print 输出运行日志；\n' +
  '- 如果给了 files（文档链接），它们会被下载到当前目录，可自行读取/写入。';

const parseRetryTimes = (value: unknown, defaultValue = 3) => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : defaultValue;

  if (!Number.isFinite(num)) return defaultValue;

  const rounded = Math.round(num);
  return Math.min(Math.max(rounded, 1), 10);
};

const extractPythonCodeFromModelOutput = (raw: string) => {
  const text = raw.trim();
  if (!text) return '';

  const fenced = text.match(/```(?:python|py)?\s*([\s\S]*?)\s*```/i)?.[1];
  return (fenced ?? text).trim();
};

const buildGenerateCodeMessages = ({
  systemPrompt,
  task,
  files
}: {
  systemPrompt: string;
  task: string;
  files: string[];
}): ChatCompletionMessageParam[] => {
  const filesPrompt =
    files.length > 0
      ? `\n\n输入文件链接（files，已下载到当前目录）：\n${files.map((url) => `- ${url}`).join('\n')}`
      : '';
  const userPrompt = `任务描述：
${task}
${filesPrompt}

运行时会传入：
- task: string（上面的任务描述）
- files: list[str]（输入文件链接，可能为空）

请输出可直接运行的 Python 代码，要求：
- 必须定义 def main(task):
- 返回一个 dict（可 JSON 序列化）
- 只输出代码（建议用 \`\`\`python 代码块\`\`\`），不要输出任何解释文字。`;

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

const buildFixCodeMessages = ({
  systemPrompt,
  task,
  files,
  currentCode,
  errorText
}: {
  systemPrompt: string;
  task: string;
  files: string[];
  currentCode: string;
  errorText: string;
}): ChatCompletionMessageParam[] => {
  const filesPrompt =
    files.length > 0
      ? `\n\n输入文件链接（files，已下载到当前目录）：\n${files.map((url) => `- ${url}`).join('\n')}`
      : '';
  const userPrompt = `任务描述：
${task}
${filesPrompt}

当前代码：
\`\`\`python
${currentCode}
\`\`\`

运行报错信息：
${errorText}

请根据报错修复代码，并再次输出一段可直接运行的 Python 代码，要求：
- 必须定义 def main(task):
- 返回一个 dict（可 JSON 序列化）
- 只输出代码（必须用 \`\`\`python 代码块\`\`\`），不要输出任何解释文字。`;

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

const callModelGetCode = async ({
  model,
  messages,
  aiParams
}: {
  model: string;
  messages: ChatCompletionMessageParam[];
  aiParams: Parameters<typeof getAIApi>[0];
}) => {
  const ai = getAIApi(aiParams);
  const response = await ai.chat.completions.create({
    model,
    temperature: 0.01,
    messages: messages as SdkChatCompletionMessageParam[],
    stream: false
  });

  const answer = response.choices?.[0]?.message?.content || '';
  const tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));

  const code = extractPythonCodeFromModelOutput(answer);
  return { code, tokens, raw: answer };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const buildExecuteCode = ({
  pythonCode,
  task,
  files
}: {
  pythonCode: string;
  task: string;
  files: string[];
}) => `# -*- coding: utf-8 -*-
${pythonCode}

if __name__ == '__main__':
    import json
    import traceback

    task = ${JSON.stringify(task)}
    files = ${JSON.stringify(files)}

    try:
        _ret = main(task)
        print(json.dumps(_ret, ensure_ascii=False))
    except Exception:
        traceback.print_exc()
        raise
`;

const runPythonInCodeInterpreter = async ({
  pythonCode,
  task,
  files
}: {
  pythonCode: string;
  task: string;
  files: string[];
}): Promise<{ raw: Record<string, unknown>; log: string }> => {
  if (!process.env.CODE_INTERPRETER_URL) {
    throw new Error('Can not find CODE_INTERPRETER_URL in env');
  }

  const requestUrl = `${trimTrailingSlash(process.env.CODE_INTERPRETER_URL)}/api/v1/execute`;
  const executeCode = buildExecuteCode({ pythonCode, task, files });

  const { data } = await axios.post(
    requestUrl,
    {
      code: executeCode,
      files
    },
    {
      timeout: 0
    }
  );

  const raw = getRecord(data);
  if (!raw) {
    throw new Error('Invalid response from code interpreter');
  }

  const error = raw.error;
  const errorText =
    error === null || error === undefined
      ? ''
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);
  const resultText = typeof raw.result === 'string' ? raw.result : '';

  if (errorText) {
    throw new Error(`${errorText}${resultText ? `\n\nresult:\n${resultText}` : ''}`);
  }

  return { raw, log: resultText };
};

const parseNumber = (value: unknown, defaultValue = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return defaultValue;
};

const parseNullableString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const parseCodeInterpreterToolOutput = (raw: Record<string, unknown>) => {
  const resultText = typeof raw.result === 'string' ? raw.result.trim() : '';
  const imageUrl = typeof raw.image_url === 'string' ? raw.image_url.trim() : '';
  const outputFiles = parseStringArray(raw.files);

  const unifiedResult: string | string[] =
    resultText || imageUrl ? resultText || imageUrl : outputFiles.length > 0 ? outputFiles : '';

  return {
    [NodeOutputKeyEnum.result]: unifiedResult,
    [NodeOutputKeyEnum.error]: parseNullableString(raw.error),
    [NodeOutputKeyEnum.execution_time]: parseNumber(raw.execution_time, 0),
    [NodeOutputKeyEnum.image_url]: parseNullableString(raw.image_url),
    [NodeOutputKeyEnum.files]: outputFiles,
    [NodeOutputKeyEnum.inputs]: parseStringArray(raw.inputs)
  };
};

export const dispatchCodeInterpreter = async (props: Props): Promise<Response> => {
  const {
    user,
    node,
    params: { model, systemPrompt, codeInterpreterMaxRetry, fileUrlList, userChatInput }
  } = props;

  if (!process.env.CODE_INTERPRETER_URL) {
    const message = 'Can not find CODE_INTERPRETER_URL in env';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: []
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  if (!userChatInput) {
    const message = '任务描述为空';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: []
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const llmModel = getLLMModel(model);
  if (!llmModel) {
    const message = 'LLM model not found';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: []
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const maxRetry = parseRetryTimes(codeInterpreterMaxRetry, 3);
  const files = parseStringArray(fileUrlList);

  const finalSystemPrompt = (systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT).trim();
  const aiParams = {
    userKey: user.openaiAccount,
    timeout: 480000
  } as const;

  let currentCode = '';
  let executionLog = '';
  let lastErrorText = '';
  let totalTokens = 0;
  let lastRaw = '';
  let attempt = 0;

  for (attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      const messages =
        attempt === 1
          ? buildGenerateCodeMessages({
              systemPrompt: finalSystemPrompt,
              task: userChatInput,
              files
            })
          : buildFixCodeMessages({
              systemPrompt: finalSystemPrompt,
              task: userChatInput,
              files,
              currentCode,
              errorText: lastErrorText
            });

      const { code, tokens, raw } = await callModelGetCode({
        model: llmModel.model,
        messages,
        aiParams
      });
      totalTokens += tokens;
      lastRaw = raw;

      if (!code || !/\bdef\s+main\s*\(/.test(code)) {
        lastErrorText = '模型输出的代码不包含 main 函数';
        currentCode = code;
        continue;
      }

      currentCode = code;

      const runResult = await runPythonInCodeInterpreter({
        pythonCode: currentCode,
        task: userChatInput,
        files
      });
      executionLog = runResult.log;
      const toolOutput = parseCodeInterpreterToolOutput(runResult.raw);
      const toolResponse =
        typeof toolOutput[NodeOutputKeyEnum.result] === 'string'
          ? toolOutput[NodeOutputKeyEnum.result]
          : JSON.stringify(toolOutput[NodeOutputKeyEnum.result]);

      const { totalPoints, modelName } = formatModelChars2Points({
        model: llmModel.model,
        tokens: totalTokens,
        modelType: ModelTypeEnum.llm
      });

      return {
        ...toolOutput,
        [DispatchNodeResponseKeyEnum.toolResponses]: toolResponse,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
          model: modelName,
          tokens: totalTokens,
          query: userChatInput,
          nodeInputs: {
            systemPrompt: finalSystemPrompt,
            maxRetry,
            files
          },
          nodeOutputs: {
            attempts: attempt,
            rawResponse: lastRaw
          },
          code: currentCode,
          codeLog: executionLog,
          pluginOutput: toolOutput,
          textOutput: toolResponse
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
      const httpErrText = formatHttpError(error);
      const errText =
        error instanceof Error ? error.message : getErrText(error, 'Code Interpreter error');
      lastErrorText = httpErrText || errText;

      if (attempt >= maxRetry) break;
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: llmModel.model,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  const finalErrText = lastErrorText || 'Code Interpreter error';
  const pluginOutput = {
    [NodeOutputKeyEnum.result]: '',
    [NodeOutputKeyEnum.error]: finalErrText,
    [NodeOutputKeyEnum.execution_time]: 0,
    [NodeOutputKeyEnum.image_url]: '',
    [NodeOutputKeyEnum.files]: [],
    [NodeOutputKeyEnum.inputs]: []
  };

  return {
    ...pluginOutput,
    [DispatchNodeResponseKeyEnum.toolResponses]: finalErrText,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      tokens: totalTokens,
      query: userChatInput,
      errorText: finalErrText,
      error: { message: finalErrText },
      nodeInputs: {
        systemPrompt: finalSystemPrompt,
        maxRetry,
        files
      },
      nodeOutputs: {
        attempts: attempt || maxRetry,
        rawResponse: lastRaw
      },
      code: currentCode,
      codeLog: executionLog,
      pluginOutput,
      textOutput: finalErrText
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
