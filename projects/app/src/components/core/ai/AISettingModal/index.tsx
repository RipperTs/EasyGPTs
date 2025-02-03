import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useTranslation } from 'next-i18next';
import { useForm } from 'react-hook-form';
import {
  Box,
  BoxProps,
  Button,
  Flex,
  Link,
  ModalBody,
  ModalFooter,
  Switch
} from '@chakra-ui/react';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import MySlider from '@/components/Slider';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { SettingAIDataType } from '@fastgpt/global/core/app/type.d';
import { getDocPath } from '@/web/common/system/doc';
import AIModelSelector from '@/components/Select/AIModelSelector';
import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { getWebLLMModel } from '@/web/common/system/utils';

const AIChatSettingsModal = ({
  onClose,
  onSuccess,
  defaultData,
  llmModels = []
}: {
  onClose: () => void;
  onSuccess: (e: SettingAIDataType) => void;
  defaultData: SettingAIDataType;
  llmModels?: LLMModelItemType[];
}) => {
  const { t } = useTranslation();
  const [refresh, setRefresh] = useState(false);
  const { feConfigs, llmModelList } = useSystemStore();

  const { handleSubmit, getValues, setValue, watch } = useForm({
    defaultValues: defaultData
  });
  const model = watch('model');
  const reasoning = watch(NodeInputKeyEnum.aiChatReasoning);
  const showResponseAnswerText = watch(NodeInputKeyEnum.aiChatIsResponseText) !== undefined;
  const showVisionSwitch = watch(NodeInputKeyEnum.aiChatVision) !== undefined;
  const showMaxHistoriesSlider = watch('maxHistories') !== undefined;
  const useVision = watch('aiChatVision');
  const selectedModel = getWebLLMModel(model);
  const llmSupportVision = !!selectedModel?.vision;

  const maxToken = watch('maxToken');
  const temperature = watch('temperature');

  const llmSupportTemperature = typeof selectedModel?.maxTemperature === 'number';
  const llmSupportReasoning = !!selectedModel?.reasoning;

  const tokenLimit = useMemo(() => {
    return selectedModel?.maxResponse || 4096;
  }, [selectedModel?.maxResponse]);

  const onChangeModel = (e: string) => {
    setValue('model', e);

    // update max tokens
    const modelData = getWebLLMModel(e);
    if (modelData) {
      setValue('maxToken', modelData.maxResponse / 2);
    }

    setRefresh(!refresh);
  };

  const LabelStyles: BoxProps = {
    display: 'flex',
    alignItems: 'center',
    fontSize: 'sm',
    color: 'myGray.900',
    width: ['6rem', '8rem']
  };

  return (
    <MyModal
      isOpen
      iconSrc="/imgs/workflow/AI.png"
      onClose={onClose}
      title={<>{t('common:core.ai.AI settings')}</>}
      w={'500px'}
    >
      <ModalBody overflowY={'auto'}>
        <Flex alignItems={'center'}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Model')}
          </Box>
          <Box flex={'1 0 0'}>
            <AIModelSelector
              width={'100%'}
              value={model}
              list={llmModels.map((item) => ({
                value: item.model,
                label: item.name
              }))}
              onchange={onChangeModel}
            />
          </Box>
        </Flex>
        <Flex mt={8}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Max context')}
          </Box>
          <Box flex={1}>{selectedModel?.maxContext || 4096}Tokens</Box>
        </Flex>
        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.ai.Support tool')}
            <QuestionTip ml={1} label={t('common:core.module.template.AI support tool tip')} />
          </Box>
          <Box flex={1}>
            {selectedModel?.toolChoice || selectedModel?.functionCall
              ? t('common:common.support')
              : t('common:common.not_support')}
          </Box>
        </Flex>
        {llmSupportTemperature && (
          <Flex mt={6}>
            <Box {...LabelStyles}>
              <Flex alignItems={'center'}>
                {t('common:core.app.Temperature')}
                <QuestionTip label="范围 0～10。值越大，代表模型回答越发散；值越小，代表回答越严谨。" />
              </Flex>
            </Box>
            <Box flex={1} ml={1}>
              <MySlider
                markList={[
                  { label: t('common:core.app.deterministic'), value: 0 },
                  { label: t('common:core.app.Random'), value: 10 }
                ]}
                width={'95%'}
                min={0}
                max={10}
                value={getValues(NodeInputKeyEnum.aiChatTemperature)}
                onChange={(e) => {
                  setValue(NodeInputKeyEnum.aiChatTemperature, e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}

        <Flex mt={6}>
          <Box {...LabelStyles} mr={2}>
            {t('common:core.app.Max tokens')}
          </Box>
          <Box flex={1}>
            <MySlider
              markList={[
                { label: '100', value: 100 },
                { label: `${tokenLimit}`, value: tokenLimit }
              ]}
              width={'95%'}
              min={100}
              max={tokenLimit}
              step={50}
              value={getValues(NodeInputKeyEnum.aiChatMaxToken)}
              onChange={(val) => {
                setValue(NodeInputKeyEnum.aiChatMaxToken, val);
                setRefresh(!refresh);
              }}
            />
          </Box>
        </Flex>
        {showMaxHistoriesSlider && (
          <Flex mt={6}>
            <Box {...LabelStyles} mr={2}>
              {t('common:core.app.Max histories')}
            </Box>
            <Box flex={1}>
              <MySlider
                markList={[
                  { label: 0, value: 0 },
                  { label: 30, value: 30 }
                ]}
                width={'95%'}
                min={0}
                max={30}
                value={getValues('maxHistories') ?? 6}
                onChange={(e) => {
                  setValue('maxHistories', e);
                  setRefresh(!refresh);
                }}
              />
            </Box>
          </Flex>
        )}
        {llmSupportReasoning && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...LabelStyles}>
              输出思考
              <QuestionTip ml={1} label="目前仅支持R1模型的思考过程输出格式"></QuestionTip>
            </Box>
            <Box flex={1}>
              <Switch
                isChecked={reasoning || false}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(NodeInputKeyEnum.aiChatReasoning, value);
                }}
              />
            </Box>
          </Flex>
        )}
        {showResponseAnswerText && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('common:core.app.Ai response')}
              <QuestionTip
                ml={1}
                label={t('common:core.module.template.AI response switch tip')}
              ></QuestionTip>
            </Box>
            <Box flex={1}>
              <Switch
                isChecked={getValues(NodeInputKeyEnum.aiChatIsResponseText)}
                onChange={(e) => {
                  const value = e.target.checked;
                  setValue(NodeInputKeyEnum.aiChatIsResponseText, value);
                  setRefresh((state) => !state);
                }}
              />
            </Box>
          </Flex>
        )}
        {showVisionSwitch && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...LabelStyles}>
              {t('app:llm_use_vision')}
              <QuestionTip ml={1} label={t('app:llm_use_vision_tip')}></QuestionTip>
            </Box>
            <Box flex={1}>
              {llmSupportVision ? (
                <Switch
                  isChecked={useVision}
                  onChange={(e) => {
                    const value = e.target.checked;
                    setValue(NodeInputKeyEnum.aiChatVision, value);
                  }}
                />
              ) : (
                <Box fontSize={'sm'} color={'myGray.500'}>
                  {t('app:llm_not_support_vision')}
                </Box>
              )}
            </Box>
          </Flex>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant={'whiteBase'} onClick={onClose}>
          {t('common:common.Close')}
        </Button>
        <Button ml={4} onClick={handleSubmit(onSuccess)}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AIChatSettingsModal;
