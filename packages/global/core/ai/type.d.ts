import openai from 'openai';
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionChunk,
  ChatCompletionMessageParam as SdkChatCompletionMessageParam,
  ChatCompletionToolMessageParam as SdkChatCompletionToolMessageParam,
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart as SdkChatCompletionContentPart,
  ChatCompletionUserMessageParam as SdkChatCompletionUserMessageParam
} from 'openai/resources';
import { ChatMessageTypeEnum } from './constants';
import { InteractiveNodeResponseItemType } from '../workflow/template/system/userSelect/type';

export * from 'openai/resources';

// Extension of ChatCompletionMessageParam, Add file url type
export type ChatCompletionContentPartFile = {
  type: 'file_url';
  name: string;
  url: string;
};
// Rewrite ChatCompletionContentPart, Add file type
export type ChatCompletionContentPart =
  | SdkChatCompletionContentPart
  | ChatCompletionContentPartFile;
type CustomChatCompletionUserMessageParam = {
  content: string | Array<ChatCompletionContentPart>;
  role: 'user';
  name?: string;
};

export type ChatCompletionMessageParam = (
  | Exclude<SdkChatCompletionMessageParam, SdkChatCompletionUserMessageParam>
  | CustomChatCompletionUserMessageParam
) & {
  dataId?: string;
  interactive?: InteractiveNodeResponseItemType;
};
export type SdkChatCompletionMessageParam = SdkChatCompletionMessageParam;

/* ToolChoice and functionCall extension */
// 与 OpenAI 官方保持一致：tool 消息只包含 role/content/tool_call_id
export type ChatCompletionToolMessageParam = SdkChatCompletionToolMessageParam;
export type ChatCompletionAssistantToolParam = {
  role: 'assistant';
  tool_calls: ChatCompletionMessageToolCall[];
};
export type ChatCompletionMessageToolCall = ChatCompletionMessageToolCall & {
  toolName?: string;
  toolAvatar?: string;
};
export type ChatCompletionMessageFunctionCall = ChatCompletionAssistantMessageParam.FunctionCall & {
  id?: string;
  toolName?: string;
  toolAvatar?: string;
};

// Stream response
export type StreamChatType = Stream<ChatCompletionChunk>;

export default openai;
export * from 'openai';

// Other
export type PromptTemplateItem = {
  title: string;
  desc: string;
  value: string;
};
