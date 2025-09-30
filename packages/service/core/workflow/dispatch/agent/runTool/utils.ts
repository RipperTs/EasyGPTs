import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

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
