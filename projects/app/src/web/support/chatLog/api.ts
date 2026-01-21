import { POST } from '@/web/common/api/request';
import type { PagingData, RequestPaging } from '@/types';
import type { ChatLogListItem, ListChatLogBody } from '@/pages/api/support/chatLog/list';

export const getChatLogs = (data: RequestPaging & Partial<ListChatLogBody>) =>
  POST<PagingData<ChatLogListItem>>('/support/chatLog/list', data);
