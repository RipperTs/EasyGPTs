import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Center, Flex } from '@chakra-ui/react';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { ResLogin } from '@/global/support/api/userRes.d';
import { useRouter } from 'next/router';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useChatStore } from '@/web/core/chat/context/storeChat';
import LoginForm from './components/LoginForm/LoginForm';
import dynamic from 'next/dynamic';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { clearToken, setToken } from '@/web/support/user/auth';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useMount } from 'ahooks';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { postXgtSsoLogin } from '@/web/support/user/api';

const RegisterForm = dynamic(() => import('./components/RegisterForm'));
const ForgetPasswordForm = dynamic(() => import('./components/ForgetPasswordForm'));
const WechatForm = dynamic(() => import('./components/LoginForm/WechatForm'));

function getErrMsg(err: unknown) {
  if (!err || typeof err !== 'object') return '';
  if (!('message' in err)) return '';
  const message = (err as { message?: unknown }).message;
  return typeof message === 'string' ? message : '';
}

const Login = () => {
  const router = useRouter();
  const { lastRoute = '' } = router.query as { lastRoute: string };
  const { feConfigs } = useSystemStore();
  const xgtSsoAuthUrl = useMemo(() => feConfigs?.xgtSsoAuthUrl?.trim(), [feConfigs?.xgtSsoAuthUrl]);
  const { toast } = useToast();
  const [pageType, setPageType] = useState<`${LoginPageTypeEnum}`>();
  const [ssoRequesting, setSsoRequesting] = useState(false);
  const { setUserInfo } = useUserStore();
  const { setLastChatId, setLastChatAppId } = useChatStore();
  const ssoHandledRef = useRef(false);

  const loginSuccess = useCallback(
    (res: ResLogin) => {
      // init store
      setLastChatId('');
      setLastChatAppId('');

      setUserInfo(res.user);
      setToken(res.token);
      setTimeout(() => {
        router.push(lastRoute ? decodeURIComponent(lastRoute) : '/app/statistics');
      }, 300);
    },
    [lastRoute, router, setLastChatId, setLastChatAppId, setUserInfo]
  );

  function DynamicComponent({ type }: { type: `${LoginPageTypeEnum}` }) {
    const TypeMap = {
      [LoginPageTypeEnum.passwordLogin]: LoginForm,
      [LoginPageTypeEnum.register]: RegisterForm,
      [LoginPageTypeEnum.forgetPassword]: ForgetPasswordForm,
      [LoginPageTypeEnum.wechat]: WechatForm
    };

    const Component = TypeMap[type];

    return <Component setPageType={setPageType} loginSuccess={loginSuccess} />;
  }

  /* default login type */
  useEffect(() => {
    setPageType(
      feConfigs?.oauth?.wechat ? LoginPageTypeEnum.wechat : LoginPageTypeEnum.passwordLogin
    );
  }, [feConfigs.oauth]);

  /* XGT SSO callback: /login?token=xxx&username=xxx */
  useEffect(() => {
    if (!router.isReady) return;
    if (ssoHandledRef.current) return;

    const token = router.query.token;
    const username = router.query.username;
    const card = router.query.card;
    const loginName =
      typeof username === 'string' ? username : typeof card === 'string' ? card : '';
    if (typeof token !== 'string' || !loginName) return;

    ssoHandledRef.current = true;

    const nextQuery = { ...router.query };
    delete nextQuery.token;
    delete nextQuery.username;
    delete nextQuery.card;

    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });

    (async () => {
      setSsoRequesting(true);
      try {
        const res = await postXgtSsoLogin({ token, username: loginName });
        loginSuccess(res);
        toast({ title: 'SSO 登录成功', status: 'success' });
      } catch (error) {
        toast({ title: getErrMsg(error) || 'SSO 登录失败', status: 'error' });
      } finally {
        setSsoRequesting(false);
      }
    })();
  }, [loginSuccess, router, toast]);

  useMount(() => {
    clearToken();
    router.prefetch('/app/statistics');
  });

  return (
    <>
      <Flex
        alignItems={'center'}
        justifyContent={'center'}
        bg={`url('/icon/login-bg.svg') no-repeat`}
        backgroundSize={'cover'}
        userSelect={'none'}
        h={'100%'}
        px={[0, '10vw']}
      >
        <Flex
          flexDirection={'column'}
          w={['100%', 'auto']}
          h={['100%', '700px']}
          maxH={['100%', '90vh']}
          bg={'white'}
          px={['5vw', '88px']}
          py={'5vh'}
          borderRadius={[0, '24px']}
          boxShadow={[
            '',
            '0px 0px 1px 0px rgba(19, 51, 107, 0.20), 0px 32px 64px -12px rgba(19, 51, 107, 0.20)'
          ]}
        >
          <Box w={['100%', '380px']} flex={'1 0 0'}>
            {ssoRequesting ? (
              <Center w={'full'} h={'full'} position={'relative'}>
                <Loading fixed={false} />
              </Center>
            ) : pageType ? (
              <DynamicComponent type={pageType} />
            ) : (
              <Center w={'full'} h={'full'} position={'relative'}>
                <Loading fixed={false} />
              </Center>
            )}
          </Box>
        </Flex>
      </Flex>
    </>
  );
};

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['app', 'user', 'login'])) }
  };
}

export default Login;
