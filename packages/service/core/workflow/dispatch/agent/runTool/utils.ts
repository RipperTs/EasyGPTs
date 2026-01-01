import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') return error;
  if (!error || typeof error !== 'object') return '';
  const maybeMessage = (error as { message?: unknown }).message;
  if (typeof maybeMessage === 'string') return maybeMessage;
  return '';
};

export const isLLMEmptyResponseError = (error: unknown) =>
  getErrorMessage(error).includes('LLM api response empty') || error === 'LLM api response empty';

export const updateToolInputValue = ({
  params,
  inputs
}: {
  params: Record<string, any>;
  inputs: FlowNodeInputItemType[];
}) => {
  return inputs.map((input) => ({
    ...input,
    value: params[input.key] ?? input.value
  }));
};

export const filterToolResponseToPreview = (response: AIChatItemValueItemType[]) => {
  return response.map((item) => {
    if (item.type === ChatItemValueTypeEnum.tool) {
      const formatTools = item.tools?.map((tool) => {
        return {
          ...tool,
          response: sliceStrStartEnd(tool.response, 500, 500)
        };
      });
      return {
        ...item,
        tools: formatTools
      };
    }

    return item;
  });
};

// 工具调用（isToolCall）是“从某个工具节点作为 entry 单独跑一遍子流程”，workflowStart 不会执行，
// 但很多工具节点会引用 workflowStart 的输出（比如 userFiles）作为入参，因此这里把这些输出从 props.query 预注入。
export const injectWorkflowStartOutputsForToolRun = (params: {
  runtimeNodes: RuntimeNodeItemType[];
  query: UserChatItemValueItemType[];
}) => {
  const { runtimeNodes, query } = params;
  const workflowStartNode = runtimeNodes.find(
    (node) => node.flowNodeType === FlowNodeTypeEnum.workflowStart
  );
  if (!workflowStartNode) return runtimeNodes;

  const { text, files } = chatValue2RuntimePrompt(query);
  const userFiles = (files || [])
    .map((f) => (typeof f?.url === 'string' ? f.url : ''))
    .filter(Boolean);

  // 没有内容就不注入，避免污染 debug 面板
  if (!text && userFiles.length === 0) return runtimeNodes;

  return runtimeNodes.map((node) => {
    if (node.nodeId !== workflowStartNode.nodeId) return node;

    return {
      ...node,
      outputs: node.outputs.map((output) => {
        if (output.id === NodeOutputKeyEnum.userFiles) {
          return { ...output, value: userFiles };
        }
        if (output.id === NodeOutputKeyEnum.userChatInput) {
          return { ...output, value: text };
        }
        return output;
      })
    };
  });
};

// 规范化工具返回，优先展开 MCP 返回的 content 文本
export const formatToolResponse = (toolResponses: any): string => {
  try {
    if (
      toolResponses &&
      typeof toolResponses === 'object' &&
      Array.isArray((toolResponses as any).content)
    ) {
      const text = (toolResponses as any).content
        .filter((i: any) => i && i.type === 'text' && typeof i.text === 'string')
        .map((i: any) => i.text)
        .join('\n');
      if (text) return text;
    }
  } catch {}

  if (typeof toolResponses === 'object') {
    try {
      return JSON.stringify(toolResponses, null, 2);
    } catch {}
  }
  return toolResponses ? String(toolResponses) : 'none';
};
