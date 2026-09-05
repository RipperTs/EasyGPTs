import React, { useMemo } from 'react';
import { Box, BoxProps } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { getCollectionSourceAndOpen } from '@/web/core/dataset/hooks/readCollectionSource';
import { getSourceNameIcon } from '@fastgpt/global/core/dataset/utils';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { strIsLink } from '@fastgpt/global/common/string/tools';

type Props = BoxProps & {
  sourceName?: string;
  collectionId: string;
  sourceId?: string;
  sourceType?: SearchDataResponseItemType['sourceType'];
  canView?: boolean;
};

const RawSourceBox = ({
  sourceId,
  sourceType,
  collectionId,
  sourceName = '',
  canView = true,
  ...props
}: Props) => {
  const { t } = useTranslation();
  const { fileT } = useI18n();

  const isWeKnora = sourceType === 'weknora';
  const canPreview = !!sourceId && canView && (!isWeKnora || strIsLink(sourceId));

  const icon = useMemo(() => getSourceNameIcon({ sourceId, sourceName }), [sourceId, sourceName]);
  const read = getCollectionSourceAndOpen(collectionId);

  return (
    <MyTooltip
      label={
        canPreview ? (isWeKnora ? '在 WeKnora 查看来源' : fileT('click_to_view_raw_source')) : ''
      }
      shouldWrapChildren={false}
    >
      <Box
        color={'myGray.900'}
        fontWeight={'medium'}
        display={'inline-flex'}
        whiteSpace={'nowrap'}
        {...(canPreview
          ? {
              cursor: 'pointer',
              textDecoration: 'underline',
              onClick: isWeKnora
                ? () => window.open(sourceId, '_blank', 'noopener,noreferrer')
                : read
            }
          : {})}
        {...props}
      >
        <MyIcon name={icon as any} w={['16px', '20px']} mr={2} />
        <Box
          maxW={['200px', '300px']}
          className={props.className ?? 'textEllipsis'}
          wordBreak={'break-all'}
        >
          {sourceName || t('common:common.UnKnow Source')}
        </Box>
      </Box>
    </MyTooltip>
  );
};

export default RawSourceBox;
