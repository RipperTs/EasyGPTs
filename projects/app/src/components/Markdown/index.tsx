import React, { useCallback, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import 'katex/dist/katex.min.css';
import RemarkMath from 'remark-math'; // Math syntax
import RemarkBreaks from 'remark-breaks'; // Line break
import RehypeKatex from 'rehype-katex'; // Math render
import RemarkGfm from 'remark-gfm'; // Special markdown syntax
import RehypeExternalLinks from 'rehype-external-links';

import styles from './index.module.scss';
import dynamic from 'next/dynamic';

import { Link, Button, Box } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { EventNameEnum, eventBus } from '@/web/common/utils/eventbus';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { MARKDOWN_QUOTE_SIGN } from '@fastgpt/global/core/chat/constants';
import { CodeClassNameEnum } from './utils';
import { visit } from 'unist-util-visit';

const CodeLight = dynamic(() => import('./CodeLight'), { ssr: false });
const MermaidCodeBlock = dynamic(() => import('./img/MermaidCodeBlock'), { ssr: false });
const MdImage = dynamic(() => import('./img/Image'), { ssr: false });
const EChartsCodeBlock = dynamic(() => import('./img/EChartsCodeBlock'), { ssr: false });
const IframeCodeBlock = dynamic(() => import('./codeBlock/Iframe'), { ssr: false });
const IframeHtmlCodeBlock = dynamic(() => import('./codeBlock/iframe-html'), { ssr: false });

const ChatGuide = dynamic(() => import('./chat/Guide'), { ssr: false });
const QuestionGuide = dynamic(() => import('./chat/QuestionGuide'), { ssr: false });

type Props = {
  source?: string;
  showAnimation?: boolean;
  isDisabled?: boolean;
  forbidZhFormat?: boolean;
};

function remarkCustomLink() {
  return (tree: any) => {
    visit(tree, 'link', (node) => {
      const text = node.children[0]?.value;
      if (text?.startsWith('^') && text?.endsWith('^')) {
        node.data = {
          ...node.data,
          hProperties: {
            className: 'custom-reference-link'
          }
        };
      }
    });
  };
}

const Markdown = (props: Props) => {
  const source = props.source || '';

  if (source.length < 200000) {
    return <MarkdownRender {...props} />;
  }

  return <Box whiteSpace={'pre-wrap'}>{source}</Box>;
};
const MarkdownRender = ({ source = '', showAnimation, isDisabled, forbidZhFormat }: Props) => {
  const components = useMemo<any>(
    () => ({
      img: Image,
      pre: RewritePre,
      code: Code,
      a: CustomA,
      details: Details,
      summary: Summary
    }),
    []
  );

  const formatSource = useMemo(() => {
    if (showAnimation || forbidZhFormat) return source;

    // 保护 URL 格式：https://, http://, /api/xxx
    const urlPlaceholders: string[] = [];
    const textWithProtectedUrls = source.replace(
      /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|\/api\/[^\s]+)(?=\s|$)/g,
      (match) => {
        urlPlaceholders.push(match);
        return `__URL_${urlPlaceholders.length - 1}__`;
      }
    );

    // 处理中文与英文数字之间的分词
    const textWithSpaces = textWithProtectedUrls
      .replace(/\[ (.*?) \]/g, '$$$1$$') // 兼容处理LaTeX数学公式
      .replace(/\\\(([^]*?)\\\)/g, '$$$1$$')
      .replace(/\\\[([^]*?)\\\]/g, '$$$1$$')
      .replace(
        /([\u4e00-\u9fa5\u3000-\u303f])([a-zA-Z0-9])|([a-zA-Z0-9])([\u4e00-\u9fa5\u3000-\u303f])/g,
        '$1$3 $2$4'
      )
      // 处理引用标记
      .replace(/\n*(\[QUOTE SIGN\]\(.*\))/g, '$1');

    // 还原 URL
    const finalText = textWithSpaces.replace(
      /__URL_(\d+)__/g,
      (_, index) => urlPlaceholders[parseInt(index)]
    );

    return finalText;
  }, [forbidZhFormat, showAnimation, source]);

  const urlTransform = useCallback((val: string) => {
    return val;
  }, []);

  return (
    <Box position={'relative'}>
      <ReactMarkdown
        className={`markdown ${styles.markdown}
          ${showAnimation ? `${formatSource ? styles.waitingAnimation : styles.animation}` : ''}
        `}
        remarkPlugins={[
          RemarkMath,
          remarkCustomLink, // 添加自定义插件
          [RemarkGfm, { singleTilde: false }],
          RemarkBreaks
        ]}
        rehypePlugins={[RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]]}
        components={components}
        urlTransform={urlTransform}
      >
        {formatSource}
      </ReactMarkdown>
      {isDisabled && <Box position={'absolute'} top={0} right={0} left={0} bottom={0} />}
    </Box>
  );
};

