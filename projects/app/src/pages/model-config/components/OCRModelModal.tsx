import React from 'react';
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
  Grid,
  GridItem,
  Button,
  VStack,
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
import type { OCRModelSchema } from '@fastgpt/global/core/model/type.d';
import { MODEL_ICONS } from '@/constants/modelIcons';

interface OCRModelWithId extends OCRModelSchema {
  _id: string;
}

interface Props {
  model?: OCRModelWithId;
  onClose: () => void;
  onSuccess: () => void;
}

type FormDataType = {
  model: string;
  name: string;
  avatar?: string;
  charsPointsPrice?: number;
};

const OCRModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;

  const { register, handleSubmit, watch } = useForm<FormDataType>({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          avatar: model.avatar,
          charsPointsPrice: model.charsPointsPrice
        }
      : {
          avatar: '/imgs/model/ocr.svg',
          charsPointsPrice: 0
        }
  });

  const { runAsync: submitData, loading } = useRequest2(
    async (data: FormDataType) => {
      const url = isEdit ? `/api/model-config/ocr/${model!._id}` : '/api/model-config/ocr/create';
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
        toast({ title: isEdit ? '更新成功' : '创建成功', status: 'success' });
        onSuccess();
      }
    }
  );

  const onSubmit = handleSubmit(async (data) => {
    const payload: FormDataType = {
      model: data.model.trim(),
      name: data.name.trim(),
      avatar: data.avatar,
      charsPointsPrice: Number(data.charsPointsPrice || 0)
    };
    await submitData(payload);
  });

  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑 OCR 模型' : '新增 OCR 模型'}</ModalHeader>
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
                    <Input
                      {...register('model', { required: '模型名称不能为空' })}
                      placeholder="如: gpt-4o-mini"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>显示名称</FormLabel>
                    <Input
                      {...register('name', { required: '显示名称不能为空' })}
                      placeholder="如: OCR-Model"
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

              <Divider />

              <Box textAlign="right">
                <Button type="submit" colorScheme="blue" isLoading={loading}>
                  保存
                </Button>
              </Box>
            </VStack>
          </form>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
};

export default OCRModelModal;
