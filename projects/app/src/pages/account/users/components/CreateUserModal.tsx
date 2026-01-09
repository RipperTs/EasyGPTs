import React from 'react';
import { ModalBody, ModalFooter, Flex, Box, Input, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { adminCreateUser } from '@/web/support/user/admin/api';

type FormType = {
  username: string;
  password: string;
  confirmPassword: string;
};

const CreateUserModal = ({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      username: '',
      password: '',
      confirmPassword: ''
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: async (data: FormType) => {
      if (data.password !== data.confirmPassword) return Promise.reject('两次密码不一致');
      return adminCreateUser({
        username: data.username,
        password: data.password
      });
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: '创建成功',
    errorToast: '创建失败'
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      title="新增用户"
      w={['90vw', '720px']}
      maxW={['90vw', '720px']}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={['0 0 88px', '0 0 100px']} whiteSpace={'nowrap'}>
            用户名：
          </Box>
          <Input flex={1} {...register('username', { required: true, maxLength: 50 })} />
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={['0 0 88px', '0 0 100px']} whiteSpace={'nowrap'}>
            初始密码：
          </Box>
          <Input
            flex={1}
            type={'password'}
            {...register('password', { required: true, maxLength: 60 })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={5}>
          <Box flex={['0 0 88px', '0 0 100px']} whiteSpace={'nowrap'}>
            确认密码：
          </Box>
          <Input
            flex={1}
            type={'password'}
            {...register('confirmPassword', { required: true, maxLength: 60 })}
          />
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default CreateUserModal;