export default React.memo(Markdown);

function Details({ children, ...props }: React.HTMLAttributes<HTMLDetailsElement>) {
  const [isOpen, setIsOpen] = useState(false);

  // 递归处理子元素中的文本节点
  const processChildren = (children: React.ReactNode): React.ReactNode => {
    return React.Children.map(children, (child) => {
      if (typeof child === 'string') {
        return (
          <ReactMarkdown
            remarkPlugins={[RemarkMath, [RemarkGfm, { singleTilde: false }], RemarkBreaks]}
            rehypePlugins={[RehypeKatex, [RehypeExternalLinks, { target: '_blank' }]]}
          >
            {child}
          </ReactMarkdown>
        );
      }
      if (React.isValidElement(child) && child.props.children) {
        return React.cloneElement(child, {
          // @ts-ignore
          children: processChildren(child.props.children)
        });
      }
      return child;
    });
  };

  return (
    <details
      {...props}
      className={`${styles.details} ${isOpen ? styles.open : ''}`}
      onToggle={(e) => {
        setIsOpen((e.target as HTMLDetailsElement).open);
      }}
    >
      {processChildren(children)}
    </details>
  );
}

function Summary({ children, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <summary {...props} className={styles.summary}>
      {children}
    </summary>
  );
}

/* Custom dom */
function Code(e: any) {
  const { className, codeBlock, children } = e;
  const match = /language-(\w+)/.exec(className || '');
  const codeType = match?.[1];

  const strChildren = String(children);

  const Component = useMemo(() => {
    if (codeType === CodeClassNameEnum.mermaid) {
      return <MermaidCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.guide) {
      return <ChatGuide text={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.questionGuide) {
      return <QuestionGuide text={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.echarts) {
      return <EChartsCodeBlock code={strChildren} />;
    }
    if (codeType === CodeClassNameEnum.iframe) {
      return <IframeCodeBlock code={strChildren} />;
    }
    if (codeType && codeType.toLowerCase() === CodeClassNameEnum.html) {
      return (
        <IframeHtmlCodeBlock className={className} codeBlock={codeBlock} match={match}>
          {children}
        </IframeHtmlCodeBlock>
      );
    }

    return (
      <CodeLight className={className} codeBlock={codeBlock} match={match}>
        {children}
      </CodeLight>
    );
  }, [codeType, className, codeBlock, match, children, strChildren]);

  return Component;
}

function Image({ src }: { src?: string }) {
  return <MdImage src={src} />;
}

// 修改 A 组件为 CustomA
function CustomA({ children, className, ...props }: any) {
  const { t } = useTranslation();

  // 处理特殊引用链接
  if (className === 'custom-reference-link') {
    const text = React.Children.toArray(children)[0] as string;
    const displayText = text.slice(1, -1); // 移除 ^ 符号

    return (
      <Link
        {...props}
        display="inline-block"
        borderRadius="md"
        style={{
          textDecoration: 'none',
          padding: '1px 8px',
          color: '#666',
          backgroundColor: '#eeeeee'
        }}
        fontSize="mini"
        _hover={{
          textDecoration: 'none',
          color: '#666',
          backgroundColor: '#dddddd'
        }}
      >
        {displayText}
      </Link>
    );
  }

  // empty href link
  if (!props.href && typeof children?.[0] === 'string') {
    const text = useMemo(() => String(children), [children]);

    return (
      <MyTooltip label={t('common:core.chat.markdown.Quick Question')}>
        <Button
          variant={'whitePrimary'}
          size={'xs'}
          borderRadius={'md'}
          my={1}
          onClick={() => eventBus.emit(EventNameEnum.sendQuestion, { text })}
        >
          {text}
        </Button>
      </MyTooltip>
    );
  }

  // quote link
  if (children?.length === 1 && typeof children?.[0] === 'string') {
    const text = String(children);
    if (text === MARKDOWN_QUOTE_SIGN && props.href) {
      return (
        <MyTooltip label={props.href}>
          <MyIcon
            name={'core/chat/quoteSign'}
            transform={'translateY(-2px)'}
            w={'18px'}
            color={'primary.500'}
            cursor={'pointer'}
            _hover={{
              color: 'primary.700'
            }}
          />
        </MyTooltip>
      );
    }
  }

  return <Link {...props}>{children}</Link>;
}

function RewritePre({ children }: any) {
  const modifiedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      // @ts-ignore
      return React.cloneElement(child, { codeBlock: true });
    }
    return child;
  });

  return <>{modifiedChildren}</>;
}
