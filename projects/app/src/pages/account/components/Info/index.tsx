import React, { useCallback, useMemo } from 'react';
import { Box, Flex, Button, useDisclosure, useTheme, BoxProps } from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { UserUpdateParams } from '@/types/user';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useUserStore } from '@/web/support/user/useUserStore';
import type { UserType } from '@fastgpt/global/support/user/type.d';
import { useQuery } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useRouter } from 'next/router';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import { AI_POINT_USAGE_CARD_ROUTE } from '@/web/support/wallet/sub/constants';

import { useSystem } from '@fastgpt/web/hooks/useSystem';

const StandDetailModal = dynamic(() => import('./standardDetailModal'));
const UpdatePswModal = dynamic(() => import('./UpdatePswModal'));
const Account = () => {
  const { isPc } = useSystem();
  const { teamPlanStatus } = useUserStore();
  const standardPlan = teamPlanStatus?.standardConstants;

  const { initUserInfo } = useUserStore();

  useQuery(['init'], initUserInfo);

  return (
    <Box py={[3, '28px']} maxW={['95vw', '1080px']} px={[5, 10]} mx={'auto'}>
      {isPc ? (
        <Flex justifyContent={'center'}>
          <Box flex={'0 0 330px'}>
            <MyInfo />
            <Box mt={9}>
              <Other />
            </Box>
          </Box>
          {!!standardPlan && (
            <Box ml={'45px'} flex={'1 0 0'} maxW={'600px'}>
              <PlanUsage />
            </Box>
          )}
        </Flex>
      ) : (
        <>
          <MyInfo />
          {!!standardPlan && <PlanUsage />}
          <Other />
        </>
      )}
    </Box>
  );
};

export default React.memo(Account);

