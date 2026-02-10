import {
  getOptionalString,
  getRequiredString,
  parseJsonObject,
  sendFeishuMessage
} from '../common';

type Props = {
  hook_url: string;
  title?: string;
  body?: string;
  template?: string;
  card_template?: string;
  card_json?: string;
};

const buildSimpleCard = ({
  title,
  body,
  template
}: {
  title: string;
  body: string;
  template: string;
}) => {
  return {
    config: {
      wide_screen_mode: true
    },
    header: {
      title: {
        tag: 'plain_text',
        content: title
      },
      template
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: body
        }
      }
    ]
  };
};

const main = async (props: Props) => {
  const cardJson = getOptionalString(props.card_json);

  const card = cardJson
    ? parseJsonObject(cardJson, 'card_json')
    : buildSimpleCard({
        title: getRequiredString(props.title, 'title'),
        body: getRequiredString(props.body, 'body'),
        template:
          getOptionalString(props.card_template) || getOptionalString(props.template) || 'blue'
      });

  return sendFeishuMessage({
    hook_url: props.hook_url,
    msg_type: 'interactive',
    payload: {
      msg_type: 'interactive',
      card
    }
  });
};

export default main;
