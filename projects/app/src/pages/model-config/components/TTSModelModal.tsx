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
  Text,
  Box,
  IconButton,
  Flex,
  Select,
  Avatar
} from '@chakra-ui/react';
import { useForm, useFieldArray } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyIcon from '@fastgpt/web/components/common/Icon';
import type { TTSModelSchema, CreateTTSModelParams } from '@fastgpt/global/core/model/type.d';
import { MODEL_ICONS } from '@/constants/modelIcons';

// 编辑时需要使用到 _id，扩展类型以匹配后端返回
interface TTSModelWithId extends TTSModelSchema {
  _id: string;
}

interface Props {
  model?: TTSModelWithId;
  onClose: () => void;
  onSuccess: () => void;
}

const TTSModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors }
  } = useForm<CreateTTSModelParams>({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          charsPointsPrice: model.charsPointsPrice,
          avatar: model.avatar || '/imgs/model/tts.svg',
          sort: model.sort ?? 100,
          voices: model.voices || []
        }
      : {
          charsPointsPrice: 0,
          avatar: '/imgs/model/tts.svg',
          sort: 100,
          voices: []
        }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'voices'
  });

  const { runAsync: submitData, loading } = useRequest2(
    (data: CreateTTSModelParams) => {
      const url = isEdit ? `/api/model-config/tts/${model!._id}` : '/api/model-config/tts/create';
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
    const payload: CreateTTSModelParams = {
      model: data.model,
      name: data.name,
      charsPointsPrice: Number(data.charsPointsPrice || 0),
      avatar: data.avatar,
      sort: Number(data.sort ?? 100),
      voices: data.voices || []
    };
    await submitData(payload);
  });

  const addVoice = () => {
    append({
      label: '',
      value: '',
      bufferId: ''
    });
  };

  return (
    <Modal isOpen onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑TTS模型' : '新增TTS模型'}</ModalHeader>
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
                  placeholder="如: tts-1"
                />
              </FormControl>

              <FormControl isRequired>
                <FormLabel>显示名称</FormLabel>
                <Input
                  {...register('name', { required: '显示名称不能为空' })}
                  placeholder="如: OpenAI TTS1"
                />
              </FormControl>

              <FormControl>
                <FormLabel>价格(积分/1k字符)</FormLabel>
                <NumberInput min={0}>
                  <NumberInputField {...register('charsPointsPrice', { valueAsNumber: true })} />
                </NumberInput>
              </FormControl>

              <FormControl>
                <FormLabel>模型图标</FormLabel>
                <Flex align="center" gap={3}>
                  <Avatar src={watch('avatar') || '/imgs/model/tts.svg'} size="sm" bg="gray.100" />
                  <Select {...register('avatar')} placeholder="选择模型图标">
                    {MODEL_ICONS.map((icon) => (
                      <option key={icon} value={`/imgs/model/${icon}`}>
                        {icon.replace('.svg', '')}
                      </option>
                    ))}
                  </Select>
                </Flex>
              </FormControl>

              <FormControl>
                <FormLabel>排序值</FormLabel>
                <NumberInput min={0}>
                  <NumberInputField
                    {...register('sort', { valueAsNumber: true })}
                    placeholder="100"
                  />
                </NumberInput>
                <Text fontSize="sm" color="gray.500">
                  数字越小越靠前，默认100
                </Text>
              </FormControl>

              {/* 语音配置 */}
              <Text fontWeight="semibold" color="blue.600" mt={4}>
                语音配置
              </Text>

              {fields.map((field, index) => (
                <Box key={field.id} border="1px" borderColor="gray.200" borderRadius="md" p={4}>
                  <Flex justify="space-between" align="center" mb={3}>
                    <Text fontWeight="medium">语音 {index + 1}</Text>
                    <IconButton
                      size="sm"
                      aria-label="删除语音"
                      icon={<MyIcon name="common/trash" w="14px" />}
                      onClick={() => remove(index)}
                      colorScheme="red"
                      variant="ghost"
                    />
                  </Flex>

                  <VStack spacing={3}>
                    <FormControl isRequired>
                      <FormLabel>显示名称</FormLabel>
                      <Input
                        {...register(`voices.${index}.label`, { required: '显示名称不能为空' })}
                        placeholder="如: Alloy"
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>语音值</FormLabel>
                      <Input
                        {...register(`voices.${index}.value`, { required: '语音值不能为空' })}
                        placeholder="如: alloy"
                      />
                    </FormControl>

                    <FormControl isRequired>
                      <FormLabel>Buffer ID</FormLabel>
                      <Input
                        {...register(`voices.${index}.bufferId`, { required: 'Buffer ID不能为空' })}
                        placeholder="如: openai-Alloy"
                      />
                    </FormControl>
                  </VStack>
                </Box>
              ))}

              <Button onClick={addVoice} variant="outline" size="sm">
                添加语音
              </Button>

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

export default TTSModelModal;
