import { getRequiredString, parseJsonArray, sendFeishuMessage } from '../common';

type Props = {
  hook_url: string;
  title: string;
  post_content_json: string;
};

const main = async (props: Props) => {
  const title = getRequiredString(props.title, 'title');
  const postContent = parseJsonArray(props.post_content_json, 'post_content_json');

  return sendFeishuMessage({
    hook_url: props.hook_url,
    msg_type: 'post',
    payload: {
      msg_type: 'post',
      content: {
        post: {
          'zh-CN': {
            title,
            content: postContent
          }
        }
      }
    }
  });
};

export default main;
