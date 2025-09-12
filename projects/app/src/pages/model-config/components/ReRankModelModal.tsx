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
  Button,
  VStack,
  HStack,
  Text
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { ReRankModelSchema, CreateReRankModelParams } from '@fastgpt/global/core/model/type.d';

interface ReRankModelWithId extends ReRankModelSchema {
  _id: string;
}

interface Props {
  model?: ReRankModelWithId;
  onClose: () => void;
  onSuccess: () => void;
}

const ReRankModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateReRankModelParams>({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          charsPointsPrice: model.charsPointsPrice,
          requestUrl: model.requestUrl,
          apiKey: model.apiKey
        }
      : {
          charsPointsPrice: 0
        }
  });

  const { runAsync: submitData, loading } = useRequest2(
    (data: CreateReRankModelParams) => {
      const url = isEdit
        ? `/api/model-config/rerank/${model!._id}`
        : '/api/model-config/rerank/create';
      const method = isEdit ? 'PUT' : 'POST';

      return fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    },
    {
      onSuccess() {
        toast({
          title: isEdit ? '更新成功' : '创建成功',
          status: 'success'
        });
        onSuccess();
      },
      errorToast: isEdit ? '更新失败' : '创建失败'
    }
  );

  const onSubmit = handleSubmit(async (data) => {
    await submitData(data);
  });

  return (
    <Modal isOpen onClose={onClose} size="lg">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑重排模型' : '新增重排模型'}</ModalHeader>
        <ModalCloseButton />
        <ModalBody pb={6}>
          <form onSubmit={onSubmit}>
            <VStack spacing={4} align="stretch">
              {/* 基础信息 */}
              <Text fontWeight="semibold" color="blue.600">
                基础信息
              </Text>

              <FormControl isRequired>
                <FormLabel>模型名称</FormLabel>
                <Input
                  {...register('model', { required: '模型名称不能为空' })}
                  placeholder="如: bge-reranker-base"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>显示名称</FormLabel>
                <Input
                  {...register('name', { required: '显示名称不能为空' })}
                  placeholder="如: BGE Reranker Base"
                />
              </FormControl>

              <FormControl>
                <FormLabel>价格(积分/1k字符)</FormLabel>
                <NumberInput>
                  <NumberInputField {...register('charsPointsPrice', { valueAsNumber: true })} />
                </NumberInput>
              </FormControl>

              {/* 请求配置 */}
              <Text fontWeight="semibold" color="blue.600" mt={4}>
                请求配置
              </Text>

              <FormControl isRequired>
                <FormLabel>请求URL</FormLabel>
                <Input
                  {...register('requestUrl', { required: '请求URL不能为空' })}
                  placeholder="如: https://api.example.com/v1/rerank"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>认证信息</FormLabel>
                <Input
                  {...register('apiKey', { required: '认证信息不能为空' })}
                  placeholder="如: Bearer your-api-key"
                  type="password"
                />
              </FormControl>

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

export default ReRankModelModal;
