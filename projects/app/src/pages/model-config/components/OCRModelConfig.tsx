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
import OCRModelModal from './OCRModelModal';
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { clientInitData } from '@/web/common/system/staticData';

interface OCRModelWithId extends OCRModelSchema {
  _id: string;
}

// API: 获取OCR模型列表
const getOCRModelList = async ({
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
  if (search) params.append('search', search);

  const response = await fetch(`/api/model-config/ocr/list?${params}`);
  if (!response.ok) throw new Error('获取模型列表失败');
  const result = await response.json();
  return { data: result.list, total: result.total, pageNum, pageSize };
};

const OCRModelConfig: React.FC = () => {
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editModel, setEditModel] = useState<OCRModelWithId | undefined>();
  const [search, setSearch] = useState('');

  const {
    data: models = [],
    isLoading,
    total,
    pageNum,
    pageSize,
    Pagination,
    getData
  } = usePagination<OCRModelWithId>({
    api: getOCRModelList,
    pageSize: 20,
    params: { search }
  });

  const { openConfirm, ConfirmModal } = useConfirm({ content: '确认删除该模型配置？' });

  const { runAsync: deleteModel } = useRequest2(
    (id: string) => fetch(`/api/model-config/ocr/${id}`, { method: 'DELETE' }),
    {
      async onSuccess() {
        toast({ title: '删除成功', status: 'success' });
        getData(pageNum);
        await clientInitData();
      },
      errorToast: '删除失败'
    }
  );

  const { runAsync: updateStatus } = useRequest2(
    ({ id, isActive }: { id: string; isActive: boolean }) =>
      fetch(`/api/model-config/ocr/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive })
      }),
    {
      async onSuccess() {
        getData(pageNum);
        await clientInitData();
      },
      errorToast: '状态更新失败'
    }
  );

  const handleEdit = useCallback(
    (model: OCRModelWithId) => {
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
    await clientInitData();
  }, [getData, onClose, pageNum]);

  const handleToggleStatus = useCallback(
    (model: OCRModelWithId) => {
      updateStatus({ id: model._id, isActive: !model.isActive });
    },
    [updateStatus]
  );

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          OCR 模型配置
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
              if (e.key === 'Enter') getData(1);
            }}
          />
        </InputGroup>
      </Box>

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>模型信息</Th>
            <Th>价格</Th>
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
                  {(model.charsPointsPrice || 0).toLocaleString()} 积分/千字符
                </Box>
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
                        const doDelete = () => deleteModel(model._id);
                        openConfirm(doDelete)();
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

      {isOpen && <OCRModelModal model={editModel} onClose={onClose} onSuccess={handleSuccess} />}

      <ConfirmModal />
    </Box>
  );
};

export default OCRModelConfig;
