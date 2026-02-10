import { getRequiredString, sendFeishuMessage } from '../common';

type Props = {
  hook_url: string;
  content: string;
};

const main = async (props: Props) => {
  const content = getRequiredString(props.content, 'content');

  return sendFeishuMessage({
    hook_url: props.hook_url,
    msg_type: 'text',
    payload: {
      msg_type: 'text',
      content: {
        text: content
      }
    }
  });
};

export default main;
