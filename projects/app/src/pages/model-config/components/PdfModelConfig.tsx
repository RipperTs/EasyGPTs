import React, { useCallback, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Switch,
  Table,
  Tag,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import PdfModelModal from './PdfModelModal';
import { clientInitData } from '@/web/common/system/staticData';
import { PdfParserType } from '@fastgpt/service/common/pdf/types';

type PdfModelType = {
  _id: string;
  model: string;
  name: string;
  avatar?: string;
  charsPointsPrice?: number;
  type: PdfParserType;
  requestUrl?: string;
  apiKey?: string;
  defaultConfig?: Record<string, any>;
  isActive: boolean;
};

const getPdfModelList = async ({
  pageNum,
  pageSize,
  search
}: {
  pageNum: number;
  pageSize: number;
  search?: string;
}) => {
  const params = new URLSearchParams({
    page: String(pageNum),
    pageSize: String(pageSize)
  });
  if (search) params.append('search', search);
  const res = await fetch(`/api/model-config/pdf/list?${params}`);
  if (!res.ok) throw new Error('获取模型列表失败');
  const json = await res.json();
  return { data: json.list || [], total: json.total || 0, pageNum, pageSize };
};

const PdfModelConfig = () => {
  const { toast } = useToast();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [editModel, setEditModel] = useState<PdfModelType | undefined>();
  const [search, setSearch] = useState('');

  const {
    data: models = [],
    pageNum,
    Pagination,
    getData
  } = usePagination<PdfModelType>({
    api: getPdfModelList,
    pageSize: 20,
    params: { search }
  });

  const { openConfirm, ConfirmModal } = useConfirm({ content: '确认删除该模型配置？' });

  const { runAsync: deleteModel } = useRequest2(
    (id: string) => fetch(`/api/model-config/pdf/${id}`, { method: 'DELETE' }),
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
      fetch(`/api/model-config/pdf/${id}`, {
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
    (m: PdfModelType) => {
      setEditModel(m);
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

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          PDF解析模型配置
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
            onKeyDown={(e) => e.key === 'Enter' && getData(1)}
          />
        </InputGroup>
      </Box>

      <Table variant="simple">
        <Thead>
          <Tr>
            <Th>模型信息</Th>
            <Th>类型</Th>
            <Th>请求地址</Th>
            <Th>状态</Th>
            <Th>操作</Th>
          </Tr>
        </Thead>
        <Tbody>
          {models.map((m) => (
            <Tr key={m._id}>
              <Td>
                <Flex align="center">
                  <Avatar src={m.avatar || '/imgs/model/llm.svg'} size="sm" mr={3} />
                  <Box>
                    <Text fontWeight="semibold">{m.name}</Text>
                    <Text fontSize="sm" color="gray.500">
                      {m.model}
                    </Text>
                  </Box>
                </Flex>
              </Td>
              <Td>
                <Tag size="sm">{m.type}</Tag>
              </Td>
              <Td maxW="380px">
                <Text fontSize="sm" noOfLines={1} title={m.requestUrl}>
                  {m.requestUrl || '-'}
                </Text>
              </Td>
              <Td>
                <Switch
                  isChecked={m.isActive}
                  onChange={() => updateStatus({ id: m._id, isActive: !m.isActive })}
                  colorScheme="blue"
                />
              </Td>
              <Td>
                <HStack spacing={2}>
                  <Tooltip label="编辑">
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(m)}>
                      <MyIcon name="edit" w="14px" />
                    </Button>
                  </Tooltip>
                  <Tooltip label="删除">
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => openConfirm(() => deleteModel(m._id))()}
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

      {isOpen && <PdfModelModal model={editModel} onClose={onClose} onSuccess={handleSuccess} />}

      <ConfirmModal />
    </Box>
  );
};

export default PdfModelConfig;
