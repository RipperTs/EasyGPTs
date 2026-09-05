import React from 'react';
import { Box, Button, Flex, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import {
  getDefaultWeKnoraSearchSettings,
  type WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import { WeKnoraSettingsModal } from './WeKnoraSettings';

const WeKnoraSimpleSettings = ({
  appId,
  value,
  maxTokens,
  onChange
}: {
  appId: string;
  value: WeKnoraSearchSettings;
  maxTokens: number;
  onChange: (value: WeKnoraSearchSettings) => void;
}) => {
  const selectModal = useDisclosure();
  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    title: '移除 WeKnoraX 知识库',
    content: '确定移除当前应用中的 WeKnoraX 知识库配置吗？'
  });
  const hasDatasets = value.datasets.length > 0;

  return (
    <>
      <Flex alignItems={'center'} flexWrap={'wrap'}>
        <Flex alignItems={'center'} flex={1} minW={'180px'}>
          <MyIcon name={'core/dataset/weknora'} w={'20px'} />
          <FormLabel ml={2}>WeKnoraX 知识库</FormLabel>
        </Flex>
        <Button
          variant={'transparentBase'}
          leftIcon={<MyIcon name={'common/addLight'} w={'0.8rem'} />}
          iconSpacing={1}
          size={'sm'}
          fontSize={'sm'}
          onClick={selectModal.onOpen}
        >
          选择
        </Button>
        {(value.weknoraConnectionId || hasDatasets) && (
          <Button
            variant={'transparentBase'}
            leftIcon={<MyIcon name={'delete'} w={'14px'} />}
            iconSpacing={1}
            size={'sm'}
            fontSize={'sm'}
            onClick={openConfirm(() => onChange(getDefaultWeKnoraSearchSettings()))}
          >
            移除
          </Button>
        )}
      </Flex>
      {hasDatasets && (
        <Flex mt={3} gap={2} flexWrap={'wrap'} fontSize={'xs'} color={'myGray.600'}>
          <Box px={2} py={1} bg={'myGray.50'} borderRadius={'md'}>
            已选择 {value.datasets.length} 个知识库
          </Box>
          <Box px={2} py={1} bg={'myGray.50'} borderRadius={'md'}>
            引用上限 {value.limit} Token
          </Box>
        </Flex>
      )}
      {selectModal.isOpen && (
        <WeKnoraSettingsModal
          appId={appId}
          value={value}
          maxTokens={maxTokens}
          onClose={selectModal.onClose}
          onChange={onChange}
        />
      )}
      <ConfirmModal confirmText={'确认移除'} closeText={'取消'} />
    </>
  );
};

export default React.memo(WeKnoraSimpleSettings);
