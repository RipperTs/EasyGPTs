import React, { useMemo, useState } from 'react';
import { Box, Flex, SimpleGrid, Text, useTheme } from '@chakra-ui/react';
import dynamic from 'next/dynamic';
import type { GetServerSideProps } from 'next';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';

import PageContainer from '@/components/PageContainer';
import MyBox from '@fastgpt/web/components/common/MyBox';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { IconNameType } from '@fastgpt/web/components/common/Icon/type.d';
import Avatar from '@fastgpt/web/components/common/Avatar';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { getTeamDashboardStats } from '@/web/core/statistics/api';

import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import type { EChartsOption } from 'echarts';

const EChartsPanel = dynamic(() => import('./components/EChartsPanel'), { ssr: false });

type RangeDays = 7 | 30 | 90;

const formatNum = (num: number) => new Intl.NumberFormat('zh-CN').format(num);

const AppTypeLabel: Record<string, string> = {
  [AppTypeEnum.workflow]: '工作流应用',
  [AppTypeEnum.simple]: '简易应用',
  [AppTypeEnum.plugin]: '插件',
  [AppTypeEnum.httpPlugin]: 'HTTP 插件',
  [AppTypeEnum.toolSet]: '工具集',
  [AppTypeEnum.folder]: '文件夹',
  mcpTool: 'MCP 工具'
};

const SourceLabel: Record<string, string> = {
  online: '在线',
  api: 'API',
  share: '分享',
  team: '团队',
  test: '调试',
  feishu: '飞书',
  official_account: '公众号',
  wecom: '企微',
  mcp: 'MCP'
};

