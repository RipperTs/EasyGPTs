import { getRequiredString, sendFeishuMessage } from '../common';

type Props = {
  hook_url: string;
  image_key: string;
};

const main = async (props: Props) => {
  const imageKey = getRequiredString(props.image_key, 'image_key');

  return sendFeishuMessage({
    hook_url: props.hook_url,
    msg_type: 'image',
    payload: {
      msg_type: 'image',
      content: {
        image_key: imageKey
      }
    }
  });
};

export default main;
