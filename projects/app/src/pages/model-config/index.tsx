import React, { useCallback } from 'react';
import { Box, Flex, useTheme } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import PageContainer from '@/components/PageContainer';
import SideTabs from '@/components/SideTabs';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useUserStore } from '@/web/support/user/useUserStore';

const LLMModelConfig = dynamic(() => import('./components/LLMModelConfig'));
const EmbeddingModelConfig = dynamic(() => import('./components/EmbeddingModelConfig'));
const ReRankModelConfig = dynamic(() => import('./components/ReRankModelConfig'));
const TTSModelConfig = dynamic(() => import('./components/TTSModelConfig'));
const WhisperModelConfig = dynamic(() => import('./components/WhisperModelConfig'));
const OCRModelConfig = dynamic(() => import('./components/OCRModelConfig'));

enum TabEnum {
  llm = 'llm',
  embedding = 'embedding',
  rerank = 'rerank',
  tts = 'tts',
  whisper = 'whisper',
  ocr = 'ocr'
}

const ModelConfig = ({ currentTab }: { currentTab: TabEnum | string }) => {
  const { isPc } = useSystem();
  const router = useRouter();
  const theme = useTheme();
  const { userInfo } = useUserStore();

  const tabList = [
    {
      icon: '',
      label: 'LLM模型',
      value: TabEnum.llm
    },
    {
      icon: '',
      label: '嵌入模型',
      value: TabEnum.embedding
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

  const safeCurrentTab = (tabList.find((t) => t.value === (currentTab as any))?.value ||
    TabEnum.llm) as TabEnum;

  // 非 root 用户不可访问
  if (userInfo && userInfo.username !== 'root') {
    return (
      <PageContainer>
        <Flex alignItems={'center'} justifyContent={'center'} h={'100%'} color={'myGray.600'}>
          无权限访问
        </Flex>
      </PageContainer>
    );
  }

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
              value={safeCurrentTab}
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
              value={safeCurrentTab}
              onChange={setCurrentTab}
            />
          </Box>
        )}

        <Box flex={'1 0 0'} h={'100%'} pb={[4, 0]} overflow={'auto'}>
          {safeCurrentTab === TabEnum.llm && <LLMModelConfig />}
          {safeCurrentTab === TabEnum.embedding && <EmbeddingModelConfig />}
          {safeCurrentTab === TabEnum.rerank && <ReRankModelConfig />}
          {safeCurrentTab === TabEnum.tts && <TTSModelConfig />}
          {safeCurrentTab === TabEnum.whisper && <WhisperModelConfig />}
          {safeCurrentTab === TabEnum.ocr && <OCRModelConfig />}
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