const StatisticsPage = () => {
  const theme = useTheme();
  const router = useRouter();
  const { isPc } = useSystem();

  const [days, setDays] = useState<RangeDays>(30);

  const { data, isFetching, refetch } = useQuery(
    ['teamDashboardStats', days],
    () => getTeamDashboardStats({ days }),
    {
      staleTime: 10_000
    }
  );

  const dateList = data?.trend?.map((i) => i.date) ?? [];
  const questionsList = data?.trend?.map((i) => i.questions) ?? [];
  const chatsList = data?.trend?.map((i) => i.chats) ?? [];
  const activeLoginUsersList = data?.trend?.map((i) => i.activeLoginUsers) ?? [];
  const activeAnonymousUsersList = data?.trend?.map((i) => i.activeAnonymousUsers) ?? [];

  const trendOption: EChartsOption = useMemo(
    () => ({
      tooltip: { trigger: 'axis' },
      legend: { top: 0, data: ['提问', '会话', '登录用户', '匿名用户'] },
      grid: { left: 40, right: 18, top: 40, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dateList,
        axisLabel: { formatter: (v: string) => v.slice(5) }
      },
      yAxis: [{ type: 'value' }, { type: 'value' }],
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
        },
        {
          name: '登录用户',
          type: 'bar',
          yAxisIndex: 1,
          barWidth: 10,
          itemStyle: { opacity: 0.75 },
          stack: 'activeUsers',
          data: activeLoginUsersList
        },
        {
          name: '匿名用户',
          type: 'bar',
          yAxisIndex: 1,
          barWidth: 10,
          itemStyle: { opacity: 0.75 },
          stack: 'activeUsers',
          data: activeAnonymousUsersList
        }
      ]
    }),
    [activeAnonymousUsersList, activeLoginUsersList, chatsList, dateList, questionsList]
  );

  const sourceOption: EChartsOption = useMemo(() => {
    const source = (data?.source ?? []).map((item) => ({
      name: SourceLabel[item.source] ?? item.source,
      value: item.count
    }));
    return {
      tooltip: { trigger: 'item' },
      legend: { type: 'scroll', orient: 'horizontal', top: 0 },
      series: [
        {
          type: 'pie',
          radius: ['35%', '70%'],
          center: ['50%', '60%'],
          avoidLabelOverlap: true,
          label: { formatter: '{b}: {d}%' },
          data: source
        }
      ]
    };
  }, [data?.source]);

  const appTypeOption: EChartsOption = useMemo(() => {
    const list = (data?.appType ?? []).map((i) => ({
      name: AppTypeLabel[i.type] ?? i.type,
      value: i.count
    }));
    return {
      tooltip: { trigger: 'axis' },
      grid: { left: 40, right: 18, top: 20, bottom: 30 },
      xAxis: {
        type: 'category',
        data: list.map((i) => i.name),
        axisLabel: { interval: 0, rotate: isPc ? 0 : 20 }
      },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', barWidth: 18, data: list.map((i) => i.value) }]
    };
  }, [data?.appType, isPc]);

  const metricList = useMemo(() => {
    const overview = data?.overview;
    const rangeStats = data?.rangeStats;
    if (!overview || !rangeStats) return [];

    return [
      {
        icon: 'core/app/aiFill' as IconNameType,
        label: '应用总数',
        value: overview.appTotal,
        desc: `工作流 ${overview.appWorkflow} · 简易 ${overview.appSimple}`
      },
      {
        icon: 'common/navbar/pluginFill' as IconNameType,
        label: '插件总数',
        value: overview.pluginTotal,
        desc: `插件 ${overview.pluginApp} · HTTP ${overview.pluginHttp} · 工具集 ${overview.toolSet}`
      },
      {
        icon: 'core/app/type/mcpFill' as IconNameType,
        label: 'MCP 工具',
        value: overview.mcpToolTotal,
        desc: '工具集中配置的 MCP 工具数量'
      },
      {
        icon: 'core/dataset/datasetFill' as IconNameType,
        label: '知识库',
        value: overview.datasetTotal,
        desc: '团队知识库数量'
      },
      {
        icon: 'support/team/memberLight' as IconNameType,
        label: '团队成员',
        value: overview.memberTotal,
        desc: `活跃成员 ${overview.memberActive}`
      },
      {
        icon: 'core/chat/chatFill' as IconNameType,
        label: `近${days}天会话`,
        value: rangeStats.chatCount,
        desc: `累计 ${overview.chatTotal}`
      },
      {
        icon: 'common/resultLight' as IconNameType,
        label: `近${days}天问答`,
        value: rangeStats.questionCount + rangeStats.answerCount,
        desc: `提问 ${formatNum(rangeStats.questionCount)} · 回答 ${formatNum(
          rangeStats.answerCount
        )}`
      },
      {
        icon: 'support/user/userFill' as IconNameType,
        label: `近${days}天活跃用户`,
        value: rangeStats.activeMemberCount,
        desc: `登录用户 ${formatNum(rangeStats.activeLoginUserCount)} · 匿名用户 ${formatNum(
          rangeStats.activeAnonymousUserCount
        )}`
      }
    ];
  }, [data?.overview, data?.rangeStats, days]);

  return (
    <PageContainer isLoading={isFetching}>
      <Box px={[3, 6]} pt={[4, 6]} pb={[6, 8]} h={'100%'}>
        <Flex
          alignItems={['flex-start', 'center']}
          justifyContent={'space-between'}
          flexDirection={['column', 'row']}
          gap={3}
          mb={4}
        >
          <Box>
            <Text fontSize={['lg', 'xl']} fontWeight={'bold'} color={'myGray.900'}>
              团队概览
            </Text>
            <Text fontSize={'sm'} color={'myGray.500'}>
              一页了解当前账号所在团队的规模、活跃度与结构分布
            </Text>
          </Box>

          <Flex alignItems={'center'} gap={3} flexWrap={'wrap'}>
            <LightRowTabs<RangeDays>
              size={isPc ? 'md' : 'sm'}
              list={[
                { label: <Box>近7天</Box>, value: 7 },
                { label: <Box>近30天</Box>, value: 30 },
                { label: <Box>近90天</Box>, value: 90 }
              ]}
              value={days}
              onChange={setDays}
            />
            <Flex
              alignItems={'center'}
              gap={1}
              px={3}
              py={2}
              borderRadius={'md'}
              bg={'white'}
              border={theme.borders.base}
              cursor={'pointer'}
              _hover={{ bg: 'myGray.05' }}
              onClick={() => refetch()}
            >
              <MyIcon name={'common/refreshLight'} w={'16px'} color={'myGray.700'} />
              <Text fontSize={'sm'} color={'myGray.700'}>
                刷新
              </Text>
            </Flex>
          </Flex>
        </Flex>

        <SimpleGrid columns={[2, 4]} spacing={3} mb={4}>
          {metricList.map((item) => (
            <MyBox
              key={item.label}
              bg={'white'}
              borderRadius={'12px'}
              border={theme.borders.base}
              p={4}
            >
              <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
                <Flex
                  alignItems={'center'}
                  justifyContent={'center'}
                  w={'34px'}
                  h={'34px'}
                  borderRadius={'10px'}
                  bg={'myGray.05'}
                >
                  <MyIcon name={item.icon} w={'18px'} color={'primary.600'} />
                </Flex>
              </Flex>
              <Text fontSize={'sm'} color={'myGray.600'} mb={1}>
                {item.label}
              </Text>
              <Text fontSize={['xl', '2xl']} fontWeight={'bold'} color={'myGray.900'} mb={1}>
                {formatNum(item.value)}
              </Text>
              <Text fontSize={'xs'} color={'myGray.500'} noOfLines={1}>
                {item.desc}
              </Text>
            </MyBox>
          ))}
        </SimpleGrid>

        <SimpleGrid columns={[1, 2]} spacing={3} mb={4}>
          <MyBox bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={4}>
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
              <Text fontWeight={'bold'} color={'myGray.900'}>
                趋势（近{days}天）
              </Text>
            </Flex>
            <EChartsPanel option={trendOption} height={isPc ? 320 : 280} />
          </MyBox>

          <MyBox bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={4}>
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
              <Text fontWeight={'bold'} color={'myGray.900'}>
                会话来源分布（近{days}天）
              </Text>
            </Flex>
            <EChartsPanel option={sourceOption} height={isPc ? 320 : 280} />
          </MyBox>
        </SimpleGrid>

        <SimpleGrid columns={[1, 3]} spacing={3} mb={4}>
          <MyBox bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={4}>
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
              <Text fontWeight={'bold'} color={'myGray.900'}>
                应用/插件结构
              </Text>
            </Flex>
            <EChartsPanel option={appTypeOption} height={isPc ? 320 : 280} />
          </MyBox>

          <MyBox bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={4}>
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
              <Text fontWeight={'bold'} color={'myGray.900'}>
                应用排行（按提问数，近{days}天）
              </Text>
              <Text
                fontSize={'sm'}
                color={'primary.600'}
                cursor={'pointer'}
                onClick={() => router.push('/app/list')}
              >
                进入工作台
              </Text>
            </Flex>

            <Box>
              {(data?.topApps ?? []).length === 0 ? (
                <Text fontSize={'sm'} color={'myGray.500'} py={6} textAlign={'center'}>
                  暂无数据
                </Text>
              ) : (
                (data?.topApps ?? []).map((item, idx) => (
                  <Flex
                    key={item.appId}
                    alignItems={'center'}
                    py={2}
                    px={2}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    _hover={{ bg: 'myGray.05' }}
                    onClick={() => router.push(`/app/detail/${item.appId}`)}
                  >
                    <Text w={'22px'} fontSize={'sm'} color={'myGray.500'}>
                      {idx + 1}
                    </Text>
                    <Avatar src={item.avatar} alt={item.name} w={'28px'} h={'28px'} mr={2} />
                    <Box flex={'1 0 0'} minW={0}>
                      <Text fontSize={'sm'} color={'myGray.900'} noOfLines={1}>
                        {item.name}
                      </Text>
                      <Text fontSize={'xs'} color={'myGray.500'}>
                        {AppTypeLabel[item.type] ?? item.type}
                      </Text>
                    </Box>
                    <Box textAlign={'right'} minW={'110px'}>
                      <Text fontSize={'sm'} color={'myGray.900'} fontWeight={'bold'}>
                        {formatNum(item.questions)} 提问
                      </Text>
                      <Text fontSize={'xs'} color={'myGray.500'}>
                        {formatNum(item.chats)} 会话
                      </Text>
                    </Box>
                  </Flex>
                ))
              )}
            </Box>
          </MyBox>
          <MyBox bg={'white'} borderRadius={'12px'} border={theme.borders.base} p={4}>
            <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
              <Text fontWeight={'bold'} color={'myGray.900'}>
                用户排行（已登录，按提问数，近{days}天）
              </Text>
            </Flex>

            <Box>
              {(data?.topMembers ?? []).length === 0 ? (
                <Text fontSize={'sm'} color={'myGray.500'} py={6} textAlign={'center'}>
                  暂无数据
                </Text>
              ) : (
                (data?.topMembers ?? []).map((item, idx) => (
                  <Flex
                    key={item.uid}
                    alignItems={'center'}
                    py={2}
                    px={2}
                    borderRadius={'md'}
                    _hover={{ bg: 'myGray.05' }}
                  >
                    <Text w={'22px'} fontSize={'sm'} color={'myGray.500'}>
                      {idx + 1}
                    </Text>
                    <Box flex={'1 0 0'} minW={0}>
                      <Text fontSize={'sm'} color={'myGray.900'} noOfLines={1}>
                        用户:{item.name}
                      </Text>
                      <Text fontSize={'xs'} color={'myGray.500'}>
                        {formatNum(item.chats)} 会话
                      </Text>
                    </Box>
                    <Box textAlign={'right'} minW={'110px'}>
                      <Text fontSize={'sm'} color={'myGray.900'} fontWeight={'bold'}>
                        {formatNum(item.questions)} 提问
                      </Text>
                    </Box>
                  </Flex>
                ))
              )}
            </Box>
          </MyBox>
        </SimpleGrid>
      </Box>
    </PageContainer>
  );
};

export const getServerSideProps: GetServerSideProps = async (context) => {
  return {
    props: {
      ...(await serviceSideProps(context))
    }
  };
};

export default StatisticsPage;
