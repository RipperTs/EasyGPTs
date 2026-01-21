import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import DateRangePicker, {
  type DateRangeType
} from '@fastgpt/web/components/common/DateRangePicker';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { getMyApps } from '@/web/core/app/api';
import { getChatLogs } from '@/web/support/chatLog/api';
import type { ChatLogListItem } from '@/pages/api/support/chatLog/list';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { addDays } from 'date-fns';
import { SearchIcon } from '@chakra-ui/icons';
import { useRouter } from 'next/router';
import Tag from '@fastgpt/web/components/common/Tag';

const ChatLogTable = () => {
  const router = useRouter();
  const { Loading } = useLoading();

  const [dateRange, setDateRange] = useState<DateRangeType>({
    from: addDays(new Date(), -7),
    to: new Date()
  });
  const [appId, setAppId] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');

  const { data: apps = [] } = useQuery(['getMyAppsForChatLog'], () => getMyApps({}));

  const appSelectList = useMemo(
    () => [
      { label: '全部应用', value: '' },
      ...apps.map((app) => ({
        label: app.name || '-',
        value: String(app._id)
      }))
    ],
    [apps]
  );

  const {
    data: logs,
    isLoading,
    Pagination,
    getData
  } = usePagination<ChatLogListItem>({
    api: getChatLogs,
    pageSize: 30,
    params: {
      dateStart: dateRange.from || new Date(),
      dateEnd: addDays(dateRange.to || new Date(), 1),
      appId: appId || undefined,
      keyword: keyword || undefined
    },
    defaultRequest: false
  });

  useEffect(() => {
    getData(1);
  }, [appId, keyword]);

  const onSearch = () => {
    setKeyword(keywordInput.trim());
  };

  const onJump = (targetAppId: string) => {
    router.push({
      pathname: '/app/detail',
      query: { appId: targetAppId, currentTab: 'logs' }
    });
  };

  const getSourceLabel = (source?: string) => {
    if (!source) return '-';
    const fallbackMap: Record<string, string> = {
      online: '在线',
      api: 'API',
      share: '分享',
      team: '团队',
      feishu: '飞书',
      wecom: '企微',
      official_account: '公众号',
      test: '测试',
      mcp: 'MCP'
    };
    return fallbackMap[source] || source;
  };

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} position={'relative'}>
      <Flex
        flexDir={['column', 'row']}
        gap={2}
        w={'100%'}
        px={[3, 8]}
        alignItems={['flex-end', 'center']}
      >
        <Box flex={'1'} />
        <Flex alignItems={'center'} gap={3} flexWrap={'wrap'} justifyContent={'flex-end'}>
          <MySelect
            size={'sm'}
            minW={'160px'}
            list={appSelectList}
            value={appId}
            onchange={setAppId}
          />

          <InputGroup size={'sm'} w={['100%', '260px']}>
            <Input
              placeholder="关键字：应用/会话ID/账号/内容"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearch();
              }}
            />
            <InputRightElement>
              <IconButton
                aria-label="search"
                size="xs"
                variant="ghost"
                icon={<SearchIcon />}
                onClick={onSearch}
              />
            </InputRightElement>
          </InputGroup>
        </Flex>
      </Flex>

      <TableContainer
        mt={2}
        px={[3, 8]}
        position={'relative'}
        flex={'1 0 0'}
        h={0}
        overflowY={'auto'}
      >
        <Table>
          <Thead>
            <Tr>
              <Th>来源 / 时间</Th>
              <Th>应用</Th>
              <Th>会话标题</Th>
              <Th>模型</Th>
              <Th>账号</Th>
              <Th>最近问题</Th>
              <Th isNumeric>消息数</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {logs.map((item) => (
              <Tr key={item.id} _hover={{ bg: 'myWhite.600' }}>
                <Td>
                  <Tag colorSchema="adora" type="borderFill">
                    {getSourceLabel(item.source)}
                  </Tag>
                  <Box color={'myGray.500'}>{dayjs(item.time).format('YYYY/MM/DD HH:mm:ss')}</Box>
                </Td>
                <Td>
                  {item.appName ? (
                    <Tag colorSchema="blue" type="borderFill">
                      {item.appName}
                    </Tag>
                  ) : (
                    '-'
                  )}
                </Td>
                <Td title={item.title || ''} maxW={['160px', '260px']} className="textEllipsis">
                  {item.title || '-'}
                </Td>
                <Td>
                  {item.models?.length ? (
                    <Flex gap={1} flexWrap="wrap">
                      {item.models.map((model) => (
                        <Tag key={model} colorSchema="gray" type="borderFill">
                          {model}
                        </Tag>
                      ))}
                    </Flex>
                  ) : (
                    '-'
                  )}
                </Td>
                <Td>
                  {item.source === 'api' || item.source === 'share'
                    ? item.outLinkUid || '-'
                    : `${item.memberName}${item.username && item.username !== '-' ? `（${item.username}）` : ''}`}
                </Td>
                <Td title={item.lastText || ''} maxW={['200px', '420px']} className="textEllipsis">
                  {item.lastText || '-'}
                </Td>
                <Td isNumeric>{item.messageCount || 0}</Td>
                <Td>
                  <Button size={'sm'} variant={'whitePrimary'} onClick={() => onJump(item.appId)}>
                    去应用日志
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        {!isLoading && logs.length === 0 && <EmptyTip text={'暂无对话日志'} />}
      </TableContainer>

      <Loading loading={isLoading} fixed={false} />

      <Flex px={[3, 8]} pt={3} justifyContent={'flex-end'} gap={3} flexWrap={'wrap'}>
        <DateRangePicker
          defaultDate={dateRange}
          position="top"
          onChange={setDateRange}
          onSuccess={() => getData(1)}
        />
        <Pagination />
      </Flex>
    </Flex>
  );
};

export default React.memo(ChatLogTable);
