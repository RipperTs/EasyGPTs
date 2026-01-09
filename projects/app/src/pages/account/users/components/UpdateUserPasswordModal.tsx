import React from 'react';
import { ModalBody, ModalFooter, Flex, Box, Input, Button } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { adminUpdateUserPassword, AdminUserListItem } from '@/web/support/user/admin/api';

type FormType = {
  newPassword: string;
  confirmPassword: string;
};

const UpdateUserPasswordModal = ({
  user,
  onClose,
  onSuccess
}: {
  user: AdminUserListItem;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const { register, handleSubmit } = useForm<FormType>({
    defaultValues: {
      newPassword: '',
      confirmPassword: ''
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: async (data: FormType) => {
      if (data.newPassword !== data.confirmPassword) return Promise.reject('两次密码不一致');
      return adminUpdateUserPassword({
        userId: user._id,
        newPassword: data.newPassword
      });
    },
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: '修改成功',
    errorToast: '修改失败'
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/password.svg"
      title={`修改密码：${user.username}`}
      w={['90vw', '720px']}
      maxW={['90vw', '720px']}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <Box flex={['0 0 88px', '0 0 100px']} whiteSpace={'nowrap'}>
            新密码：
          </Box>
          <Input
            flex={1}
            type={'password'}
            {...register('newPassword', { required: true, maxLength: 60 })}
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

export default UpdateUserPasswordModal;
