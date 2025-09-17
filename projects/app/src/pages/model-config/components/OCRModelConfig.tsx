import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  GridItem,
  Text,
  FormControl,
  FormLabel,
  Input,
  InputGroup,
  InputRightElement,
  NumberInput,
  NumberInputField,
  VStack
} from '@chakra-ui/react';
import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { OcrModelTyoe } from '@fastgpt/global/core/ai/model.d';
import { clientInitData } from '@/web/common/system/staticData';

// 读取当前激活的 OCR 模型（来自数据库）
const fetchOCRModel = async (): Promise<OcrModelTyoe | null> => {
  const res = await fetch('/api/model-config/ocr/active');
  if (!res.ok) return null;
  const data = await res.json();
  return (data || null) as OcrModelTyoe | null;
};

const OCRModelConfig = () => {
  const { toast } = useToast();
  const [showSecret, setShowSecret] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<OcrModelTyoe>({
    defaultValues: {
      model: '',
      name: '',
      charsPointsPrice: 0,
      requestUrl: '',
      requestAuth: ''
    }
  });

  const { runAsync: initData, loading: loadingInit } = useRequest2(async () => {
    const model = await fetchOCRModel();
    if (model) {
      reset(model);
    }
  });

  useEffect(() => {
    initData();
  }, [initData]);

  const { runAsync: saveConfig, loading } = useRequest2(
    async (data: OcrModelTyoe) => {
      const res = await fetch('/api/model-config/ocr/save', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || '保存失败');
      }
      return res.json();
    },
    {
      async onSuccess() {
        toast({ title: '保存成功', status: 'success' });
        // 刷新全局模型配置
        await clientInitData();
      },
      errorToast: '保存失败'
    }
  );

  const onSubmit = handleSubmit(async (data) => {
    // 规范数值
    const formatted: OcrModelTyoe = {
      ...data,
      charsPointsPrice: Number(data.charsPointsPrice || 0)
    };
    await saveConfig(formatted);
  });

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          OCR 模型配置
        </Text>
      </Flex>

      <form onSubmit={onSubmit}>
        <VStack spacing={6} align="stretch">
          <Grid templateColumns="repeat(2, 1fr)" gap={6}>
            <GridItem>
              <FormControl isRequired>
                <FormLabel>模型名称</FormLabel>
                <Input {...register('model', { required: true })} placeholder="如: vl-ocr" />
              </FormControl>
            </GridItem>
            <GridItem>
              <FormControl isRequired>
                <FormLabel>显示名称</FormLabel>
                <Input {...register('name', { required: true })} placeholder="如: Qwen-OCR" />
              </FormControl>
            </GridItem>
            <GridItem>
              <FormControl>
                <FormLabel>价格(积分/千字符)</FormLabel>
                <NumberInput min={0}>
                  <NumberInputField
                    {...register('charsPointsPrice', { valueAsNumber: true, min: 0 })}
                    placeholder="0"
                  />
                </NumberInput>
              </FormControl>
            </GridItem>
            <GridItem>
              <FormControl isRequired>
                <FormLabel>请求地址</FormLabel>
                <Input
                  {...register('requestUrl', { required: true })}
                  placeholder="http://host:port/v1"
                />
              </FormControl>
            </GridItem>
            <GridItem colSpan={2}>
              <FormControl>
                <FormLabel>鉴权密钥</FormLabel>
                <InputGroup>
                  <Input
                    type={showSecret ? 'text' : 'password'}
                    autoComplete="new-password"
                    {...register('requestAuth')}
                    placeholder="sk-xxxx 或 Bearer token"
                  />
                  <InputRightElement>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowSecret((s) => !s)}
                      aria-label={showSecret ? '隐藏密钥' : '显示密钥'}
                    >
                      {showSecret ? <ViewOffIcon /> : <ViewIcon />}
                    </Button>
                  </InputRightElement>
                </InputGroup>
              </FormControl>
            </GridItem>
          </Grid>

          <Flex justify="flex-end" gap={3}>
            <Button onClick={() => initData()} variant="ghost" isLoading={loadingInit}>
              重置
            </Button>
            <Button type="submit" colorScheme="blue" isLoading={isSubmitting || loading}>
              保存
            </Button>
          </Flex>
        </VStack>
      </form>
    </Box>
  );
};

export default OCRModelConfig;
