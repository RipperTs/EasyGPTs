import React from 'react';
import { Box, Image } from '@chakra-ui/react';
import { ImportSourceItemType } from '@/web/core/dataset/type';
import { useQuery } from '@tanstack/react-query';
import { getPreviewFileContent } from '@/web/common/file/api';
import MyRightDrawer from '@fastgpt/web/components/common/MyDrawer/MyRightDrawer';
import { ImportDataSourceEnum } from '@fastgpt/global/core/dataset/constants';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useContextSelector } from 'use-context-selector';
import { DatasetImportContext } from '../Context';
import { importType2ReadType } from '@fastgpt/global/core/dataset/read';

type PreviewResponse = {
  previewContent: string;
  totalLength?: number;
  previewUrl?: string;
};

const PreviewRawText = ({
  previewSource,
  onClose
}: {
  previewSource: ImportSourceItemType & { previewUrl?: string };
  onClose: () => void;
}) => {
  const { toast } = useToast();
  const { importSource, processParamsForm } = useContextSelector(DatasetImportContext, (v) => v);
  const isImage =
    previewSource.icon?.includes('image') ||
    previewSource.previewUrl?.match(/\.(jpg|jpeg|png|gif|webp)$/i);

  const { data, isLoading } = useQuery<PreviewResponse>(
    ['previewSource', previewSource.dbFileId, previewSource.link, previewSource.externalFileUrl],
    async () => {
      if (isImage) {
        return {
          previewContent: '',
          previewUrl: previewSource.previewUrl,
          totalLength: 0
        };
      }

      if (importSource === ImportDataSourceEnum.fileCustom && previewSource.rawText) {
        return {
          previewContent: previewSource.rawText.slice(0, 3000),
          totalLength: previewSource.rawText.length
        };
      }
      if (importSource === ImportDataSourceEnum.csvTable && previewSource.dbFileId) {
        return getPreviewFileContent({
          type: importType2ReadType(importSource),
          sourceId: previewSource.dbFileId,
          isQAImport: true
        });
      }

      return getPreviewFileContent({
        type: importType2ReadType(importSource),
        sourceId:
          previewSource.dbFileId || previewSource.link || previewSource.externalFileUrl || '',
        isQAImport: false,
        selector: processParamsForm.getValues('webSelector')
      });
    },
    {
      onError(err) {
        toast({
          status: 'warning',
          title: getErrText(err)
        });
      }
    }
  );

  const rawText = data?.previewContent || '';
  const previewUrl = data?.previewUrl || previewSource.previewUrl;

  return (
    <MyRightDrawer
      onClose={onClose}
      iconSrc={previewSource.icon}
      title={previewSource.sourceName}
      isLoading={isLoading}
      px={0}
    >
      {isImage ? (
        <Box display="flex" justifyContent="center" alignItems="center" p={5}>
          <Image src={previewUrl} alt={previewSource.sourceName} maxH="80vh" objectFit="contain" />
        </Box>
      ) : (
        <Box whiteSpace={'pre-wrap'} overflowY={'auto'} px={5} fontSize={'sm'}>
          {rawText}
        </Box>
      )}
    </MyRightDrawer>
  );
};

export default React.memo(PreviewRawText);
