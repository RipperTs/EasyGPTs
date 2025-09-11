import React, { useState, useCallback } from 'react';
import {
  Box,
  Button,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Switch,
  useDisclosure,
  Flex,
  Input,
  InputGroup,
  InputLeftElement,
  HStack,
  Text,
  Tooltip,
  Code,
  Badge
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import type { SystemConfigSchema } from '@fastgpt/global/core/model/type.d';

// API 函数
const getSystemConfigList = async ({
  pageNum,
  pageSize,
  search
}: {
  pageNum: number;
  pageSize: number;
  search?: string;
}) => {
  const params = new URLSearchParams({
    page: pageNum.toString(),
    pageSize: pageSize.toString()
  });

  if (search) {
    params.append('search', search);
  }

  const response = await fetch(`/api/model-config/system/list?${params}`);
  if (!response.ok) {
    throw new Error('获取配置列表失败');
  }

  return response.json();
};

const SystemConfig = () => {
  const { toast } = useToast();
  const [search, setSearch] = useState('');

  const {
    data: configs = [],
    loading,
    total,
    pageNum,
    current,
    pageSize,
    Pagination,
    getData
  } = usePagination<SystemConfigSchema>({
    api: getSystemConfigList,
    pageSize: 20,
    params: {
      search
    }
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认删除该配置？'
  });

  const { runAsync: deleteConfig } = useRequest2(
    (id: string) => fetch(`/api/model-config/system/${id}`, { method: 'DELETE' }),
    {
      onSuccess() {
        toast({
          title: '删除成功',
          status: 'success'
        });
        getData(current);
      },
      errorToast: '删除失败'
    }
  );

  const { runAsync: updateStatus } = useRequest2(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/model-config/system/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      }),
    {
      onSuccess() {
        getData(current);
      },
      errorToast: '状态更新失败'
    }
  );

  const handleToggleStatus = useCallback(
    (config: SystemConfigSchema) => {
      updateStatus({ id: config._id, isActive: !config.isActive });
    },
    [updateStatus]
  );

  const getConfigTypeColor = (key: string) => {
    if (key.includes('feConfigs')) return 'blue';
    if (key.includes('systemEnv')) return 'green';
    if (key.includes('vectorModels')) return 'purple';
    return 'gray';
  };

  return (
    <Box p={6}>
      {/* 头部操作区 */}
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          系统配置管理
        </Text>
        <Text fontSize="sm" color="gray.500">
          管理feConfigs、systemEnv、vectorModels等系统配置
        </Text>
      </Flex>

      {/* 搜索框 */}
      <Box mb={4}>
        <InputGroup maxW="300px">
          <InputLeftElement>
            <MyIcon name="common/search" w="14px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder="搜索配置键名..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                getData(1);
              }
            }}
          />
        </InputGroup>
      </Box>

      {/* 配置列表表格 */}
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>配置键名</Th>
            <Th>配置类型</Th>
            <Th>配置值</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </Tr>
        </Thead>
        <Tbody>
          {configs.map((config) => (
            <Tr key={config._id}>
              <Td>
                <Code fontSize="sm" p={2} borderRadius="md">
                  {config.configKey}
                </Code>
              </Td>
              <Td>
                <Badge colorScheme={getConfigTypeColor(config.configKey)} variant="subtle">
                  {config.configKey.includes('feConfigs')
                    ? '前端配置'
                    : config.configKey.includes('systemEnv')
                      ? '系统环境'
                      : config.configKey.includes('vectorModels')
                        ? '向量模型'
                        : '其他配置'}
                </Badge>
              </Td>
              <Td>
                <Box fontSize="sm" maxW="300px" overflow="hidden">
                  <Text isTruncated>
                    {typeof config.configValue === 'object'
                      ? JSON.stringify(config.configValue).substring(0, 100) +
                        (JSON.stringify(config.configValue).length > 100 ? '...' : '')
                      : String(config.configValue)}
                  </Text>
                </Box>
              </Td>
              <Td>
                <Switch
                  isChecked={config.isActive}
                  onChange={() => handleToggleStatus(config)}
                  colorScheme="blue"
                />
              </Td>
              <Td>
                <HStack spacing={2}>
                  <Tooltip label="删除">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => openConfirm(() => deleteConfig(config._id))()}
                    >
                      <MyIcon name="common/trash" w="14px" />
                    </Button>
                  </Tooltip>
                </HStack>
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>

      {/* 分页 */}
      <Box mt={4}>
        <Pagination />
      </Box>

      <ConfirmModal />
    </Box>
  );
};

export default SystemConfig;
