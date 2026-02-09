import { parseFeedLinks, sendDingtalkMessage } from '../common';

type Props = {
  hook_url: string;
  secret?: string;
  feed_links_json: string;
};

const main = async (props: Props) => {
  const links = parseFeedLinks(props.feed_links_json);

  return sendDingtalkMessage({
    hook_url: props.hook_url,
    secret: props.secret,
    msgtype: 'feedCard',
    payload: {
      msgtype: 'feedCard',
      feedCard: {
        links
      }
    }
  });
};

export default main;
