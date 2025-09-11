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
  Switch,
  Textarea,
  Grid,
  GridItem,
  Button,
  VStack,
  HStack,
  Text,
  Divider
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import type { LLMModelSchema, CreateLLMModelParams } from '@fastgpt/global/core/model/type.d';

interface Props {
  model?: LLMModelSchema;
  onClose: () => void;
  onSuccess: () => void;
}

const LLMModelModal = ({ model, onClose, onSuccess }: Props) => {
  const { toast } = useToast();
  const isEdit = !!model;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<CreateLLMModelParams>({
    defaultValues: model
      ? {
          model: model.model,
          name: model.name,
          avatar: model.avatar,
          maxContext: model.maxContext,
          maxResponse: model.maxResponse,
          quoteMaxToken: model.quoteMaxToken,
          maxTemperature: model.maxTemperature,
          charsPointsPrice: model.charsPointsPrice,
          censor: model.censor,
          vision: model.vision,
          reasoning: model.reasoning,
          datasetProcess: model.datasetProcess,
          usedInClassify: model.usedInClassify,
          usedInExtractFields: model.usedInExtractFields,
          usedInToolCall: model.usedInToolCall,
          usedInQueryExtension: model.usedInQueryExtension,
          toolChoice: model.toolChoice,
          functionCall: model.functionCall,
          customCQPrompt: model.customCQPrompt,
          customExtractPrompt: model.customExtractPrompt,
          defaultSystemChatPrompt: model.defaultSystemChatPrompt
        }
      : {
          avatar: '/imgs/model/openai.svg',
          charsPointsPrice: 0,
          censor: false,
          vision: false,
          reasoning: false,
          datasetProcess: false,
          usedInClassify: false,
          usedInExtractFields: false,
          usedInToolCall: false,
          usedInQueryExtension: false,
          toolChoice: false,
          functionCall: false,
          customCQPrompt: '',
          customExtractPrompt: '',
          defaultSystemChatPrompt: ''
        }
  });

  const { runAsync: submitData, loading } = useRequest2(
    (data: CreateLLMModelParams) => {
      const url = isEdit ? `/api/model-config/llm/${model!._id}` : '/api/model-config/llm/create';
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

  const booleanFields = [
    { key: 'censor', label: '敏感内容检测' },
    { key: 'vision', label: '视觉输入支持' },
    { key: 'reasoning', label: '推理能力' },
    { key: 'datasetProcess', label: '知识库处理' },
    { key: 'usedInClassify', label: '问题分类' },
    { key: 'usedInExtractFields', label: '内容提取' },
    { key: 'usedInToolCall', label: '工具调用' },
    { key: 'usedInQueryExtension', label: '问题优化' },
    { key: 'toolChoice', label: '工具选择' },
    { key: 'functionCall', label: '函数调用' }
  ];

  return (
    <Modal isOpen onClose={onClose} size="2xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{isEdit ? '编辑模型' : '新增模型'}</ModalHeader>
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
                      placeholder="如: gpt-4o-mini"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>显示名称</FormLabel>
                    <Input
                      {...register('name', { required: '显示名称不能为空' })}
                      placeholder="如: GPT-4o Mini"
                    />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>模型图标</FormLabel>
                    <Input {...register('avatar')} placeholder="图标URL" />
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl>
                    <FormLabel>价格(积分/1k tokens)</FormLabel>
                    <NumberInput>
                      <NumberInputField
                        {...register('charsPointsPrice', { valueAsNumber: true })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
              </Grid>

              <Divider />

              {/* 参数配置 */}
              <Text fontWeight="semibold" color="blue.600">
                参数配置
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>最大上下文</FormLabel>
                    <NumberInput>
                      <NumberInputField
                        {...register('maxContext', {
                          required: '最大上下文不能为空',
                          valueAsNumber: true
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>最大回复</FormLabel>
                    <NumberInput>
                      <NumberInputField
                        {...register('maxResponse', {
                          required: '最大回复不能为空',
                          valueAsNumber: true
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>最大引用Token</FormLabel>
                    <NumberInput>
                      <NumberInputField
                        {...register('quoteMaxToken', {
                          required: '最大引用Token不能为空',
                          valueAsNumber: true
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
                <GridItem>
                  <FormControl isRequired>
                    <FormLabel>最大温度</FormLabel>
                    <NumberInput step={0.1} min={0} max={2}>
                      <NumberInputField
                        {...register('maxTemperature', {
                          required: '最大温度不能为空',
                          valueAsNumber: true
                        })}
                      />
                    </NumberInput>
                  </FormControl>
                </GridItem>
              </Grid>

              <Divider />

              {/* 功能开关 */}
              <Text fontWeight="semibold" color="blue.600">
                功能配置
              </Text>
              <Grid templateColumns="repeat(2, 1fr)" gap={4}>
                {booleanFields.map((field) => (
                  <GridItem key={field.key}>
                    <FormControl>
                      <HStack justify="space-between">
                        <FormLabel mb={0}>{field.label}</FormLabel>
                        <Switch
                          isChecked={watch(field.key as keyof CreateLLMModelParams) as boolean}
                          onChange={(e) =>
                            setValue(
                              field.key as keyof CreateLLMModelParams,
                              e.target.checked as any
                            )
                          }
                        />
                      </HStack>
                    </FormControl>
                  </GridItem>
                ))}
              </Grid>

              <Divider />

              {/* 自定义提示词 */}
              <Text fontWeight="semibold" color="blue.600">
                自定义提示词
              </Text>
              <FormControl>
                <FormLabel>文本分类提示词</FormLabel>
                <Textarea
                  {...register('customCQPrompt')}
                  placeholder="自定义文本分类提示词（可选）"
                  rows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>内容提取提示词</FormLabel>
                <Textarea
                  {...register('customExtractPrompt')}
                  placeholder="自定义内容提取提示词（可选）"
                  rows={3}
                />
              </FormControl>
              <FormControl>
                <FormLabel>默认系统提示词</FormLabel>
                <Textarea
                  {...register('defaultSystemChatPrompt')}
                  placeholder="对话默认携带的系统提示词（可选）"
                  rows={3}
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

export default LLMModelModal;
