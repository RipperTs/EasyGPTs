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
  Tooltip
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import EmbeddingModelModal from './EmbeddingModelModal';
import type { EmbeddingModelSchema } from '@fastgpt/global/core/model/type.d';
import { clientInitData } from '@/web/common/system/staticData';

interface EmbeddingModelWithId extends EmbeddingModelSchema {
  _id: string;
}

const getEmbeddingModelList = async ({
  pageNum,
  pageSize,
  search
}: {
  pageNum: number;
  pageSize: number;
  search?: string;
}): Promise<any> => {
  const params = new URLSearchParams({
    current: pageNum.toString(),
    pageSize: pageSize.toString()
  });

  if (search) {
    params.append('search', search);
  }

  const response = await fetch(`/api/model-config/embedding/list?${params}`);
  if (!response.ok) {
    throw new Error('获取模型列表失败');
  }

  const result = await response.json();

  return {
    data: result.list,
    total: result.total,
    pageNum,
    pageSize
  };
};

const EmbeddingModelConfig: React.FC = () => {
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editModel, setEditModel] = useState<EmbeddingModelWithId | undefined>();
  const [search, setSearch] = useState('');

  const {
    data: models = [],
    isLoading,
    total,
    pageNum,
    pageSize,
    Pagination,
    getData
  } = usePagination<EmbeddingModelWithId>({
    api: getEmbeddingModelList,
    pageSize: 20,
    params: {
      search
    }
  });

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认删除该模型配置？'
  });

  const { runAsync: deleteModel } = useRequest2(
    (id: string) => fetch(`/api/model-config/embedding/${id}`, { method: 'DELETE' }),
    {
      async onSuccess() {
        toast({
          title: '删除成功',
          status: 'success'
        });
        getData(pageNum);
        // 刷新全局模型配置
        await clientInitData();
      },
      errorToast: '删除失败'
    }
  );

  const { runAsync: updateStatus } = useRequest2(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/model-config/embedding/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      }),
    {
      async onSuccess() {
        getData(pageNum);
        // 刷新全局模型配置
        await clientInitData();
      },
      errorToast: '状态更新失败'
    }
  );

  const handleEdit = useCallback(
    (model: EmbeddingModelWithId) => {
      setEditModel(model);
      onOpen();
    },
    [onOpen]
  );

  const handleCreate = useCallback(() => {
    setEditModel(undefined);
    onOpen();
  }, [onOpen]);

  const handleSuccess = useCallback(async () => {
    onClose();
    getData(pageNum);
    // 刷新全局模型配置
    await clientInitData();
  }, [onClose, getData, pageNum]);

  const handleToggleStatus = useCallback(
    (model: EmbeddingModelWithId) => {
      updateStatus({ id: model._id, isActive: !model.isActive });
    },
    [updateStatus]
  );

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          嵌入模型配置
        </Text>
        <Button
          leftIcon={<MyIcon name="common/addLight" w="14px" />}
          onClick={handleCreate}
          colorScheme="blue"
        >
          添加模型
        </Button>
      </Flex>

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

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>模型信息</Th>
            <Th>Token信息</Th>
            <Th>权重</Th>
            <Th>排序</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </Tr>
        </Thead>
        <Tbody>
          {models.map((model) => (
            <Tr key={model._id}>
              <Td>
                <Flex align="center">
                  <Avatar src={model.avatar} size="sm" mr={3} />
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
                  <Text>默认Token: {model.defaultToken.toLocaleString()}</Text>
                  <Text>最大Token: {model.maxToken.toLocaleString()}</Text>
                </Box>
              </Td>
              <Td>
                <Text fontSize="sm" fontWeight="semibold">
                  {model.weight}
                </Text>
              </Td>
              <Td>
                <Text fontSize="sm" fontWeight="semibold">
                  {model.sort}
                </Text>
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
                      onClick={() => {
                        const deleteAction = () => deleteModel(model._id);
                        openConfirm(deleteAction)();
                      }}
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

      <Box mt={4}>
        <Pagination />
      </Box>

      {isOpen && (
        <EmbeddingModelModal model={editModel} onClose={onClose} onSuccess={handleSuccess} />
      )}

      <ConfirmModal />
    </Box>
  );
};

export default EmbeddingModelConfig;
