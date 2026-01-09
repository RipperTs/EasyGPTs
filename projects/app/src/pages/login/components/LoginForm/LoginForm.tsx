import React, { useState, Dispatch, useCallback, useMemo } from 'react';
import { FormControl, Flex, Input, Button, Box, AbsoluteCenter, Divider } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { LoginPageTypeEnum } from '@/web/support/user/login/constants';
import { postLogin } from '@/web/support/user/api';
import type { ResLogin } from '@/global/support/api/userRes';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import FormLayout from './components/FormLayout';
import { buildXgtSsoAuthUrl, omitUrlQueryParams } from '../../utils/xgtSso';

interface Props {
  setPageType: Dispatch<`${LoginPageTypeEnum}`>;
  loginSuccess: (e: ResLogin) => void;
}

interface LoginFormType {
  username: string;
  password: string;
}

const LoginForm = ({ setPageType, loginSuccess }: Props) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const xgtSsoAuthUrl = useMemo(() => feConfigs?.xgtSsoAuthUrl?.trim(), [feConfigs?.xgtSsoAuthUrl]);
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginFormType>();

  const [requesting, setRequesting] = useState(false);

  const onclickLogin = useCallback(
    async ({ username, password }: LoginFormType) => {
      setRequesting(true);
      try {
        loginSuccess(
          await postLogin({
            username,
            password
          })
        );
        toast({
          title: t('login:login_success'),
          status: 'success'
        });
      } catch (error: any) {
        toast({
          title: error.message || t('login:login_failed'),
          status: 'error'
        });
      }
      setRequesting(false);
    },
    [loginSuccess, t, toast]
  );

  const onClickXgtSsoLogin = useCallback(() => {
    if (!xgtSsoAuthUrl || typeof window === 'undefined') return;

    const rawRedirectUrl = window.location.href.split('#')[0];
    const redirectUrl = omitUrlQueryParams(rawRedirectUrl, ['token', 'username', 'card']);

    const authUrl = buildXgtSsoAuthUrl({
      authUrl: xgtSsoAuthUrl,
      redirectUrl
    });

    window.location.href = authUrl;
  }, [xgtSsoAuthUrl]);

  return (
    <FormLayout setPageType={setPageType} pageType={LoginPageTypeEnum.passwordLogin}>
      <Box
        mt={'42px'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !requesting) {
            handleSubmit(onclickLogin)();
          }
        }}
      >
        <FormControl isInvalid={!!errors.username}>
          <Input
            bg={'myGray.50'}
            placeholder="请输入您的账号 / 工号"
            {...register('username', {
              required: true
            })}
          ></Input>
        </FormControl>
        <FormControl mt={6} isInvalid={!!errors.password}>
          <Input
            bg={'myGray.50'}
            type={'password'}
            placeholder="请输入您的密码"
            {...register('password', {
              required: true,
              maxLength: {
                value: 60,
                message: t('login:password_condition')
              }
            })}
          ></Input>
        </FormControl>

        <Button
          type="submit"
          my={6}
          w={'100%'}
          size={['md', 'md']}
          colorScheme="blue"
          isLoading={requesting}
          onClick={handleSubmit(onclickLogin)}
        >
          {t('login:Login')}
        </Button>

        {xgtSsoAuthUrl && (
          <Box mt={10}>
            <Box position="relative" mb={2}>
              <Divider borderColor="myGray.200" />
              <AbsoluteCenter bg="white" px={3} color="myGray.500" fontSize="xs">
                其他登录方式
              </AbsoluteCenter>
            </Box>
            <Flex justify="center" mt={5}>
              <Button
                type="button"
                variant="whitePrimary"
                size="md"
                w={['100%', '200px']}
                leftIcon={
                  <Box
                    w="24px"
                    h="24px"
                    borderRadius="full"
                    bg="white"
                    border="1px solid"
                    borderColor="myGray.200"
                    overflow="hidden"
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Box
                      as="img"
                      src="./imgs/xgtLogo.jpg"
                      alt=""
                      w="100%"
                      h="100%"
                      objectFit="cover"
                    />
                  </Box>
                }
                onClick={onClickXgtSsoLogin}
              >
                抚顺新钢铁 SSO 登录
              </Button>
            </Flex>
          </Box>
        )}

        <Flex align={'center'} justifyContent={'flex-end'} color={'primary.700'}>
          {feConfigs?.find_password_method && feConfigs.find_password_method.length > 0 && (
            <Box
              cursor={'pointer'}
              _hover={{ textDecoration: 'underline' }}
              onClick={() => setPageType('forgetPassword')}
              fontSize="sm"
            >
              {t('login:forget_password')}
            </Box>
          )}
          {feConfigs?.register_method && feConfigs.register_method.length > 0 && (
            <>
              <Box mx={3} h={'16px'} w={'1.5px'} bg={'myGray.250'}></Box>
              <Box
                cursor={'pointer'}
                _hover={{ textDecoration: 'underline' }}
                onClick={() => setPageType('register')}
                fontSize="sm"
              >
                {t('login:register')}
              </Box>
            </>
          )}
        </Flex>
      </Box>
    </FormLayout>
  );
};

export default LoginForm;
