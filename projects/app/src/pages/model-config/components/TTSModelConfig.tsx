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
  Avatar,
  Text,
  Tooltip,
  Tag
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import TTSModelModal from './TTSModelModal';
import type { TTSModelSchema } from '@fastgpt/global/core/model/type.d';

// 列表返回的数据包含 _id，扩展类型以满足使用场景
interface TTSModelWithId extends TTSModelSchema {
  _id: string;
}

// API 函数
const getTTSModelList = async ({
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

  const response = await fetch(`/api/model-config/tts/list?${params}`);
  if (!response.ok) {
    throw new Error('获取模型列表失败');
  }

  return response.json();
};

const TTSModelConfig = () => {
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editModel, setEditModel] = useState<TTSModelWithId | undefined>();
  const [search, setSearch] = useState('');

  const {
    data: models = [],
    isLoading,
    total,
    pageNum,
    pageSize,
    Pagination,
    getData
  } = usePagination<TTSModelWithId>({
    api: getTTSModelList,
    pageSize: 20,
    params: {
      search
    }
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认删除该模型配置？'
  });

  const { runAsync: deleteModel } = useRequest2(
    (id: string) => fetch(`/api/model-config/tts/${id}`, { method: 'DELETE' }),
    {
      onSuccess() {
        toast({
          title: '删除成功',
          status: 'success'
        });
        getData(pageNum);
      },
      errorToast: '删除失败'
    }
  );

  const { runAsync: updateStatus } = useRequest2(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/model-config/tts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      }),
    {
      onSuccess() {
        getData(pageNum);
      },
      errorToast: '状态更新失败'
    }
  );

  const handleEdit = useCallback(
    (model: TTSModelWithId) => {
      setEditModel(model);
      onOpen();
    },
    [onOpen]
  );

  const handleCreate = useCallback(() => {
    setEditModel(undefined);
    onOpen();
  }, [onOpen]);

  const handleSuccess = useCallback(() => {
    onClose();
    getData(pageNum);
  }, [onClose, getData, pageNum]);

  const handleToggleStatus = useCallback(
    (model: TTSModelWithId) => {
      updateStatus({ id: model._id, isActive: !model.isActive });
    },
    [updateStatus]
  );

  return (
    <Box p={6}>
      {/* 头部操作区 */}
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          TTS模型配置
        </Text>
        <Button
          leftIcon={<MyIcon name="common/addLight" w="14px" />}
          onClick={handleCreate}
          colorScheme="blue"
        >
          添加模型
        </Button>
      </Flex>

      {/* 搜索框 */}
      <Box mb={4}>
        <InputGroup maxW="300px">
          <InputLeftElement>
            <MyIcon name="common/searchLight" w="14px" color="myGray.500" />
          </InputLeftElement>
          <Input
            placeholder="搜索模型名称..."
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

      {/* 模型列表表格 */}
      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>模型信息</Th>
            <Th>语音配置</Th>
            <Th>定价</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </Tr>
        </Thead>
        <Tbody>
          {models.map((model) => (
            <Tr key={model._id}>
              <Td>
                <Flex align="center">
                  <Avatar src={model.avatar || '/imgs/model/tts.svg'} size="sm" mr={3} />
                  <Box>
                    <Text fontWeight="semibold">{model.name}</Text>
                    <Text fontSize="sm" color="gray.500">
                      {model.model}
                    </Text>
                  </Box>
                </Flex>
              </Td>
              <Td>
                <Box fontSize="sm">
                  <Text>语音数: {model.voices?.length || 0}</Text>
                  {model.voices?.slice(0, 3).map((voice, index) => (
                    <Tag key={index} size="sm" mr={1} mt={1}>
                      {voice.label}
                    </Tag>
                  ))}
                  {(model.voices?.length || 0) > 3 && (
                    <Tag size="sm" mt={1}>
                      +{(model.voices?.length || 0) - 3}
                    </Tag>
                  )}
                </Box>
              </Td>
              <Td>
                <Text fontSize="sm">{model.charsPointsPrice} 点/千字符</Text>
              </Td>
              <Td>
                <Switch
                  isChecked={model.isActive}
                  onChange={() => handleToggleStatus(model)}
                  colorScheme="blue"
                />
              </Td>
              <Td>
                <HStack spacing={2}>
                  <Tooltip label="编辑">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(model)}>
                      <MyIcon name="edit" w="14px" />
                    </Button>
                  </Tooltip>
                  <Tooltip label="删除">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => openConfirm(() => deleteModel(model._id))()}
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

      {/* 模型配置弹窗 */}
      {isOpen && <TTSModelModal model={editModel} onClose={onClose} onSuccess={handleSuccess} />}

      <ConfirmModal />
    </Box>
  );
};

export default TTSModelConfig;
