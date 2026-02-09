import { getAutoTitle, getOptionalString, getRequiredString, sendDingtalkMessage } from '../common';

type Props = {
  hook_url: string;
  secret?: string;
  content: string;
  title?: string;
  message_url: string;
  pic_url?: string;
};

const main = async (props: Props) => {
  const content = getRequiredString(props.content, 'content');
  const title = getAutoTitle(props.title, content);
  const messageUrl = getRequiredString(props.message_url, 'message_url');
  const picUrl = getOptionalString(props.pic_url);

  return sendDingtalkMessage({
    hook_url: props.hook_url,
    secret: props.secret,
    msgtype: 'link',
    payload: {
      msgtype: 'link',
      link: {
        title,
        text: content,
        messageUrl,
        picUrl
      }
    }
  });
};

export default main;
