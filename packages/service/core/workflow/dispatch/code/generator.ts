import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import { getAIApi } from '../../../ai/config';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import type {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import {
  fetchCodeInterpreterCapabilities,
  summarizeCodeInterpreterCapabilities
} from './capabilities';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.userChatInput]: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.code]: string;
}>;

const DEFAULT_SYSTEM_PROMPT =
  'You are a senior Python engineer acting as a Code Generator.\n' +
  "Your job is to translate the user's natural language task into runnable Python code.\n" +
  '\n' +
  'Execution environment:\n' +
  '- The code will run in a sandbox with downloaded files in the current working directory.\n' +
  '- Your code can read/write local files.\n' +
  '- Network access may be restricted; do not rely on external HTTP calls.\n' +
  '\n' +
  'CRITICAL - Data Processing Rules:\n' +
  '- ALL data processing, analysis, aggregation, and transformation MUST be done in your Python code.\n' +
  '- DO NOT return raw data, long lists, or full datasets to stdout for "further analysis".\n' +
  '- Compute statistics, summaries, and final results IN CODE, then print only the final answer.\n' +
  '- For large datasets: calculate counts, averages, top-N items, etc. in code; print a concise summary.\n' +
  '- For text analysis: perform all NLP/text processing in code; print only the conclusion.\n' +
  '\n' +
  'Output rules:\n' +
  '- Output ONLY Python code (prefer a fenced ```python code block```). No explanations.\n' +
  '- Make the code self-contained and directly runnable as a script.\n' +
  '- Print CONCISE final text results to stdout (max 4000 chars). If structured, use compact JSON.\n' +
  '- For visualizations/files: save them (e.g. plt.savefig("chart.png"), df.to_csv("data.csv")).\n' +
  '  The Code Interpreter service will AUTOMATICALLY detect and return file URLs in `image_url` and `files` response fields.\n' +
  '  DO NOT print filenames or file paths to stdout. Stdout is ONLY for text results (or can be empty if only generating files).\n' +
  '- NEVER output images as Base64, data URIs, or long binary strings in stdout.\n' +
  '- NEVER return full file contents, raw data dumps, or intermediate processing results to stdout.\n' +
  '- Prefer the standard library. If you use optional libraries (pandas/numpy/matplotlib), handle ImportError and degrade gracefully.\n' +
  '- Be robust with file names: list the working directory and infer the correct local file to open when needed.\n';

const extractPythonCodeFromModelOutput = (raw: string) => {
  const text = raw.trim();
  if (!text) return '';

  const fenced = text.match(/```(?:python|py)?\s*([\s\S]*?)\s*```/i)?.[1];
  return (fenced ?? text).trim();
};

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

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

const buildGenerateCodeMessages = ({
  systemPrompt,
  task,
  files,
  capabilitiesText
}: {
  systemPrompt: string;
  task: string;
  files: string[];
  capabilitiesText?: string;
}): ChatCompletionMessageParam[] => {
  const filesPrompt =
    files.length > 0
      ? `\n\nInput file URLs (files):\n${files.map((url) => `- ${url}`).join('\n')}`
      : '\n\nInput file URLs (files): (none)';
  const capabilitiesPrompt = capabilitiesText ? `\n\n${capabilitiesText}` : '';
  const userPrompt = `Task:
${task}
${filesPrompt}
${capabilitiesPrompt}

You will have these variables available in the runtime (already defined for you):
- FILES: list[str] (input file URLs, may be empty)

Write a runnable Python script to solve the task.

CRITICAL Rules:
- Output ONLY code (prefer a \`\`\`python code block\`\`\`).
- Perform ALL data processing/analysis/aggregation IN YOUR CODE, not after execution.
- Print ONLY final text results to stdout (max ~4000 chars). Use concise summaries, not raw data.
- For large datasets: calculate statistics/summaries in code, print compact results only.
- For visualizations/files: save to local files (e.g. plt.savefig("chart.png"), df.to_csv("output.csv")).
  The Code Interpreter service will automatically detect generated files and return their URLs.
  DO NOT print filenames to stdout - stdout is for text results only (or leave empty if only generating files).
- DO NOT encode images to Base64 (no \`data:image/...;base64,\`, no long Base64 strings).
- DO NOT return full file contents, raw arrays, or intermediate data to stdout.
- Inspect working directory if needed: os.listdir('.') to find downloaded files.`;

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

export const dispatchCodeGenerator = async (props: Props): Promise<Response> => {
  const {
    user,
    node,
    histories,
    chatConfig,
    params: { model, systemPrompt, fileUrlList, userChatInput }
  } = props;

  if (!userChatInput || !userChatInput.trim()) {
    const message = '任务描述为空';
    return {
      [NodeOutputKeyEnum.code]: '',
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const llmModel = getLLMModel(model);
  if (!llmModel) {
    const message = 'LLM model not found';
    return {
      [NodeOutputKeyEnum.code]: '',
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  // 收集文件列表（来自对话历史里的上传文件）
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const inputUrls = parseStringArray(fileUrlList);
  const historyUrls = parseFilesFromHistories(histories);
  const files = Array.from(new Set([...inputUrls, ...historyUrls].filter(Boolean))).slice(
    0,
    maxFiles
  );

  const finalSystemPrompt = (systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT).trim();

  const capabilities =
    process.env.CODE_INTERPRETER_URL && process.env.CODE_INTERPRETER_URL.trim()
      ? await fetchCodeInterpreterCapabilities({
          baseUrl: process.env.CODE_INTERPRETER_URL.trim(),
          timeoutMs: 5000
        })
      : null;
  const capabilitiesText = capabilities
    ? summarizeCodeInterpreterCapabilities(capabilities)
    : undefined;

  // 构建消息
  const messages = buildGenerateCodeMessages({
    systemPrompt: finalSystemPrompt,
    task: userChatInput,
    files,
    capabilitiesText
  });

  // 调用 AI 生成代码
  try {
    const ai = getAIApi({
      userKey: user.openaiAccount,
      timeout: 480000
    });

    const response = await ai.chat.completions.create({
      model: llmModel.model,
      temperature: 0.01,
      messages: messages as SdkChatCompletionMessageParam[],
      stream: false
    });

    const answer = response.choices?.[0]?.message?.content || '';
    const tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));
    const code = extractPythonCodeFromModelOutput(answer);

    const { totalPoints, modelName } = formatModelChars2Points({
      model: llmModel.model,
      tokens,
      modelType: ModelTypeEnum.llm
    });

    return {
      [NodeOutputKeyEnum.code]: code,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
        model: modelName,
        tokens,
        query: userChatInput,
        nodeInputs: {
          systemPrompt: finalSystemPrompt,
          capabilities: capabilitiesText,
          files
        },
        nodeOutputs: {
          rawResponse: answer
        },
        code,
        textOutput: code
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
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : '代码生成失败';
    return {
      [NodeOutputKeyEnum.code]: '',
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: errorMessage,
        error: { message: errorMessage },
        textOutput: errorMessage
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }
};
