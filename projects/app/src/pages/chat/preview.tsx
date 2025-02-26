import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Text, Avatar } from '@chakra-ui/react';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import PageContainer from '@/components/PageContainer';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkWithAppType } from '@fastgpt/global/support/outLink/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectToDatabase } from '@/service/mongo';
import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';

type Props = {
  name: string;
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  title: string;
};

const PreviewChat = ({ appName, appIntro, appAvatar, title }: Props) => {
  const router = useRouter();
  const { shareId = '', chatId = '' } = router.query as {
    shareId: string;
    chatId: string;
  };

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);
  const { localUId } = useShareChatStore();

  const { onChangeChatId, forbidLoadChat } = useContextSelector(ChatContext, (v) => v);

  const { ChatBoxRef, chatRecords, setChatRecords, resetChatRecords, variablesForm } = useChat();

  const { loading } = useRequest2(
    async () => {
      if (!shareId || !chatId || forbidLoadChat.current) return;

      const response = await fetch(
        `/api/core/chat/preview/init?shareId=${shareId}&chatId=${chatId}`
      );
      if (!response.ok) {
        throw new Error('Failed to fetch chat data');
      }
      const res = await response.json();
      if (res.code !== 200) {
        throw new Error(res.message || 'Failed to fetch chat data');
      }

      setChatData(res.data);

      const history = res.data.history.map((item: any) => ({
        ...item,
        dataId: item.dataId || getNanoid(),
        status: ChatStatusEnum.finish
      }));

      resetChatRecords({
        records: history,
        variables: res.data.variables
      });
    },
    {
      manual: false,
      refreshDeps: [shareId, chatId],
      onError(e: any) {
        if (chatId) {
          onChangeChatId('');
        }
      },
      onFinally() {
        forbidLoadChat.current = false;
      }
    }
  );

  return (
    <>
      <NextHead title={title} desc={appIntro} icon={appAvatar} />
      <PageContainer isLoading={loading} p={[0, 5]}>
        <Flex h={'100%'} flexDirection={'column'} position={'relative'}>
          {/* Header */}
          <Flex
            px={[4, 6]}
            py={3}
            bg={'white'}
            borderBottom={'1px solid'}
            borderBottomColor={'gray.200'}
            alignItems={'center'}
          >
            <Avatar src={chatData.app.avatar || appAvatar} w={'32px'} h={'32px'} />
            <Box ml={3}>
              <Text fontSize={'md'} fontWeight={'bold'}>
                {title}
              </Text>
              <Text fontSize={'sm'} color={'gray.500'}>
                {chatData.app.name || appName}
              </Text>
            </Box>
          </Flex>

          {/* Chat Content */}
          <Box flex={1} bg={'white'}>
            <ChatBox
              ref={ChatBoxRef}
              chatHistories={chatRecords}
              setChatHistories={setChatRecords}
              variablesForm={variablesForm}
              appAvatar={chatData.app.avatar}
              userAvatar={chatData.userAvatar}
              chatConfig={chatData.app?.chatConfig}
              feedbackType={'user'}
              appId={chatData.appId}
              chatId={chatId}
              shareId={shareId}
              outLinkUid={localUId}
            />
          </Box>

          {/* Floating Button */}
          <Box
            position={'fixed'}
            bottom={'30px'}
            left={'50%'}
            transform={'translateX(-50%)'}
            zIndex={10}
          >
            <Box
              as="button"
              onClick={() => router.push(`/chat/share?shareId=${shareId}`)}
              bg={'white'}
              color={'black'}
              px={6}
              py={3}
              borderRadius={'full'}
              fontWeight={'bold'}
              fontSize={'md'}
              boxShadow={'0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'}
              transition={'all 0.2s'}
              _hover={{
                transform: 'translateY(-2px)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
              }}
              _active={{
                transform: 'translateY(0)',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
            >
              新建对话窗口
            </Box>
          </Box>
        </Flex>
      </PageContainer>
    </>
  );
};

const Render = (props: Props) => {
  const { shareId } = props;
  const { localUId } = useShareChatStore();

  const contextParams = useMemo(() => {
    return { shareId, outLinkUid: localUId };
  }, [shareId, localUId]);

  return (
    <ChatContextProvider params={contextParams}>
      <PreviewChat {...props} />
    </ChatContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';
  const chatId = context?.query?.chatId || '';

  const [app, chat] = await Promise.all([
    (async () => {
      try {
        await connectToDatabase();
        const app = (await MongoOutLink.findOne(
          {
            shareId
          },
          'appId'
        )
          .populate('appId', 'name avatar intro')
          .lean()) as OutLinkWithAppType;
        return app;
      } catch (error) {
        addLog.error('getServerSideProps', error);
        return undefined;
      }
    })(),
    (async () => {
      try {
        await connectToDatabase();
        const chat = await MongoChat.findOne(
          {
            shareId,
            chatId
          },
          'title customTitle'
        ).lean();
        return chat;
      } catch (error) {
        addLog.error('getServerSideProps', error);
        return undefined;
      }
    })()
  ]);

  return {
    props: {
      name: app?.name ?? 'name',
      appName: app?.appId?.name ?? 'name',
      appAvatar: app?.appId?.avatar ?? '',
      appIntro: app?.appId?.intro ?? 'intro',
      shareId: shareId ?? '',
      title: chat?.customTitle || chat?.title || app?.appId?.name || 'name',
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}
