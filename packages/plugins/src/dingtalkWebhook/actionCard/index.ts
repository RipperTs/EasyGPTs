import { getAutoTitle, getRequiredString, parseNumber, sendDingtalkMessage } from '../common';

type Props = {
  hook_url: string;
  secret?: string;
  content: string;
  title?: string;
  single_title: string;
  single_url: string;
  btn_orientation?: string | number;
  hide_avatar?: string | number;
};

const main = async (props: Props) => {
  const content = getRequiredString(props.content, 'content');
  const title = getAutoTitle(props.title, content);
  const singleTitle = getRequiredString(props.single_title, 'single_title');
  const singleURL = getRequiredString(props.single_url, 'single_url');

  const actionCard: Record<string, unknown> = {
    title,
    text: content,
    singleTitle,
    singleURL
  };

  const btnOrientation = parseNumber(props.btn_orientation);
  const hideAvatar = parseNumber(props.hide_avatar);

  if (btnOrientation !== undefined) {
    actionCard.btnOrientation = btnOrientation;
  }
  if (hideAvatar !== undefined) {
    actionCard.hideAvatar = hideAvatar;
  }

  return sendDingtalkMessage({
    hook_url: props.hook_url,
    secret: props.secret,
    msgtype: 'actionCard',
    payload: {
      msgtype: 'actionCard',
      actionCard
    }
  });
};

export default main;
