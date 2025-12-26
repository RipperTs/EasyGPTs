import { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  ModuleDispatchProps,
  DispatchNodeResponseType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type';
import { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { DispatchFlowResponse } from '../../type.d';
import {
  AIChatItemValueItemType,
  ChatItemValueItemType,
  ChatItemType
} from '@fastgpt/global/core/chat/type';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

export type DispatchToolModuleProps = ModuleDispatchProps<{
  [NodeInputKeyEnum.history]?: ChatItemType[] | number;
  [NodeInputKeyEnum.userChatInput]: string;

  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]: string;
  [NodeInputKeyEnum.aiChatTemperature]: number;
  [NodeInputKeyEnum.aiChatMaxToken]: number;
  [NodeInputKeyEnum.aiChatVision]?: boolean;
  [NodeInputKeyEnum.aiChatReasoning]?: boolean;
  [NodeInputKeyEnum.aiChatReasoningEffort]?: string;
}>;

export type RunToolResponse = {
  dispatchFlowResponse: DispatchFlowResponse[];
  totalTokens: number;
  completeMessages?: ChatCompletionMessageParam[];
  assistantResponses?: AIChatItemValueItemType[];
  [DispatchNodeResponseKeyEnum.runTimes]: number;
  reasoningText?: string;
};
export type ToolNodeItemType = RuntimeNodeItemType & {
  toolParams: RuntimeNodeItemType['inputs'];
};
