import React, { useEffect } from 'react';
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
  FormErrorMessage,
  Avatar,
  Flex,
  IconButton
} from '@chakra-ui/react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { putUpdateTeam } from '@/web/support/user/team/api';
import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type.d';
import { UpdateTeamProps } from '@fastgpt/global/support/user/team/controller.d';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import MyIcon from '@fastgpt/web/components/common/Icon';

type EditTeamModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: TeamTmbItemType;
};

type FormData = {
  name: string;
  avatar: string;
};

const EditTeamModal = ({ isOpen, onClose, team }: EditTeamModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();

  const {
    handleSubmit,
    register,
    formState: { errors, isSubmitting },
    setValue,
    watch
  } = useForm<FormData>({
    defaultValues: {
      name: team.teamName,
      avatar: team.avatar
    }
  });

  const avatar = watch('avatar');

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: '.jpg,.jpeg,.png',
    multiple: false
  });

  const { mutate: updateTeam, isLoading } = useRequest({
    mutationFn: async (data: FormData) => {
      await putUpdateTeam({
        name: data.name,
        avatar: data.avatar,
        teamId: team.teamId
      } as any);
      toast({
        title: '更新成功',
        status: 'success',
        position: 'top'
      });
      onClose();
    },
    errorToast: '更新失败'
  });

  const onSubmit = (data: FormData) => {
    updateTeam(data);
  };

  const handleSelectFile = async (e: File[]) => {
    const file = e[0];
    if (!file) return;
    try {
      const src = await compressImgFileAndUpload({
        type: MongoImageTypeEnum.teamAvatar,
        file,
        maxW: 300,
        maxH: 300
      });
      setValue('avatar', src);
    } catch (error) {
      toast({
        title: '上传失败',
        status: 'error',
        position: 'top'
      });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>编辑团队</ModalHeader>
        <ModalCloseButton />
        <form onSubmit={handleSubmit(onSubmit)}>
          <ModalBody>
            <FormControl mb={4}>
              <FormLabel>团队头像</FormLabel>
              <Flex alignItems="center">
                <Avatar size="md" src={avatar} name={team.teamName} mr={4} />
                <Button size="sm" onClick={onOpenSelectFile}>
                  上传头像
                </Button>
              </Flex>
            </FormControl>
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
              保存
            </Button>
          </ModalFooter>
        </form>
        <File onSelect={handleSelectFile} />
      </ModalContent>
    </Modal>
  );
};

export default EditTeamModal;
