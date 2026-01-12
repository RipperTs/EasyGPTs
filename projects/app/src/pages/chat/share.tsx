import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Box, Flex, Drawer, DrawerOverlay, DrawerContent } from '@chakra-ui/react';
import { streamFetch } from '@/web/common/api/fetch';
import { useShareChatStore } from '@/web/core/chat/storeShareChat';
import SideBar from '@/components/SideBar';
import { GPTMessages2Chats } from '@fastgpt/global/core/chat/adapt';
import { customAlphabet } from 'nanoid';

import ChatBox from '@/components/core/chat/ChatContainer/ChatBox';
import type { StartChatFnProps } from '@/components/core/chat/ChatContainer/type';

import PageContainer from '@/components/PageContainer';
import ChatHeader from './components/ChatHeader';
import ChatHistorySlider from './components/ChatHistorySlider';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { useTranslation } from 'next-i18next';
import { delChatRecordById, getChatHistories, getInitOutLinkChatInfo } from '@/web/core/chat/api';
import { getChatTitleFromChatMessage } from '@fastgpt/global/core/chat/utils';
import { ChatStatusEnum } from '@fastgpt/global/core/chat/constants';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';
import { OutLinkWithAppType } from '@fastgpt/global/support/outLink/type';
import { addLog } from '@fastgpt/service/common/system/log';
import { connectToDatabase } from '@/service/mongo';
import NextHead from '@/components/common/NextHead';
import { useContextSelector } from 'use-context-selector';
import ChatContextProvider, { ChatContext } from '@/web/core/chat/context/chatContext';
import { alternativeModel, InitChatResponse } from '@/global/core/chat/api';
import { defaultChatData } from '@/global/core/chat/constants';
import { useMount } from 'ahooks';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { useChat } from '@/components/core/chat/ChatContainer/useChat';
import { getNanoid } from '@fastgpt/global/common/string/tools';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { useUserStore } from '@/web/support/user/useUserStore';

const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz1234567890', 12);

const CustomPluginRunBox = dynamic(() => import('./components/CustomPluginRunBox'));

type Props = {
  name: string;
  appName: string;
  appIntro: string;
  appAvatar: string;
  shareId: string;
  isLogin: boolean;
  alternativeModelList?: alternativeModel[];
};

type OutLinkProps = Props & {
  outLinkUid: string;
};

