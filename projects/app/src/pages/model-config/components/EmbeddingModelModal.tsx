import React, { useState } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Textarea,
  Grid,
  GridItem,
  Button,
  VStack,
  HStack,
  Text,
  Divider,
  Select,
  Avatar,
  Flex,
  Box
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type {
  EmbeddingModelSchema,
  CreateEmbeddingModelParams
} from '@fastgpt/global/core/model/type.d';
import { MODEL_ICONS } from '@/constants/modelIcons';

interface EmbeddingModelWithId extends EmbeddingModelSchema {
  _id: string;
}

interface Props {
  model?: EmbeddingModelWithId;
  onClose: () => void;
  onSuccess: () => void;
}

const EmbeddingModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<
    CreateEmbeddingModelParams & {
      defaultConfigStr: string;
      dbConfigStr: string;
      queryConfigStr: string;
    }
  >({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          avatar: model.avatar,
          charsPointsPrice: model.charsPointsPrice,
          defaultToken: model.defaultToken,
          maxToken: model.maxToken,
          weight: model.weight,
          defaultConfigStr: JSON.stringify(model.defaultConfig, null, 2),
          dbConfigStr: JSON.stringify(model.dbConfig, null, 2),
          queryConfigStr: JSON.stringify(model.queryConfig, null, 2),
          sort: model.sort
        }
      : {
          avatar: '/imgs/model/huggingface.svg',
          charsPointsPrice: 0,
          defaultToken: 700,
          maxToken: 3000,
          weight: 100,
          defaultConfigStr: '{}',
          dbConfigStr: '{}',
          queryConfigStr: '{}',
          sort: 100
        }
  });

  const { runAsync: submitData, loading } = useRequest2(
    async (data: CreateEmbeddingModelParams) => {
      const url = isEdit
        ? `/api/model-config/embedding/${model!._id}`
        : '/api/model-config/embedding/create';
      const method = isEdit ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.message || `HTTP ${response.status}`);
      }

      return response.json();
    },
    {
      onSuccess() {
        toast({
          title: isEdit ? '更新成功' : '创建成功',
          status: 'success'
        });
        onSuccess();
      },
      onError(error) {
        console.error('提交失败:', error);
      }
    }
  );

  const onSubmit = handleSubmit(async (data) => {
    try {
      // 解析JSON配置
      let defaultConfig = {};
      let dbConfig = {};
      let queryConfig = {};

      try {
        if (data.defaultConfigStr) {
          defaultConfig = JSON.parse(data.defaultConfigStr);
        }
      } catch (error) {
        toast({
          title: '默认配置参数格式错误',
          description: '请输入有效的JSON格式',
          status: 'error'
        });
        return;
      }

      try {
        if (data.dbConfigStr) {
          dbConfig = JSON.parse(data.dbConfigStr);
        }
      } catch (error) {
        toast({
          title: '存储配置参数格式错误',
          description: '请输入有效的JSON格式',
          status: 'error'
        });
        return;
      }

      try {
        if (data.queryConfigStr) {
          queryConfig = JSON.parse(data.queryConfigStr);
        }
      } catch (error) {
        toast({
          title: '查询配置参数格式错误',
          description: '请输入有效的JSON格式',
          status: 'error'
        });
        return;
      }

      // 确保数值类型正确
      const processedData = {
        model: data.model,
        name: data.name,
        avatar: data.avatar,
        charsPointsPrice: Number(data.charsPointsPrice || 0),
        defaultToken: Number(data.defaultToken),
        maxToken: Number(data.maxToken),
        weight: Number(data.weight || 100),
        sort: Number(data.sort || 100),
        defaultConfig,
        dbConfig,
        queryConfig
      };

      await submitData(processedData);
    } catch (error) {
      console.error('表单提交错误:', error);
    }
  });

  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑嵌入模型' : '新增嵌入模型'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <form onSubmit={onSubmit}>
            <VStack spacing={4} align="stretch">
              {/* 基础信息 */}
              <Text fontWeight="semibold" color="blue.600">
                基础信息
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>模型名称</FormLabel>
                    <Input
                      {...register('model', { required: '模型名称不能为空' })}
                      placeholder="如: m3e-base"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>显示名称</FormLabel>
                    <Input
                      {...register('name', { required: '显示名称不能为空' })}
                      placeholder="如: M3E-Base"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>模型图标</FormLabel>
                    <Flex align="center" gap={3}>
                      <Avatar src={watch('avatar')} size="sm" bg="gray.100" />
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
                    <FormLabel>价格(积分/1k tokens)</FormLabel>
                    <NumberInput min={0}>
                      <NumberInputField
                        {...register('charsPointsPrice', { valueAsNumber: true, min: 0 })}
                        placeholder="0"
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
              </Grid>

              <Divider />

              {/* Token 配置 */}
              <Text fontWeight="semibold" color="blue.600">
                Token配置
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>默认Token</FormLabel>
                    <NumberInput min={1}>
                      <NumberInputField
                        {...register('defaultToken', {
                          required: '默认Token不能为空',
                          valueAsNumber: true,
                          min: 1
                        })}
                        placeholder="700"
                      />
                    </NumberInput>
                    <Text fontSize="sm" color="gray.500">
                      默认文本分割时的token数
                    </Text>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>最大Token</FormLabel>
                    <NumberInput min={1}>
                      <NumberInputField
                        {...register('maxToken', {
                          required: '最大Token不能为空',
                          valueAsNumber: true,
                          min: 1
                        })}
                        placeholder="3000"
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>训练权重</FormLabel>
                    <NumberInput min={1}>
                      <NumberInputField
                        {...register('weight', { valueAsNumber: true, min: 1 })}
                        placeholder="100"
                      />
                    </NumberInput>
                    <Text fontSize="sm" color="gray.500">
                      优先训练权重，数值越大优先级越高
                    </Text>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>排序值</FormLabel>
                    <NumberInput min={0}>
                      <NumberInputField
                        {...register('sort', { valueAsNumber: true, min: 0 })}
                        placeholder="100"
                      />
                    </NumberInput>
                    <Text fontSize="sm" color="gray.500">
                      数字越小越靠前，默认100
                    </Text>
                  </FormControl>
                </GridItem>
              </Grid>

              <Divider />

              {/* 高级配置 */}
              <Flex justify="space-between" align="center">
                <Text fontWeight="semibold" color="blue.600">
                  高级配置
                </Text>
                <Button size="sm" variant="ghost" onClick={() => setShowAdvanced(!showAdvanced)}>
                  {showAdvanced ? '收起' : '展开'}
                </Button>
              </Flex>

              {showAdvanced && (
                <>
                  <FormControl>
                    <FormLabel>默认配置参数 (JSON)</FormLabel>
                    <Textarea
                      {...register('defaultConfigStr')}
                      placeholder='{"dimensions": 1024}'
                      rows={3}
                    />
                    <Text fontSize="sm" color="gray.500">
                      请求API时携带的额外参数，JSON格式
                    </Text>
                  </FormControl>
                  <FormControl>
                    <FormLabel>存储配置参数 (JSON)</FormLabel>
                    <Textarea {...register('dbConfigStr')} placeholder="{}" rows={3} />
                    <Text fontSize="sm" color="gray.500">
                      存储时的额外参数（非对称向量模型时需要）
                    </Text>
                  </FormControl>
                  <FormControl>
                    <FormLabel>查询配置参数 (JSON)</FormLabel>
                    <Textarea {...register('queryConfigStr')} placeholder="{}" rows={3} />
                    <Text fontSize="sm" color="gray.500">
                      查询时的额外参数
                    </Text>
                  </FormControl>
                </>
              )}

              {/* 提交按钮 */}
              <HStack justify="flex-end" pt={4}>
                <Button onClick={onClose} variant="ghost">
                  取消
                </Button>
                <Button type="submit" colorScheme="blue" isLoading={loading}>
                  {isEdit ? '更新' : '创建'}
                </Button>
              </HStack>
            </VStack>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default EmbeddingModelModal;
