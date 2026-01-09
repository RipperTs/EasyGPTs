import React from 'react';
import { ModalBody, ModalFooter, Flex, Box, Input, Button, Select } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { adminUpdateUser, AdminUserListItem } from '@/web/support/user/admin/api';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';

type FormType = {
  username: string;
  status: `${UserStatusEnum}`;
};

const EditUserModal = ({
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
      username: user.username,
      status: user.status
    }
  });

  const { mutate: onSubmit, isLoading } = useRequest({
    mutationFn: (data: FormType) =>
      adminUpdateUser({
        userId: user._id,
        username: data.username,
        status: data.status
      }),
    onSuccess() {
      onSuccess();
      onClose();
    },
    successToast: '保存成功',
    errorToast: '保存失败'
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="/imgs/modal/setting.svg"
      title="编辑用户"
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
            状态：
          </Box>
          <Select flex={1} {...register('status', { required: true })}>
            <option value={UserStatusEnum.active}>启用</option>
            <option value={UserStatusEnum.forbidden}>停用</option>
          </Select>
        </Flex>
      </ModalBody>
      <ModalFooter>
        <Button mr={3} variant={'whiteBase'} onClick={onClose}>
          取消
        </Button>
        <Button isLoading={isLoading} onClick={handleSubmit((data) => onSubmit(data))}>
          保存
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

export default EditUserModal;
