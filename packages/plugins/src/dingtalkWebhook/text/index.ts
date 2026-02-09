import { buildAt, getRequiredString, sendDingtalkMessage } from '../common';

type Props = {
  hook_url: string;
  secret?: string;
  content: string;
  at_user_ids?: string;
  at_mobiles?: string;
  is_at_all?: boolean | string | number;
};

const main = async (props: Props) => {
  const content = getRequiredString(props.content, 'content');

  const payload: Record<string, unknown> = {
    msgtype: 'text',
    text: {
      content
    }
  };

  const at = buildAt(props);
  if (at) {
    payload.at = at;
  }

  return sendDingtalkMessage({
    hook_url: props.hook_url,
    secret: props.secret,
    msgtype: 'text',
    payload
  });
};

export default main;