const OutLink = ({
  appName,
  appIntro,
  appAvatar,
  alternativeModelList,
  outLinkUid
}: OutLinkProps) => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    shareId = '',
    chatId = '',
    showHistory = '1',
    showHead = '1',
    ...customVariables
  } = router.query as {
    shareId: string;
    chatId: string;
    showHistory: '0' | '1';
    showHead: '0' | '1';
    [key: string]: string;
  };
  const { isPc } = useSystem();
  const initSign = useRef(false);
  const [isEmbed, setIdEmbed] = useState(true);

  const [chatData, setChatData] = useState<InitChatResponse>(defaultChatData);
  const appId = chatData.appId;

  const {
    onUpdateHistoryTitle,
    loadHistories,
    onUpdateHistory,
    onClearHistories,
    onDelHistory,
    isOpenSlider,
    onCloseSlider,
    forbidLoadChat,
    onChangeChatId
  } = useContextSelector(ChatContext, (v) => v);

  const {
    ChatBoxRef,
    chatRecords,
    setChatRecords,
    variablesForm,
    pluginRunTab,
    setPluginRunTab,
    resetChatRecords
  } = useChat();

  const startChat = useCallback(
    async ({
      messages,
      controller,
      generatingMessage,
      variables,
      responseChatItemId
    }: StartChatFnProps) => {
      const completionChatId = chatId || getNanoid();
      const histories = messages.slice(-1);

      //post message to report chat start
      window.top?.postMessage(
        {
          type: 'shareChatStart',
          data: {
            question: histories[0]?.content
          }
        },
        '*'
      );

      const { responseText, responseData } = await streamFetch({
        data: {
          messages: histories,
          variables: {
            ...variables,
            ...customVariables
          },
          responseChatItemId,
          shareId,
          chatId: completionChatId,
          appType: chatData.app.type,
          outLinkUid
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      const newTitle = getChatTitleFromChatMessage(GPTMessages2Chats(histories)[0]);

      // new chat
      if (completionChatId !== chatId) {
        onChangeChatId(completionChatId, true);
      }
      onUpdateHistoryTitle({ chatId: completionChatId, newTitle });

      // update chat window
      setChatData((state) => ({
        ...state,
        title: newTitle
      }));

      // hook message
      window.top?.postMessage(
        {
          type: 'shareChatFinish',
          data: {
            question: histories[0]?.content,
            answer: responseText
          }
        },
        '*'
      );

      return { responseText, responseData, isNewChat: forbidLoadChat.current };
    },
    [
      chatId,
      customVariables,
      shareId,
      chatData.app.type,
      outLinkUid,
      onUpdateHistoryTitle,
      forbidLoadChat,
      onChangeChatId
    ]
  );

  const { loading } = useRequest2(
    async () => {
      if (!shareId || !outLinkUid || forbidLoadChat.current) return;

      const res = await getInitOutLinkChatInfo({
        chatId,
        shareId,
        outLinkUid
      });
      setChatData(res);

      const history = res.history.map((item) => ({
        ...item,
        dataId: item.dataId || nanoid(),
        status: ChatStatusEnum.finish
      }));

      resetChatRecords({
        records: history,
        variables: res.variables
      });
    },
    {
      manual: false,
      refreshDeps: [shareId, outLinkUid, chatId],
      onSuccess() {
        // send init message
        if (!initSign.current) {
          initSign.current = true;
          if (window !== top) {
            window.top?.postMessage({ type: 'shareChatReady' }, '*');
          }
        }
      },
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

  // window init
  useMount(() => {
    setIdEmbed(window !== top);
  });

  return (
    <>
      <NextHead title={appName} desc={appIntro} icon={appAvatar} />

      <PageContainer
        isLoading={loading}
        {...(isEmbed
          ? { p: '0 !important', insertProps: { borderRadius: '0', boxShadow: 'none' } }
          : { p: [0, 5] })}
      >
        <Flex h={'100%'} flexDirection={['column', 'row']}>
          {showHistory === '1' &&
            ((children: React.ReactNode) => {
              return isPc ? (
                <SideBar>{children}</SideBar>
              ) : (
                <Drawer
                  isOpen={isOpenSlider}
                  placement="left"
                  autoFocus={false}
                  size={'xs'}
                  onClose={onCloseSlider}
                >
                  <DrawerOverlay backgroundColor={'rgba(255,255,255,0.5)'} />
                  <DrawerContent maxWidth={'75vw'} boxShadow={'2px 0 10px rgba(0,0,0,0.15)'}>
                    {children}
                  </DrawerContent>
                </Drawer>
              );
            })(
              <ChatHistorySlider
                appName={chatData.app.name}
                appAvatar={chatData.app.avatar}
                confirmClearText={t('common:core.chat.Confirm to clear share chat history')}
                onDelHistory={({ chatId }) =>
                  onDelHistory({ appId: chatData.appId, chatId, shareId, outLinkUid })
                }
                onClearHistory={() => {
                  onClearHistories({ shareId, outLinkUid });
                }}
                onSetHistoryTop={(e) => {
                  onUpdateHistory({
                    ...e,
                    appId: chatData.appId,
                    shareId,
                    outLinkUid
                  });
                }}
                onSetCustomTitle={(e) => {
                  onUpdateHistory({
                    appId: chatData.appId,
                    chatId: e.chatId,
                    customTitle: e.title,
                    shareId,
                    outLinkUid
                  });
                }}
                appIntro={chatData.app.intro}
              />
            )}

          {/* chat container */}
          <Flex
            position={'relative'}
            h={[0, '100%']}
            w={['100%', 0]}
            flex={'1 0 0'}
            flexDirection={'column'}
          >
            {/* header */}
            {showHead === '1' ? (
              <ChatHeader
                alternativeModelList={alternativeModelList}
                chatData={chatData}
                history={chatRecords}
                showHistory={showHistory === '1'}
              />
            ) : null}
            {/* chat box */}
            <Box flex={1} bg={'white'}>
              {chatData.app.type === AppTypeEnum.plugin ? (
                <CustomPluginRunBox
                  pluginInputs={chatData.app.pluginInputs}
                  variablesForm={variablesForm}
                  histories={chatRecords}
                  setHistories={setChatRecords}
                  appId={chatData.appId}
                  tab={pluginRunTab}
                  setTab={setPluginRunTab}
                  onNewChat={() => onChangeChatId(getNanoid())}
                  onStartChat={startChat}
                />
              ) : (
                <ChatBox
                  ref={ChatBoxRef}
                  chatHistories={chatRecords}
                  setChatHistories={setChatRecords}
                  variablesForm={variablesForm}
                  appAvatar={chatData.app.avatar}
                  userAvatar={chatData.userAvatar}
                  chatConfig={chatData.app?.chatConfig}
                  feedbackType={'user'}
                  onStartChat={startChat}
                  onDelMessage={({ contentId }) =>
                    delChatRecordById({
                      contentId,
                      appId: chatData.appId,
                      chatId,
                      shareId,
                      outLinkUid
                    })
                  }
                  appId={chatData.appId}
                  chatId={chatId}
                  shareId={shareId}
                  outLinkUid={outLinkUid}
                />
              )}
            </Box>
          </Flex>
        </Flex>
      </PageContainer>
    </>
  );
};

const Render = (props: Props) => {
  const { shareId, isLogin } = props;
  const router = useRouter();
  const { userInfo, initUserInfo } = useUserStore();
  const { localUId } = useShareChatStore();
  const [checkedLogin, setCheckedLogin] = useState(!isLogin);
  const checkingLoginRef = useRef(false);

  const authToken = useMemo(() => {
    const value = router.query.authToken;
    return typeof value === 'string' ? value : '';
  }, [router.query.authToken]);

  const outLinkUid = useMemo(() => {
    if (isLogin) return userInfo?.username || '';
    return authToken || localUId;
  }, [authToken, isLogin, localUId, userInfo?.username]);

  useEffect(() => {
    if (!isLogin) return;
    if (userInfo) {
      setCheckedLogin(true);
      return;
    }
    if (checkingLoginRef.current) return;
    checkingLoginRef.current = true;

    let canceled = false;

    initUserInfo()
      .then(() => {
        if (canceled) return;
        setCheckedLogin(true);
      })
      .catch((err) => {
        if (canceled) return;
        // In dev (React StrictMode) or when maxQuantity aborts old requests, ignore cancellation.
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        window.location.replace(
          `/login?lastRoute=${encodeURIComponent(location.pathname + location.search)}`
        );
      })
      .finally(() => {
        if (canceled) return;
        checkingLoginRef.current = false;
      });

    return () => {
      canceled = true;
    };
  }, [initUserInfo, isLogin, userInfo]);

  const contextParams = useMemo(() => {
    return { shareId, outLinkUid };
  }, [shareId, outLinkUid]);

  if (!checkedLogin || !outLinkUid) {
    return null;
  }

  return (
    <ChatContextProvider params={contextParams}>
      <OutLink {...props} outLinkUid={outLinkUid} />
    </ChatContextProvider>
  );
};

export default Render;

export async function getServerSideProps(context: any) {
  const shareId = context?.query?.shareId || '';

  // 查询当前分享的app信息及分享链接配置信息
  const app = await (async () => {
    try {
      await connectToDatabase();
      const app = (await MongoOutLink.findOne(
        {
          shareId
        },
        'appId limit name isLogin alternativeModel'
      )
        .populate('appId', 'name avatar intro')
        .lean()) as OutLinkWithAppType;
      return app;
    } catch (error) {
      addLog.error('getServerSideProps', error);
      return undefined;
    }
  })();

  const isLogin = app?.isLogin ?? false;

  const appId = app?.appId._id;
  // 是否加入了备选模型列表
  const alternativeModel = app?.alternativeModel ?? false;
  let alternativeModelList: alternativeModel[] = [];

  if (alternativeModel) {
    // 查询相应文件夹下的其他app, 用于后续备选模型列表展示
    const directoryApps: any[] | null = await (async () => {
      try {
        // 查找指定 appId 的文档
        const currentApp = await MongoApp.findById(appId);
        if (!currentApp) {
          return null;
        }
        const results = await MongoApp.find({ parentId: currentApp.parentId }).select('_id name');
        if (!results) {
          return null;
        }

        const directoryAppIds: any[] = [];
        results.forEach((item) => {
          directoryAppIds.push(item._id);
        });

        return directoryAppIds;
      } catch (error) {
        console.error('Error querying the database:', error);
        return null;
      }
    })();

    // 获取备选模型列表
    if (directoryApps !== null) {
      alternativeModelList = await (async () => {
        try {
          if (!alternativeModel) {
            return [];
          }
          await connectToDatabase();
          const app = (await MongoOutLink.aggregate([
            {
              $match: {
                alternativeModel: true,
                isLogin: isLogin,
                appId: {
                  $in: directoryApps
                }
              }
            },
            {
              $group: {
                _id: '$appId',
                apps: { $push: '$$ROOT' },
                shareId: { $first: '$shareId' },
                name: { $first: '$name' }
              }
            },
            {
              $lookup: {
                from: 'apps', // Assuming the collection name for apps is 'apps'
                localField: '_id',
                foreignField: '_id',
                as: 'appDetails'
              }
            },
            { $unwind: '$appDetails' },
            {
              $project: {
                _id: 0,
                appId: { $toString: '$_id' },
                appName: '$appDetails.name',
                appAvatar: '$appDetails.avatar',
                appIntro: '$appDetails.intro',
                shareId: 1,
                name: 1
              }
            }
          ])) as alternativeModel[];

          // 排除掉 shareId 为当前分享的app
          return app
            .filter((item) => item.shareId !== shareId)
            .sort((a, b) => {
              return a.appName.localeCompare(b.appName, undefined, {
                numeric: true,
                sensitivity: 'base'
              });
            });
        } catch (error) {
          return [];
        }
      })();
    }
  }

  return {
    props: {
      name: app?.name ?? 'name',
      appName: app?.appId?.name ?? 'name',
      appAvatar: app?.appId?.avatar ?? '',
      appIntro: app?.appId?.intro ?? 'intro',
      shareId: shareId ?? '',
      isLogin: isLogin,
      alternativeModelList,
      ...(await serviceSideProps(context, ['file', 'app', 'chat', 'workflow']))
    }
  };
}
