import { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { Box, Button, Flex } from '@chakra-ui/react';

import NodeInputSelect from '@fastgpt/web/components/core/workflow/NodeInputSelect';
import { FlowNodeInputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import ValueTypeLabel from '../ValueTypeLabel';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import VariableTip from '@/components/common/Textarea/MyTextarea/VariableTip';

type Props = {
  nodeId: string;
  input: FlowNodeInputItemType;
};

const FEISHU_POST_CONTENT_EXAMPLE = JSON.stringify(
  [
    [
      {
        tag: 'text',
        text: '你的小可爱上线了！'
      },
      {
        tag: 'a',
        text: '点击查看',
        href: 'https://sspai.com/u/100gle/updates'
      }
    ]
  ],
  null,
  2
);
const FEISHU_CARD_BUILDER_URL = 'https://open.feishu.cn/tool/cardbuilder?from=cotentmodule';

const InputLabel = ({ nodeId, input }: Props) => {
  const { t } = useTranslation();

  const onChangeNode = useContextSelector(WorkflowContext, (v) => v.onChangeNode);

  const { description, required, label, selectedTypeIndex, renderTypeList, valueType, valueDesc } =
    input;

  const onChangeRenderType = useCallback(
    (e: string) => {
      const index = renderTypeList.findIndex((item) => item === e) || 0;

      onChangeNode({
        nodeId,
        type: 'updateInput',
        key: input.key,
        value: {
          ...input,
          selectedTypeIndex: index,
          value: undefined
        }
      });
    },
    [input, nodeId, onChangeNode, renderTypeList]
  );

  const onFillPostContentExample = useCallback(() => {
    onChangeNode({
      nodeId,
      type: 'updateInput',
      key: input.key,
      value: {
        ...input,
        value: FEISHU_POST_CONTENT_EXAMPLE
      }
    });
  }, [input, nodeId, onChangeNode]);

  const onOpenCardBuilder = useCallback(() => {
    window.open(FEISHU_CARD_BUILDER_URL, '_blank', 'noopener,noreferrer');
  }, []);

  const RenderLabel = useMemo(() => {
    const renderType = renderTypeList?.[selectedTypeIndex || 0];
    const isTextarea =
      input.renderTypeList[input.selectedTypeIndex ?? 0] === FlowNodeInputTypeEnum.textarea;
    const showFillExampleBtn = isTextarea && input.key === 'post_content_json';
    const showCardBuilderBtn = isTextarea && input.key === 'card_json';

    return (
      <Flex className="nodrag" cursor={'default'} alignItems={'center'} position={'relative'}>
        <Flex
          alignItems={'center'}
          position={'relative'}
          fontWeight={'medium'}
          color={'myGray.600'}
        >
          <FormLabel required={required}>{t(label as any)}</FormLabel>
          {description && <QuestionTip ml={1} label={t(description as any)}></QuestionTip>}
        </Flex>
        {/* value type */}
        {renderType === FlowNodeInputTypeEnum.reference && (
          <ValueTypeLabel valueType={valueType} valueDesc={valueDesc} />
        )}

        {/* input type select */}
        {renderTypeList && renderTypeList.length > 1 && (
          <Box ml={2}>
            <NodeInputSelect
              renderTypeList={renderTypeList}
              renderTypeIndex={selectedTypeIndex}
              onChange={onChangeRenderType}
            />
          </Box>
        )}

        {/* Variable picker tip */}
        {isTextarea && (
          <>
            <Box flex={1} />
            {showFillExampleBtn && (
              <Button
                size={'xs'}
                variant={'whitePrimary'}
                ml={2}
                mr={2}
                onClick={onFillPostContentExample}
              >
                填充示例
              </Button>
            )}
            {showCardBuilderBtn && (
              <Button
                size={'xs'}
                variant={'whitePrimary'}
                ml={2}
                mr={2}
                onClick={onOpenCardBuilder}
              >
                卡片搭建工具
              </Button>
            )}
            <VariableTip transform={'translateY(2px)'} />
          </>
        )}
      </Flex>
    );
  }, [
    description,
    input.renderTypeList,
    input.selectedTypeIndex,
    label,
    onOpenCardBuilder,
    onFillPostContentExample,
    onChangeRenderType,
    renderTypeList,
    required,
    selectedTypeIndex,
    t,
    valueType
  ]);

  return RenderLabel;
};

export default React.memo(InputLabel);
