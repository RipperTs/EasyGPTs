import React, { useState } from 'react';
import {
  Avatar,
  Button,
  Divider,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  HStack,
  IconButton,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
  NumberInput,
  NumberInputField,
  Select,
  Text,
  Textarea,
  VStack
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { MODEL_ICONS } from '@/constants/modelIcons';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { PdfParserType } from '@fastgpt/service/common/pdf/types';

type PdfModelWithId = {
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

interface Props {
  model?: PdfModelWithId;
  onClose: () => void;
  onSuccess: () => void;
}

type FormType = {
  model: string;
  name: string;
  avatar?: string;
  charsPointsPrice?: number;
  type: PdfParserType;
  requestUrl?: string;
  apiKey?: string;
  defaultConfigStr?: string;
};

const PdfModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;
  const [kvPairs, setKvPairs] = useState<Array<{ k: string; v: string }>>([]);

  const { register, handleSubmit, watch, setValue } = useForm<FormType>({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          avatar: model.avatar || '/imgs/model/llm.svg',
          charsPointsPrice: model.charsPointsPrice || 0,
          type: model.type,
          requestUrl: model.requestUrl,
          apiKey: model.apiKey,
          defaultConfigStr: JSON.stringify(model.defaultConfig || {}, null, 2)
        }
      : {
          avatar: '/imgs/model/llm.svg',
          charsPointsPrice: 0,
          type: 'mineru',
          defaultConfigStr: '{}'
        }
  });

  const { runAsync: submitData, loading } = useRequest2(
    async (data: {
      model: string;
      name: string;
      avatar?: string;
      charsPointsPrice?: number;
      type: PdfParserType;
      requestUrl?: string;
      apiKey?: string;
      defaultConfig?: Record<string, unknown>;
    }) => {
      const url = isEdit ? `/api/model-config/pdf/${model!._id}` : '/api/model-config/pdf/create';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || '保存失败');
      }
      return res.json();
    },
    {
      onSuccess() {
        toast({ title: isEdit ? '更新成功' : '创建成功', status: 'success' });
        onSuccess();
      },
      errorToast: '保存失败'
    }
  );

  const onSubmit = handleSubmit(async (data) => {
    let defaultConfig: Record<string, unknown> = {};
    try {
      defaultConfig = data.defaultConfigStr ? JSON.parse(data.defaultConfigStr) : {};
    } catch (e) {
      toast({ title: '默认配置需为合法JSON', status: 'warning' });
      return;
    }

    const payload = {
      model: String(data.model || '').trim(),
      name: String(data.name || '').trim(),
      avatar: data.avatar,
      charsPointsPrice: Number(data.charsPointsPrice || 0),
      type: data.type,
      requestUrl: data.requestUrl?.trim(),
      apiKey: data.apiKey?.trim(),
      defaultConfig
    };

    await submitData(payload);
  });

  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑 PDF 解析模型' : '新增 PDF 解析模型'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <form onSubmit={onSubmit}>
            <VStack spacing={4} align="stretch">
              <Text fontWeight="semibold" color="blue.600">
                基础信息
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>模型名称</FormLabel>
                    <Input {...register('model', { required: true })} placeholder="如: mineru-1" />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>显示名称</FormLabel>
                    <Input {...register('name', { required: true })} placeholder="如: MinerU" />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>模型图标</FormLabel>
                    <Flex align="center" gap={3}>
                      <Avatar
                        src={watch('avatar') || '/imgs/model/llm.svg'}
                        size="sm"
                        bg="gray.100"
                      />
                      <Select {...register('avatar')} placeholder="选择模型图标">
                        {MODEL_ICONS.map((icon) => (
                          <option key={icon} value={`/imgs/model/${icon}`}>
                            {icon.replace('.svg', '')}
                          </option>
                        ))}
                      </Select>
                    </Flex>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>价格(积分/千字符)</FormLabel>
                    <NumberInput min={0}>
                      <NumberInputField
                        {...register('charsPointsPrice', { valueAsNumber: true })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
              </Grid>

              <Divider />

              <Text fontWeight="semibold" color="blue.600">
                访问配置
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>类型</FormLabel>
                    <Select {...register('type', { required: true })}>
                      <option value="mineru">MinerU API</option>
                      <option value="doc2x">Doc2x</option>
                      <option value="mineru-local">私有化MinerU</option>
                    </Select>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>请求地址</FormLabel>
                    <Input
                      {...register('requestUrl')}
                      placeholder="如: https://api.example.com/parse"
                    />
                  </FormControl>
                </GridItem>
                <GridItem colSpan={2}>
                  <FormControl>
                    <FormLabel>接口鉴权秘钥</FormLabel>
                    <Input
                      type={'password'}
                      {...register('apiKey')}
                      placeholder="用于接口鉴权的token"
                    />
                  </FormControl>
                </GridItem>
              </Grid>

              <FormControl>
                <FormLabel>默认请求参数(JSON)</FormLabel>
                <Textarea
                  {...register('defaultConfigStr')}
                  rows={4}
                  placeholder='{"extract_tables": true}'
                />
                <Text fontSize="sm" color="gray.500">
                  以JSON格式保存，可自定义请求参数
                </Text>
              </FormControl>

              {/* 可视化键值编辑器（简化版） */}
              <Text fontWeight="semibold" color="blue.600">
                可视化参数编辑
              </Text>
              <HStack>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    try {
                      const str = (watch('defaultConfigStr') || '{}') as string;
                      const obj = JSON.parse(str) as Record<string, unknown>;
                      const next: Array<{ k: string; v: string }> = Object.entries(obj).map(
                        ([k, v]) => ({ k, v: typeof v === 'string' ? v : JSON.stringify(v) })
                      );
                      setKvPairs(next);
                      toast({ title: '已从JSON载入', status: 'success' });
                    } catch (err) {
                      toast({ title: 'JSON不合法，无法载入', status: 'warning' });
                    }
                  }}
                >
                  从JSON载入参数
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const obj: Record<string, unknown> = {};
                    kvPairs.forEach(({ k, v }) => {
                      if (!k) return;
                      try {
                        obj[k] = v ? JSON.parse(v) : '';
                      } catch {
                        obj[k] = v;
                      }
                    });
                    const str = JSON.stringify(obj, null, 2);
                    setValue('defaultConfigStr', str, { shouldDirty: true, shouldTouch: true });
                    toast({ title: '已应用到JSON', status: 'success' });
                  }}
                >
                  应用到JSON
                </Button>
                <Button
                  size="sm"
                  onClick={() => setKvPairs((l) => [...l, { k: '', v: '' }])}
                  leftIcon={<MyIcon name="common/addLight" w="14px" />}
                >
                  添加参数
                </Button>
              </HStack>
              {kvPairs.map((item, i) => (
                <Grid key={i} templateColumns="1fr 1fr 40px" gap={2} alignItems="center">
                  <Input
                    placeholder="键"
                    value={item.k}
                    onChange={(e) =>
                      setKvPairs((l) =>
                        l.map((it, idx) => (idx === i ? { ...it, k: e.target.value } : it))
                      )
                    }
                  />
                  <Input
                    placeholder="值(可为JSON字符串)"
                    value={item.v}
                    onChange={(e) =>
                      setKvPairs((l) =>
                        l.map((it, idx) => (idx === i ? { ...it, v: e.target.value } : it))
                      )
                    }
                  />
                  <IconButton
                    aria-label="删除"
                    size="sm"
                    icon={<MyIcon name="common/trash" w="14px" />}
                    onClick={() => setKvPairs((l) => l.filter((_, idx) => idx !== i))}
                    variant="ghost"
                    colorScheme="red"
                  />
                </Grid>
              ))}

              <HStack justify="flex-end">
                <Button onClick={onClose} variant="ghost">
                  取消
                </Button>
                <Button type="submit" colorScheme="blue" isLoading={loading}>
                  保存
                </Button>
              </HStack>
            </VStack>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default PdfModelModal;