const MyInfo = () => {
  const theme = useTheme();
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { isPc } = useSystem();

  const { toast } = useToast();
  const {
    isOpen: isOpenPayModal,
    onClose: onClosePayModal,
    onOpen: onOpenPayModal
  } = useDisclosure();
  const {
    isOpen: isOpenUpdatePsw,
    onClose: onCloseUpdatePsw,
    onOpen: onOpenUpdatePsw
  } = useDisclosure();
  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.png',
    multiple: false
  });

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        avatar: data.avatar,
        timezone: data.timezone,
        openaiAccount: data.openaiAccount
      });
      reset(data);
      toast({
        title: t('common:dataset.data.Update Success Tip'),
        status: 'success'
      });
    },
    [reset, t, toast, updateUserInfo]
  );

  const onSelectFile = useCallback(
    async (e: File[]) => {
      const file = e[0];
      if (!file || !userInfo) return;
      try {
        const src = await compressImgFileAndUpload({
          type: MongoImageTypeEnum.userAvatar,
          file,
          maxW: 300,
          maxH: 300
        });

        onclickSave({
          ...userInfo,
          avatar: src
        });
      } catch (err: any) {
        toast({
          title: typeof err === 'string' ? err : t('common:common.error.Select avatar failed'),
          status: 'warning'
        });
      }
    },
    [onclickSave, t, toast, userInfo]
  );

  const labelStyles: BoxProps = {
    flex: '0 0 80px',
    fontSize: 'sm',
    color: 'myGray.900'
  };

  return (
    <Box>
      {/* user info */}
      {isPc && (
        <Flex alignItems={'center'} fontSize={'md'} h={'30px'}>
          <MyIcon mr={2} name={'support/user/userLight'} w={'1.25rem'} />
          {t('common:support.user.User self info')}
        </Flex>
      )}

      <Box mt={[0, 6]} fontSize={'sm'}>
        {isPc ? (
          <Flex alignItems={'center'} cursor={'pointer'}>
            <Box {...labelStyles}>{t('common:support.user.Avatar')}:&nbsp;</Box>

            <MyTooltip label={t('common:common.avatar.Select Avatar')}>
              <Box
                w={['44px', '56px']}
                h={['44px', '56px']}
                borderRadius={'50%'}
                border={theme.borders.base}
                overflow={'hidden'}
                p={'2px'}
                boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
                mb={2}
                onClick={onOpenSelectFile}
              >
                <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
              </Box>
            </MyTooltip>
          </Flex>
        ) : (
          <Flex
            flexDirection={'column'}
            alignItems={'center'}
            cursor={'pointer'}
            onClick={onOpenSelectFile}
          >
            <MyTooltip label={t('common:common.avatar.Select Avatar')}>
              <Box
                w={['44px', '54px']}
                h={['44px', '54px']}
                borderRadius={'50%'}
                border={theme.borders.base}
                overflow={'hidden'}
                p={'2px'}
                boxShadow={'0 0 5px rgba(0,0,0,0.1)'}
                mb={2}
              >
                <Avatar src={userInfo?.avatar} borderRadius={'50%'} w={'100%'} h={'100%'} />
              </Box>
            </MyTooltip>

            <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'}>
              <MyIcon mr={1} name={'edit'} w={'14px'} />
              {t('common:user.Replace')}
            </Flex>
          </Flex>
        )}

        <Flex alignItems={'center'} mt={6}>
          <Box {...labelStyles}>{t('common:user.Account')}:&nbsp;</Box>
          <Box flex={1}>{userInfo?.username}</Box>
        </Flex>
        <Flex alignItems={'center'} mt={6}>
          <Box {...labelStyles}>密码:&nbsp;</Box>
          <Box flex={1}>
            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {t('common:user.Update Password')}
            </Button>
          </Box>
        </Flex>
        {feConfigs.isPlus && (
          <Flex mt={6} alignItems={'center'}>
            <Box {...labelStyles}>{t('common:user.Password')}:&nbsp;</Box>
            <Box flex={1}>*****</Box>
            <Button size={'sm'} variant={'whitePrimary'} onClick={onOpenUpdatePsw}>
              {t('common:user.Change')}
            </Button>
          </Flex>
        )}
      </Box>
      {isOpenUpdatePsw && <UpdatePswModal onClose={onCloseUpdatePsw} />}
      <File onSelect={onSelectFile} />
    </Box>
  );
};
const PlanUsage = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { userInfo, initUserInfo, teamPlanStatus } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });

  const {
    isOpen: isOpenStandardModal,
    onClose: onCloseStandardModal,
    onOpen: onOpenStandardModal
  } = useDisclosure();

  const planName = useMemo(() => {
    if (!teamPlanStatus?.standard?.currentSubLevel) return '';
    return standardSubLevelMap[teamPlanStatus.standard.currentSubLevel].label;
  }, [teamPlanStatus?.standard?.currentSubLevel]);
  const standardPlan = teamPlanStatus?.standard;
  const isFreeTeam = useMemo(() => {
    if (!teamPlanStatus || !teamPlanStatus?.standardConstants) return false;
    const hasExtraDatasetSize =
      teamPlanStatus.datasetMaxSize > teamPlanStatus.standardConstants.maxDatasetSize;
    const hasExtraPoints =
      teamPlanStatus.totalPoints > teamPlanStatus.standardConstants.totalPoints;
    if (
      teamPlanStatus?.standard?.currentSubLevel === StandardSubLevelEnum.free &&
      !hasExtraDatasetSize &&
      !hasExtraPoints
    ) {
      return true;
    }
    return false;
  }, [teamPlanStatus]);

  useQuery(['init'], initUserInfo, {
    onSuccess(res) {
      reset(res);
    }
  });

  const datasetUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        colorScheme: 'green',
        value: 0,
        maxSize: t('common:common.Unlimited'),
        usedSize: 0
      };
    }
    const rate = teamPlanStatus.usedDatasetSize / teamPlanStatus.datasetMaxSize;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      maxSize: teamPlanStatus.datasetMaxSize || t('common:common.Unlimited'),
      usedSize: teamPlanStatus.usedDatasetSize
    };
  }, [teamPlanStatus, t]);
  const aiPointsUsageMap = useMemo(() => {
    if (!teamPlanStatus) {
      return {
        colorScheme: 'green',
        value: 0,
        maxSize: t('common:common.Unlimited'),
        usedSize: 0
      };
    }

    const rate = teamPlanStatus.usedPoints / teamPlanStatus.totalPoints;

    const colorScheme = (() => {
      if (rate < 0.5) return 'green';
      if (rate < 0.8) return 'yellow';
      return 'red';
    })();

    return {
      colorScheme,
      value: rate * 100,
      max: teamPlanStatus.totalPoints ? teamPlanStatus.totalPoints : t('common:common.Unlimited'),
      used: teamPlanStatus.usedPoints ? Math.round(teamPlanStatus.usedPoints) : 0
    };
  }, [teamPlanStatus, t]);

  return standardPlan ? (
    <Box mt={[6, 0]}>
      <Flex fontSize={'lg'} h={'30px'}>
        <Flex alignItems={'center'}>
          <MyIcon mr={2} name={'support/account/plans'} w={'20px'} />
          {t('common:support.wallet.subscription.Team plan and usage')}
        </Flex>
        <Button ml={4} size={'sm'} onClick={() => router.push(AI_POINT_USAGE_CARD_ROUTE)}>
          {t('common:support.user.Price')}
        </Button>
        <Button ml={4} variant={'whitePrimary'} size={'sm'} onClick={onOpenStandardModal}>
          {t('common:support.wallet.Standard Plan Detail')}
        </Button>
      </Flex>

      {isOpenStandardModal && <StandDetailModal onClose={onCloseStandardModal} />}
    </Box>
  ) : null;
};
const Other = () => {
  const theme = useTheme();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { t } = useTranslation();
  const { userInfo, updateUserInfo } = useUserStore();
  const { reset } = useForm<UserUpdateParams>({
    defaultValues: userInfo as UserType
  });
  const { isOpen: isOpenLaf, onClose: onCloseLaf, onOpen: onOpenLaf } = useDisclosure();
  const { isOpen: isOpenOpenai, onClose: onCloseOpenai, onOpen: onOpenOpenai } = useDisclosure();
  const { isOpen: isOpenConcat, onClose: onCloseConcat, onOpen: onOpenConcat } = useDisclosure();

  const onclickSave = useCallback(
    async (data: UserType) => {
      await updateUserInfo({
        avatar: data.avatar,
        timezone: data.timezone,
        openaiAccount: data.openaiAccount
      });
      reset(data);
      toast({
        title: '更新数据成功',
        status: 'success'
      });
    },
    [reset, toast, updateUserInfo]
  );
  return <></>;
};
