import React from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  FormControl,
  FormLabel,
  Input,
  useToast,
  FormErrorMessage
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postCreateTeam } from '@/web/support/user/team/api';

type CreateTeamModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

type FormData = {
  name: string;
};

const CreateTeamModal = ({ isOpen, onClose }: CreateTeamModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting }
  } = useForm<FormData>();

  const { mutate: createTeam, isLoading } = useRequest({
    mutationFn: async (data: FormData) => {
      await postCreateTeam({
        name: data.name
      });
      toast({
        title: '创建成功',
        status: 'success',
        position: 'top'
      });
      onClose();
    },
    errorToast: '创建失败'
  });

  const onSubmit = (data: FormData) => {
    createTeam(data);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>创建团队</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <FormControl isInvalid={!!errors.name}>
              <FormLabel>团队名称</FormLabel>
              <Input
                {...register('name', {
                  required: '请输入团队名称',
                  minLength: {
                    value: 2,
                    message: '团队名称至少2个字符'
                  },
                  maxLength: {
                    value: 20,
                    message: '团队名称最多20个字符'
                  }
                })}
                placeholder="请输入团队名称"
              />
              <FormErrorMessage>{errors.name && errors.name.message}</FormErrorMessage>
            </FormControl>
          </ModalBody>
          <ModalFooter>
            <Button mr={3} onClick={onClose} variant="outline">
              取消
            </Button>
            <Button colorScheme="primary" isLoading={isLoading} type="submit">
              创建
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

export default CreateTeamModal;
