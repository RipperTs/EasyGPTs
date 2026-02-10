import { getRequiredString, sendFeishuMessage } from '../common';

type Props = {
  hook_url: string;
  share_chat_id: string;
};

const main = async (props: Props) => {
  const shareChatId = getRequiredString(props.share_chat_id, 'share_chat_id');

  return sendFeishuMessage({
    hook_url: props.hook_url,
    msg_type: 'share_chat',
    payload: {
      msg_type: 'share_chat',
      content: {
        share_chat_id: shareChatId
      }
    }
  });
};

export default main;
