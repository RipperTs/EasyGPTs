import React, { useEffect, useState } from 'react';
import {
  Flex,
  Box,
  Text,
  SimpleGrid,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  useDisclosure,
  ModalBody,
  HStack,
  Skeleton,
  useTheme
} from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useTranslation } from 'next-i18next';
import { getAppChatLogs, getAppChatLogsStats } from '@/web/core/app/api';
import dayjs from 'dayjs';
import { ChatSourceMap } from '@fastgpt/global/core/chat/constants';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { addDays } from 'date-fns';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import DateRangePicker, { DateRangeType } from '@fastgpt/web/components/common/DateRangePicker';
import { useI18n } from '@/web/context/I18n';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';

import dynamic from 'next/dynamic';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useUserStore } from '@/web/support/user/useUserStore';
import Tag from '@fastgpt/web/components/common/Tag';
import type { AppChatLogsStatsRes } from '@/pages/api/core/app/getChatLogsStats';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { useMemoizedFn } from 'ahooks';
const DetailLogsModal = dynamic(() => import('./DetailLogsModal'));

const formatNum = (num: number) => new Intl.NumberFormat('zh-CN').format(num);

const Logs = () => {
  const { t } = useTranslation();
  const { appT } = useI18n();
  const { isPc } = useSystem();
  const { toast } = useToast();
  const theme = useTheme();

  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { teamMembers } = useUserStore();

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -30),
    to: new Date()
  });
  const [stats, setStats] = useState<AppChatLogsStatsRes>({
    sessionCount: 0,
    qaCount: 0,
    questionCount: 0,
    answerCount: 0,
    activeUserCount: 0,
    activeUserLoggedInCount: 0,
    activeUserAnonymousCount: 0
  });
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  const { isOpen: isOpenMarkDesc, onClose: onCloseMarkDesc } = useDisclosure();

  const {
    data: logs,
    isLoading,
    Pagination,
    getData,
    pageNum,
    total
  } = usePagination({
    api: getAppChatLogs,
    pageSize: 20,
    params: {
      appId,
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1)
    }
  });

  const [detailLogsId, setDetailLogsId] = useState<string>();

  const loadStats = useMemoizedFn(async () => {
    if (!appId) return;
    setIsStatsLoading(true);
    try {
      const res = await getAppChatLogsStats({
        appId,
        dateStart: dateRange.from || new Date(),
        dateEnd: addDays(dateRange.to || new Date(), 1)
      });
      setStats(res);
    } catch (error) {
      toast({
        title: getErrText(error, t('common:core.chat.error.data_error')),
        status: 'error'
      });
    }
    setIsStatsLoading(false);
  });

  useEffect(() => {
    loadStats();
  }, [appId, loadStats]);

  return (
    <Flex flexDirection={'column'} h={'100%'}>
      {isPc && (
        <Box {...cardStyles} boxShadow={2} px={[4, 8]} py={[3, 4]}>
          <SimpleGrid columns={[1, 3]} spacing={6}>
            <Box bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={3}>
              <Flex alignItems={'center'} justifyContent={'space-between'} mb={1}>
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={'34px'}
                  h={'34px'}
                  borderRadius={'9px'}
                  bg={'myGray.05'}
                >
                  <MyIcon name={'core/chat/chatFill'} w={'18px'} color={'primary.600'} />
                </Flex>
              </Flex>
              <Text fontSize={'xs'} color={'myGray.600'} mb={0.5}>
                会话数量
              </Text>
              <Skeleton isLoaded={!isStatsLoading}>
                <Text
                  fontSize={['lg', 'xl']}
                  lineHeight={1.1}
                  fontWeight={'bold'}
                  color={'myGray.900'}
                  mb={0.5}
                  mt={2}
                >
                  {formatNum(stats.sessionCount)}
                </Text>
              </Skeleton>
              <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                按会话更新时间统计
              </Text>
            </Box>

            <Box bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={3}>
              <Flex alignItems={'center'} justifyContent={'space-between'} mb={1}>
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={'34px'}
                  h={'34px'}
                  borderRadius={'9px'}
                  bg={'myGray.05'}
                >
                  <MyIcon name={'common/resultLight'} w={'18px'} color={'primary.600'} />
                </Flex>
              </Flex>
              <Text fontSize={'xs'} color={'myGray.600'} mb={0.5}>
                问答数量
              </Text>
              <Skeleton isLoaded={!isStatsLoading}>
                <Text
                  fontSize={['lg', 'xl']}
                  lineHeight={1.1}
                  fontWeight={'bold'}
                  color={'myGray.900'}
                  mb={0.5}
                  mt={2}
                >
                  {formatNum(stats.qaCount)}
                </Text>
              </Skeleton>
              <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                提问 {formatNum(stats.questionCount)} · 回答 {formatNum(stats.answerCount)}
              </Text>
            </Box>

            <Box bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={3}>
              <Flex alignItems={'center'} justifyContent={'space-between'} mb={1}>
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={'34px'}
                  h={'34px'}
                  borderRadius={'9px'}
                  bg={'myGray.05'}
                >
                  <MyIcon name={'support/user/userFill'} w={'18px'} color={'primary.600'} />
                </Flex>
              </Flex>
              <Text fontSize={'xs'} color={'myGray.600'} mb={0.5}>
                活跃用户
              </Text>
              <Skeleton isLoaded={!isStatsLoading}>
                <Text
                  fontSize={['lg', 'xl']}
                  lineHeight={1.1}
                  fontWeight={'bold'}
                  color={'myGray.900'}
                  mb={0.5}
                  mt={2}
                >
                  {formatNum(stats.activeUserCount)}
                </Text>
              </Skeleton>
              <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                登录用户 {formatNum(stats.activeUserLoggedInCount)} · 匿名用户{' '}
                {formatNum(stats.activeUserAnonymousCount)}
              </Text>
            </Box>
          </SimpleGrid>
        </Box>
      )}

      {/* table */}
      <Flex
        flexDirection={'column'}
        {...cardStyles}
        boxShadow={3.5}
        mt={[0, 4]}
        px={[4, 8]}
        py={[4, 6]}
        flex={'1 0 0'}
      >
        <TableContainer mt={[0, 3]} flex={'1 0 0'} h={0} overflowY={'auto'}>
          <Table variant={'simple'} fontSize={'sm'}>
            <Thead>
              <Tr>
                <Th>{t('common:core.app.logs.Source And Time')}</Th>
                <Th>{t('app:logs_chat_user')}</Th>
                <Th>{t('app:logs_title')}</Th>
                <Th>{t('app:logs_message_total')}</Th>
                <Th>{t('app:feedback_count')}</Th>
                <Th>{t('common:core.app.feedback.Custom feedback')}</Th>
                <Th>{t('app:mark_count')}</Th>
              </Tr>
            </Thead>
            <Tbody fontSize={'xs'}>
              {logs.map((item) => (
                <Tr
                  key={item._id}
                  _hover={{ bg: 'myWhite.600' }}
                  cursor={'pointer'}
                  title={t('common:core.view_chat_detail')}
                  onClick={() => setDetailLogsId(item.id)}
                >
                  <Td>
                    <Box>{t(ChatSourceMap[item.source]?.name || ('UnKnow' as any))}</Box>
                    <Box color={'myGray.500'}>{dayjs(item.time).format('YYYY/MM/DD HH:mm')}</Box>
                  </Td>
                  <Td>
                    <Box>
                      {item.source === 'share' || item.source === 'api' ? (
                        item.outLinkUid
                      ) : (
                        <Tag key={item._id} type={'fill'} colorSchema="white">
                          <Avatar
                            src={teamMembers.find((v) => v.tmbId === item.tmbId)?.avatar}
                            w="1.25rem"
                          />
                          <Box fontSize={'sm'} ml={1}>
                            {teamMembers.find((v) => v.tmbId === item.tmbId)?.memberName}
                          </Box>
                        </Tag>
                      )}
                    </Box>
                  </Td>
                  <Td className="textEllipsis" maxW={'250px'}>
                    {item.title}
                  </Td>
                  <Td>{item.messageCount}</Td>
                  <Td w={'100px'}>
                    {!!item?.userGoodFeedbackCount && (
                      <Flex
                        mb={item?.userGoodFeedbackCount ? 1 : 0}
                        bg={'green.100'}
                        color={'green.600'}
                        px={3}
                        py={1}
                        alignItems={'center'}
                        justifyContent={'center'}
                        borderRadius={'md'}
                        fontWeight={'bold'}
                      >
                        <MyIcon
                          mr={1}
                          name={'core/chat/feedback/goodLight'}
                          color={'green.600'}
                          w={'14px'}
                        />
                        {item.userGoodFeedbackCount}
                      </Flex>
                    )}
                    {!!item?.userBadFeedbackCount && (
                      <Flex
                        bg={'#FFF2EC'}
                        color={'#C96330'}
                        px={3}
                        py={1}
                        alignItems={'center'}
                        justifyContent={'center'}
                        borderRadius={'md'}
                        fontWeight={'bold'}
                      >
                        <MyIcon
                          mr={1}
                          name={'core/chat/feedback/badLight'}
                          color={'#C96330'}
                          w={'14px'}
                        />
                        {item.userBadFeedbackCount}
                      </Flex>
                    )}
                    {!item?.userGoodFeedbackCount && !item?.userBadFeedbackCount && <>-</>}
                  </Td>
                  <Td>{item.customFeedbacksCount || '-'}</Td>
                  <Td>{item.markCount}</Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
          {logs.length === 0 && !isLoading && <EmptyTip text={appT('logs_empty')}></EmptyTip>}
        </TableContainer>

        <HStack w={'100%'} mt={3} justifyContent={'flex-end'}>
          <DateRangePicker
            defaultDate={dateRange}
            position="top"
            onChange={setDateRange}
            onSuccess={() => {
              getData(1);
              loadStats();
            }}
          />
          <Pagination />
        </HStack>
      </Flex>

      {!!detailLogsId && (
        <DetailLogsModal
          appId={appId}
          chatId={detailLogsId}
          onClose={() => {
            setDetailLogsId(undefined);
            getData(pageNum);
          }}
        />
      )}
      <MyModal
        isOpen={isOpenMarkDesc}
        onClose={onCloseMarkDesc}
        title={t('common:core.chat.Mark Description Title')}
      >
        <ModalBody whiteSpace={'pre-wrap'}>{t('common:core.chat.Mark Description')}</ModalBody>
      </MyModal>
    </Flex>
  );
};

export default React.memo(Logs);
