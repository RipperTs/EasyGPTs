import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  useDisclosure,
  HStack,
  Switch,
  ModalFooter,
  Divider
} from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { AppFileSelectConfigType } from '@fastgpt/global/core/app/type.d';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MySlider from '@/components/Slider';
import { defaultAppSelectFileConfig } from '@fastgpt/global/core/app/constants';
import ChatFunctionTip from './Tip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import { useMount } from 'ahooks';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import AIModelSelector from '@/components/Select/AIModelSelector';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';

const FileSelect = ({
  forbidVision = false,
  value = defaultAppSelectFileConfig,
  onChange
}: {
  forbidVision?: boolean;
  value?: AppFileSelectConfigType;
  onChange: (e: AppFileSelectConfigType) => void;
}) => {
  const { t } = useTranslation();
  const { feConfigs, pdfModelList } = useSystemStore();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const maxSelectFiles = Math.min(feConfigs?.uploadFileMaxAmount ?? 20, 30);

  const formLabel = useMemo(
    () =>
      value.canSelectFile || value.canSelectImg
        ? t('common:core.app.whisper.Open')
        : t('common:core.app.whisper.Close'),
    [t, value.canSelectFile, value.canSelectImg]
  );

  // Close select img switch when vision is forbidden
  useMount(() => {
    if (forbidVision) {
      onChange({
        ...value,
        canSelectImg: false
      });
    }
  });

  return (
    <Flex alignItems={'center'}>
      <MyIcon name={'core/app/simpleMode/file'} mr={2} w={'20px'} />
      <FormLabel>{t('app:file_upload')}</FormLabel>
      <ChatFunctionTip type={'file'} />
      <Box flex={1} />
      <MyTooltip label={t('app:config_file_upload')}>
        <Button
          variant={'transparentBase'}
          iconSpacing={1}
          size={'sm'}
          mr={'-5px'}
          onClick={onOpen}
        >
          {formLabel}
        </Button>
      </MyTooltip>
      <MyModal
        iconSrc="core/app/simpleMode/file"
        title={t('app:file_upload')}
        isOpen={isOpen}
        onClose={onClose}
      >
        <ModalBody>
          {/* 开关区域 */}
          <Flex
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <FormLabel mb={0}>{t('app:document_upload')}</FormLabel>
            </HStack>
            <Box w={['100%', '300px']}>
              <Switch
                isChecked={value.canSelectFile}
                onChange={(e) =>
                  onChange({
                    ...value,
                    canSelectFile: e.target.checked
                  })
                }
              />
            </Box>
          </Flex>

          <Flex
            mt={6}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <FormLabel mb={0}>{t('app:image_upload')}</FormLabel>
            </HStack>
            <Box w={['100%', '300px']}>
              {forbidVision ? (
                <Box fontSize={'sm'} color={'myGray.500'}>
                  {t('app:llm_not_support_vision')}
                </Box>
              ) : (
                <Switch
                  isChecked={value.canSelectImg}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      canSelectImg: e.target.checked
                    })
                  }
                />
              )}
            </Box>
          </Flex>
          {!forbidVision && (
            <Flex mt={2} color={'myGray.500'}>
              <Box fontSize={'xs'}>{t('app:image_upload_tip')}</Box>
              <ChatFunctionTip type="visionModel" />
            </Flex>
          )}

          <Divider my={5} />

          {pdfModelList.length > 0 && (
            <Flex
              mt={1}
              alignItems={['flex-start', 'center']}
              justify={'space-between'}
              flexDir={['column', 'row']}
            >
              <HStack
                spacing={1}
                flex={['', '0 0 110px']}
                fontSize={'sm'}
                color={'myGray.900'}
                fontWeight={500}
                pb={['12px', '0']}
              >
                <Box>PDF 解析模型</Box>
                <QuestionTip label={'用于解析PDF文档为Markdown'} />
              </HStack>
              <Box w={['100%', '300px']}>
                <AIModelSelector
                  w={['100%', '300px']}
                  value={value.pdfModel || ''}
                  list={[
                    { label: '本地解析', value: '' },
                    ...pdfModelList.map((item) => ({ label: item.name, value: item.model }))
                  ]}
                  disableTip={value.canSelectFile ? undefined : '请先开启文档上传'}
                  onchange={(e) =>
                    onChange({
                      ...value,
                      pdfModel: e || ''
                    })
                  }
                />
              </Box>
            </Flex>
          )}

          <Divider my={5} />

          <Flex
            mt={1}
            alignItems={['flex-start', 'center']}
            justify={'space-between'}
            flexDir={['column', 'row']}
          >
            <HStack
              spacing={1}
              flex={['', '0 0 110px']}
              fontSize={'sm'}
              color={'myGray.900'}
              fontWeight={500}
              pb={['12px', '0']}
            >
              <FormLabel mb={0}>{t('app:upload_file_max_amount')}</FormLabel>
              <QuestionTip label={t('app:upload_file_max_amount_tip')} />
            </HStack>

            <Box w={['100%', '300px']}>
              <MySlider
                markList={[
                  { label: '1', value: 1 },
                  { label: `${maxSelectFiles}`, value: maxSelectFiles }
                ]}
                width={'100%'}
                min={1}
                max={maxSelectFiles}
                step={1}
                value={value.maxFiles ?? 5}
                onChange={(e) => {
                  onChange({
                    ...value,
                    maxFiles: e
                  });
                }}
              />
            </Box>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose} px={8}>
            {t('common:common.Confirm')}
          </Button>
        </ModalFooter>
      </MyModal>
    </Flex>
  );
};

export default FileSelect;
