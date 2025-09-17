import React, { useEffect } from 'react';
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
  NumberInput,
  NumberInputField,
  VStack
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { clientInitData } from '@/web/common/system/staticData';

type WhisperForm = {
  model: string;
  name: string;
  charsPointsPrice: number;
};

// 读取当前激活的 Whisper 模型（来自数据库）
const fetchWhisperModel = async (): Promise<WhisperForm | null> => {
  const res = await fetch('/api/model-config/whisper/active');
  if (!res.ok) return null;
  const data = await res.json();
  return (data || null) as WhisperForm | null;
};

const WhisperModelConfig = () => {
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<WhisperForm>({
    defaultValues: {
      model: '',
      name: '',
      charsPointsPrice: 0
    }
  });

  const { runAsync: initData, loading: loadingInit } = useRequest2(async () => {
    const model = await fetchWhisperModel();
    if (model) {
      reset(model);
    }
  });

  useEffect(() => {
    initData();
  }, [initData]);

  const { runAsync: saveConfig, loading } = useRequest2(
    async (data: WhisperForm) => {
      const res = await fetch('/api/model-config/whisper/save', {
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
    const formatted: WhisperForm = {
      ...data,
      charsPointsPrice: Number(data.charsPointsPrice || 0)
    };
    await saveConfig(formatted);
  });

  return (
    <Box p={6}>
      <Flex justify="space-between" align="center" mb={6}>
        <Text fontSize="xl" fontWeight="semibold">
          语音识别模型配置
        </Text>
      </Flex>

      <form onSubmit={onSubmit}>
        <VStack spacing={6} align="stretch">
          <Grid templateColumns="repeat(2, 1fr)" gap={6}>
            <GridItem>
              <FormControl isRequired>
                <FormLabel>模型名称</FormLabel>
                <Input {...register('model', { required: true })} placeholder="如: whisper-1" />
              </FormControl>
            </GridItem>
            <GridItem>
              <FormControl isRequired>
                <FormLabel>显示名称</FormLabel>
                <Input {...register('name', { required: true })} placeholder="如: Whisper1" />
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

export default WhisperModelConfig;
