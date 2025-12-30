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
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { addLog } from '../../../../common/system/log';

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
  'You are a senior Python engineer acting as a Code Interpreter.\n' +
  'Your job is to translate the user task into runnable Python code and execute it in a sandbox.\n' +
  '\n' +
  'Execution environment:\n' +
  '- The server will download each URL in `files` into the current working directory before running the code.\n' +
  '- Your code can read/write local files in the working directory.\n' +
  '- Network access may be restricted; do not rely on external HTTP calls.\n' +
  '\n' +
  'Output rules:\n' +
  '- Output ONLY Python code (prefer a fenced ```python code block```). No explanations.\n' +
  '- Make the code self-contained and directly runnable as a script.\n' +
  '- Always print the final answer to stdout. If structured output is needed, print JSON.\n' +
  '- If you generate a chart/image, save it (e.g. plt.savefig("output.png")) so it can be returned.\n' +
  '- Prefer the standard library. If you use optional libraries (pandas/numpy/matplotlib), handle ImportError and degrade gracefully.\n' +
  '- Be robust with file names: list the working directory and infer the correct local file to open when needed.\n';

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
      ? `\n\nInput file URLs (files):\n${files.map((url) => `- ${url}`).join('\n')}`
      : '\n\nInput file URLs (files): (none)';
  const userPrompt = `Task:
${task}
${filesPrompt}

You will have these variables available in the runtime (already defined for you):
- TASK: str (the task above)
- FILES: list[str] (input file URLs, may be empty)

Write a runnable Python script to solve the task.
Rules:
- Output ONLY code (prefer a \`\`\`python code block\`\`\`).
- Print the final answer to stdout (use JSON if helpful).
- If files are needed, inspect the working directory (e.g. os.listdir('.')) and open the correct local file.
- If you generate an image/chart, save it to a file (e.g. output.png).`;

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
      ? `\n\nInput file URLs (files):\n${files.map((url) => `- ${url}`).join('\n')}`
      : '\n\nInput file URLs (files): (none)';
  const userPrompt = `Task:
${task}
${filesPrompt}

Current code:
\`\`\`python
${currentCode}
\`\`\`

Runtime error:
${errorText}

Fix the code so it runs successfully and solves the task.
Rules:
- Output ONLY code (MUST be a \`\`\`python code block\`\`\`).
- Print the final answer to stdout (use JSON if helpful).
- Be robust with local file names: list the working directory and open the correct downloaded file.
- If you generate an image/chart, save it to a file (e.g. output.png).`;

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

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

const parseFilesFromHistories = (histories: ChatItemType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.filter((value) => value.type === 'file');
      }
      return false;
    })
    .map((item) => {
      const value = item.value as UserChatItemValueItemType[];
      const files = value
        .map((item) => {
          return item.file?.url;
        })
        .filter(Boolean) as string[];
      return files;
    })
    .flat();
};

const parsePublicFileUrl = ({
  url,
  requestOrigin
}: {
  url: string;
  requestOrigin?: string;
}): string => {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return '';

  // 优先使用 FE_DOMAIN（前端域名，用于把 "/api/xxx" 拼成可下载的公网/可访问 URL）
  // 其次才回退到 customApiDomain / requestOrigin（兼容历史配置与本地调试）。
  const baseOrigin = (
    process.env.FE_DOMAIN ||
    global.feConfigs?.customApiDomain ||
    requestOrigin ||
    ''
  ).trim();
  if (isHttpUrl(trimmed)) return trimmed;

  if (!baseOrigin) return '';

  try {
    return new URL(trimmed, baseOrigin).toString();
  } catch {
    return '';
  }
};

const parseCodeInterpreterFiles = ({
  fileUrlList,
  histories,
  requestOrigin,
  maxFiles
}: {
  fileUrlList?: string[];
  histories: ChatItemType[];
  requestOrigin?: string;
  maxFiles: number;
}) => {
  const inputUrls = parseStringArray(fileUrlList);
  const historyUrls = parseFilesFromHistories(histories);

  const urlList = [...inputUrls, ...historyUrls]
    .map((url) => parsePublicFileUrl({ url, requestOrigin }))
    .filter(Boolean);

  // 去重 + 限制数量（避免传超大数组给执行器）
  return Array.from(new Set(urlList)).slice(0, maxFiles);
};

const buildExecuteCode = ({
  pythonCode,
  task,
  files
}: {
  pythonCode: string;
  task: string;
  files: string[];
}) => `# -*- coding: utf-8 -*-
"""
Task:
${task}

Input file URLs (downloaded into current working directory before execution):
${files.map((url) => `- ${url}`).join('\n')}
"""

TASK = ${JSON.stringify(task)}
FILES = ${JSON.stringify(files)}

${pythonCode.trim()}
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

  console.info(
    '[CodeInterpreter] request',
    JSON.stringify({
      url: requestUrl,
      files,
      codeLength: executeCode.length,
      codePreview: executeCode.slice(0, 500)
    })
  );

  const { data } = await axios.post(
    requestUrl,
    {
      code: executeCode,
      files
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Type': 'CODE_INTERPRETER'
      },
      timeout: 120000 // 可选：超时
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
    histories,
    chatConfig,
    requestOrigin,
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
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const files = parseCodeInterpreterFiles({
    fileUrlList,
    histories,
    requestOrigin,
    maxFiles
  });

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

      if (!code) {
        lastErrorText = 'Empty code generated by the model';
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
      const httpError = formatHttpError(error);
      const httpErrText =
        httpError && typeof httpError.message === 'string' ? httpError.message : '';
      const errText =
        error instanceof Error
          ? error.message
          : String(getErrText(error, 'Code Interpreter error'));
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
