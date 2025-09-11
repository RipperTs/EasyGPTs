import React, { useCallback } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

const LLMModelConfig = dynamic(() => import('./components/LLMModelConfig'));
const ReRankModelConfig = dynamic(() => import('./components/ReRankModelConfig'));
const TTSModelConfig = dynamic(() => import('./components/TTSModelConfig'));
const WhisperModelConfig = dynamic(() => import('./components/WhisperModelConfig'));
const OCRModelConfig = dynamic(() => import('./components/OCRModelConfig'));
const SystemConfig = dynamic(() => import('./components/SystemConfig'));

enum TabEnum {
  'llm' = 'llm',
  'rerank' = 'rerank',
  'tts' = 'tts',
  'whisper' = 'whisper',
  'ocr' = 'ocr',
  'system' = 'system'
}

const ModelConfig = ({ currentTab }: { currentTab: TabEnum }) => {
  const { isPc } = useSystem();
  const router = useRouter();
  const theme = useTheme();

  const tabList = [
    {
      icon: '',
      label: 'LLM模型',
      value: TabEnum.llm
    },
    {
      icon: '',
      label: '重排模型',
      value: TabEnum.rerank
    },
    {
      icon: '',
      label: 'TTS模型',
      value: TabEnum.tts
    },
    {
      icon: '',
      label: '语音模型',
      value: TabEnum.whisper
    },
    {
      icon: '',
      label: 'OCR模型',
      value: TabEnum.ocr
    },
    {
      icon: '',
      label: '其他配置',
      value: TabEnum.system
    }
  ];

  const setCurrentTab = useCallback(
    (tab: string) => {
      router.replace({
        query: {
          currentTab: tab
        }
      });
    },
    [router]
  );

  return (
    <PageContainer>
      <Flex flexDirection={['column', 'row']} h={'100%'} pt={[4, 0]}>
        {isPc ? (
          <Flex
            flexDirection={'column'}
            p={4}
            h={'100%'}
            flex={'0 0 200px'}
            borderRight={theme.borders.base}
          >
            <SideTabs<TabEnum>
              flex={1}
              mx={'auto'}
              mt={2}
              w={'100%'}
              list={tabList}
              value={currentTab}
              onChange={setCurrentTab}
            />
          </Flex>
        ) : (
          <Box mb={3}>
            <LightRowTabs<TabEnum>
              m={'auto'}
              size={isPc ? 'md' : 'sm'}
              list={tabList.map((item) => ({
                value: item.value,
                label: item.label
              }))}
              value={currentTab}
              onChange={setCurrentTab}
            />
          </Box>
        )}

        <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]} overflow={'auto'}>
          {currentTab === TabEnum.llm && <LLMModelConfig />}
          {currentTab === TabEnum.rerank && <ReRankModelConfig />}
          {currentTab === TabEnum.tts && <TTSModelConfig />}
          {currentTab === TabEnum.whisper && <WhisperModelConfig />}
          {currentTab === TabEnum.ocr && <OCRModelConfig />}
          {currentTab === TabEnum.system && <SystemConfig />}
        </Box>
      </Flex>
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      currentTab: content?.query?.currentTab || TabEnum.llm,
      ...(await serviceSideProps(content, ['app', 'user']))
    }
  };
}

export default ModelConfig;
