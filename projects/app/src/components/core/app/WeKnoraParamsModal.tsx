import React, { useState } from 'react';
import { Box, Button, Flex, Input, ModalBody, ModalFooter } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MySlider from '@/components/Slider';

const WeKnoraParamsModal = ({
  limit,
  maxTokens = 16000,
  onClose,
  onSuccess
}: {
  limit: number;
  maxTokens?: number;
  onClose: () => void;
  onSuccess: (limit: number) => void;
}) => {
  const [draftLimit, setDraftLimit] = useState(limit);
  const { toast } = useToast();

  return (
    <MyModal
      title={'引用设置'}
      iconSrc={'core/dataset/weknora'}
      onClose={onClose}
      w={['90vw', '520px']}
    >
      <ModalBody py={5}>
        <Flex alignItems={'center'} justifyContent={'space-between'} mb={5}>
          <FormLabel>引用长度上限</FormLabel>
          <Flex alignItems={'center'} gap={2} fontSize={'sm'} color={'myGray.600'}>
            <Input
              aria-label={'引用长度上限'}
              size={'sm'}
              w={'100px'}
              type={'number'}
              min={100}
              max={maxTokens}
              value={draftLimit}
              onChange={(event) => setDraftLimit(Number(event.target.value))}
            />
            Token
          </Flex>
        </Flex>
        <Box mx={3}>
          <MySlider
            min={100}
            max={maxTokens}
            step={100}
            value={draftLimit}
            onChange={setDraftLimit}
            markList={[
              { label: 100, value: 100 },
              { label: maxTokens, value: maxTokens }
            ]}
          />
        </Box>
        <Box mt={4} fontSize={'xs'} color={'myGray.500'} lineHeight={'1.8'}>
          控制提供给 AI 的知识库引用长度。检索与重排使用 WeKnoraX 中的配置。
        </Box>
      </ModalBody>
      <ModalFooter gap={3}>
        <Button variant={'whiteBase'} onClick={onClose}>
          取消
        </Button>
        <Button
          onClick={() => {
            if (!Number.isFinite(draftLimit) || draftLimit < 100 || draftLimit > maxTokens) {
              return toast({
                status: 'warning',
                title: `引用长度必须在 100～${maxTokens} Token 之间`
              });
            }
            onSuccess(draftLimit);
            onClose();
          }}
        >
          确定
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default React.memo(WeKnoraParamsModal);
