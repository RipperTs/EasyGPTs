import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalBody,
  ModalFooter,
  Spinner,
  Text,
  useTheme
} from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import type { EChartsOption } from 'echarts';

import MyModal from '@fastgpt/web/components/common/MyModal';
import Avatar from '@fastgpt/web/components/common/Avatar';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';

import { getAppTrend } from '@/web/core/statistics/api';

const EChartsPanel = dynamic(() => import('./EChartsPanel'), { ssr: false });

type RangeDays = 7 | 30 | 90 | 365;

export type TrendAppItem = {
  appId: string;
  name: string;
  avatar: string;
  type: string;
};

const AppTrendModal = ({ app, onClose }: { app: TrendAppItem; onClose: () => void }) => {
  const theme = useTheme();
  const router = useRouter();
  const { isPc } = useSystem();

  const [days, setDays] = useState<RangeDays>(7);

  useEffect(() => {
    setDays(7);
  }, [app.appId]);

  const { data, isFetching, isLoading } = useQuery(
    ['appTrend', app.appId, days],
    () => getAppTrend({ appId: app.appId, days }),
    { staleTime: 10_000 }
  );

  const dateList = data?.trend?.map((i) => i.date) ?? [];
  const questionsList = data?.trend?.map((i) => i.questions) ?? [];
  const chatsList = data?.trend?.map((i) => i.chats) ?? [];

  const trendOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['提问', '会话'] },
      grid: { left: 16, right: 16, top: 44, bottom: 30, containLabel: true },
      xAxis: {
        type: 'category',
        data: dateList,
        axisLabel: { formatter: (v: string) => v.slice(5) }
      },
      yAxis: [{ type: 'value' }],
      series: [
        {
          name: '提问',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: questionsList
        },
        {
          name: '会话',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: chatsList
        }
      ]
    }),
    [chatsList, dateList, questionsList]
  );

  return (
    <MyModal
      isOpen
      onClose={onClose}
      title={
        <Flex alignItems={'center'} gap={2}>
          <Avatar src={app.avatar} w={'24px'} h={'24px'} borderRadius={'8px'} />
          <Text maxW={['44vw', '360px']} noOfLines={1} color={'myGray.900'}>
            {app.name}
          </Text>
          <Text fontSize={'sm'} color={'myGray.500'} fontWeight={'normal'}>
            趋势
          </Text>
        </Flex>
      }
      w={['96vw', '96vw']}
      maxW={'1200px'}
      size={'lg'}
    >
      <ModalBody px={[3, 6]} pt={4} pb={2}>
        <Flex alignItems={'center'} justifyContent={'space-between'} flexWrap={'wrap'} gap={2}>
          <LightRowTabs<RangeDays>
            size={isPc ? 'md' : 'sm'}
            list={[
              { label: <Box>近7天</Box>, value: 7 },
              { label: <Box>近30天</Box>, value: 30 },
              { label: <Box>近90天</Box>, value: 90 },
              { label: <Box>近一年</Box>, value: 365 }
            ]}
            value={days}
            onChange={setDays}
          />

          <Button
            variant={'outline'}
            border={theme.borders.base}
            size={isPc ? 'md' : 'sm'}
            onClick={() => {
              router.push(`/app/detail/${app.appId}`);
              onClose();
            }}
          >
            进入应用
          </Button>
        </Flex>

        <Box mt={3} position={'relative'}>
          <EChartsPanel option={trendOption} height={isPc ? 360 : 280} />
          {(isFetching || isLoading) && (
            <Flex
              position={'absolute'}
              top={0}
              left={0}
              right={0}
              bottom={0}
              alignItems={'center'}
              justifyContent={'center'}
              flexDirection={'column'}
              gap={2}
              bg={'whiteAlpha.700'}
              borderRadius={'md'}
            >
              <Spinner thickness="3px" speed="0.8s" color="primary.600" />
              <Text fontSize={'sm'} color={'myGray.600'}>
                加载中
              </Text>
            </Flex>
          )}
        </Box>
      </ModalBody>

      <ModalFooter px={[3, 6]} pt={2} pb={4}>
        <Button variant={'outline'} onClick={onClose}>
          关闭
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default AppTrendModal;
