import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.terminateError]: unknown;
}>;

type ToolErrorShape = { message: string };
type ToolResponsesShape = { success: false; error: ToolErrorShape };

function formatErrorMessage(value: unknown): string {
  if (typeof value === 'string') {
    const msg = value.trim();
    return msg || '发生错误';
  }

  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }
  }

  try {
    const str = JSON.stringify(value, null, 2);
    return str && str !== 'null' ? str : '发生错误';
  } catch {
    return String(value) || '发生错误';
  }
}

export const dispatchTerminateWorkflow = async (
  props: Props
): Promise<
  DispatchNodeResultType<{
    [NodeOutputKeyEnum.success]: false;
    [NodeOutputKeyEnum.error]: ToolErrorShape;
    [NodeOutputKeyEnum.answerText]: string;
  }>
> => {
  const errorText = formatErrorMessage(props.params[NodeInputKeyEnum.terminateError]);
  const error: ToolErrorShape = { message: errorText };
  const toolResponses: ToolResponsesShape = { success: false, error };

  return {
    [NodeOutputKeyEnum.success]: false,
    [NodeOutputKeyEnum.error]: error,
    [NodeOutputKeyEnum.answerText]: errorText,
    [DispatchNodeResponseKeyEnum.workflowStop]: true,
    [DispatchNodeResponseKeyEnum.toolResponses]: toolResponses,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      errorText,
      textOutput: errorText,
      pluginOutput: toolResponses
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
  };
};
