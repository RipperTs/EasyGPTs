import {
  Flex,
  Box,
  Grid,
  ModalBody,
  InputGroup,
  InputLeftElement,
  Input,
  Checkbox,
  ModalFooter,
  Button,
  useToast
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useContextSelector } from 'use-context-selector';
import MyAvatar from '@fastgpt/web/components/common/Avatar';
import { useMemo, useState, useCallback, useEffect } from 'react';
import PermissionSelect from './PermissionSelect';
import PermissionTags from './PermissionTags';
import { CollaboratorContext } from './context';
import { useUserStore } from '@/web/support/user/useUserStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { ChevronDownIcon } from '@chakra-ui/icons';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useTranslation } from 'next-i18next';
import { debounce } from 'lodash';
import { searchUsers } from '@/web/support/user/api';
import { createTeamMember } from '@/web/support/user/team/api';

export type AddModalPropsType = {
  onClose: () => void;
};

function AddMemberModal({ onClose }: AddModalPropsType) {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const toast = useToast();

  const { permissionList, collaboratorList, onUpdateCollaborators, getPerLabelList } =
    useContextSelector(CollaboratorContext, (v) => v);
  const [searchText, setSearchText] = useState<string>('');

  // 搜索结果
  const {
    data: searchResults = [],
    loading: loadingSearch,
    run: fetchUsers
  } = useRequest2(
    async (keyword: string) => {
      if (!keyword) return [];
      const users = await searchUsers(keyword);
      return users;
    },
    {
      manual: true
    }
  );

  // 使用debounce处理搜索，避免频繁请求
  const debouncedSearch = useCallback(
    debounce((value: string) => {
      if (value) {
        fetchUsers(value);
      }
    }, 300),
    [fetchUsers]
  );

  // 处理搜索输入
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchText(value);
      debouncedSearch(value);
    },
    [debouncedSearch]
  );

  const [selectedUsers, setSelectedUsers] = useState<
    Array<{
      userId: string;
      username: string;
      avatar: string;
      tmbId?: string;
    }>
  >([]);
  const [selectedPermission, setSelectedPermission] = useState(permissionList['read'].value);
  const perLabel = useMemo(() => {
    return getPerLabelList(selectedPermission).join('、');
  }, [getPerLabelList, selectedPermission]);

  // 过滤掉已经是协作者的用户
  const filteredSearchResults = useMemo(() => {
    return searchResults.filter((user) => {
      // 排除已选择的用户
      if (selectedUsers.some((selected) => selected.userId === user.userId)) {
        return false;
      }

      // 排除已经是协作者的用户
      const isCollaborator = collaboratorList.some((collaborator) => {
        // 这里需要根据实际情况判断，可能需要调整
        return false; // 暂时不过滤
      });

      return !isCollaborator;
    });
  }, [searchResults, selectedUsers, collaboratorList]);

  const { mutate: onConfirm, isLoading: isUpdating } = useRequest({
    mutationFn: async () => {
      if (selectedUsers.length === 0) {
        toast({
          title: '请先选择用户',
          status: 'warning'
        });
        return Promise.reject('请先选择用户');
      }

      // 为每个用户创建团队成员
      const createMemberPromises = selectedUsers.map(async (user) => {
        if (user.tmbId) return user.tmbId;
        try {
          const { tmbId } = await createTeamMember(user.userId);
          return tmbId;
        } catch (error) {
          console.error('创建团队成员失败:', error);
          return null;
        }
      });

      const tmbIds = (await Promise.all(createMemberPromises)).filter(Boolean) as string[];

      if (tmbIds.length === 0) {
        toast({
          title: '创建团队成员失败',
          status: 'error'
        });
        return Promise.reject('创建团队成员失败');
      }

      // 添加协作者
      return onUpdateCollaborators({
        tmbIds,
        permission: selectedPermission
      });
    },
    successToast: t('common:common.Add Success'),
    errorToast: 'Error',
    onSuccess() {
      onClose();
    }
  });

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc="modal/AddClb"
      title={t('user:team.add_collaborator')}
      minW="800px"
    >
      <ModalBody>
        <MyBox
          isLoading={loadingSearch}
          display={'grid'}
          minH="400px"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="55% 45%"
          fontSize={'sm'}
        >
          <Flex
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
            minH="200px"
          >
            <InputGroup alignItems="center" size="sm">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" color={'myGray.500'} />
              </InputLeftElement>
              <Input
                placeholder={t('user:search_user')}
                bgColor="myGray.50"
                value={searchText}
                onChange={handleSearchChange}
              />
            </InputGroup>
            <Flex flexDirection="column" mt="2">
              {filteredSearchResults.map((user) => {
                const onChange = () => {
                  setSelectedUsers([...selectedUsers, user]);
                };

                return (
                  <Flex
                    key={user.userId}
                    mt="1"
                    py="1"
                    px="3"
                    borderRadius="sm"
                    alignItems="center"
                    _hover={{
                      bgColor: 'myGray.50',
                      cursor: 'pointer'
                    }}
                    onClick={onChange}
                  >
                    <Flex flexDirection="row" w="full" justifyContent="space-between">
                      <Flex flexDirection="row" alignItems="center">
                        <MyAvatar src={user.avatar} w="32px" />
                        <Box ml="2">{user.username}</Box>
                      </Flex>
                    </Flex>
                  </Flex>
                );
              })}
              {searchText && filteredSearchResults.length === 0 && (
                <Flex justifyContent="center" alignItems="center" h="100px">
                  没有找到匹配的用户
                </Flex>
              )}
            </Flex>
          </Flex>
          <Flex p="4" flexDirection="column">
            <Box>
              {t('user:has_chosen') + ': '}+ {selectedUsers.length}
            </Box>
            <Flex flexDirection="column" mt="2">
              {selectedUsers.map((user) => (
                <Flex
                  key={user.userId}
                  alignItems="center"
                  justifyContent="space-between"
                  py="2"
                  px={3}
                  borderRadius={'md'}
                  _hover={{ bg: 'myGray.50' }}
                  _notLast={{ mb: 2 }}
                >
                  <Avatar src={user.avatar} w="24px" />
                  <Box w="full">{user.username}</Box>
                  <MyIcon
                    name="common/closeLight"
                    w="16px"
                    cursor={'pointer'}
                    _hover={{
                      color: 'red.600'
                    }}
                    onClick={() =>
                      setSelectedUsers(selectedUsers.filter((item) => item.userId !== user.userId))
                    }
                  />
                </Flex>
              ))}
            </Flex>
          </Flex>
        </MyBox>
      </ModalBody>
      <ModalFooter>
        <PermissionSelect
          value={selectedPermission}
          Button={
            <Flex
              alignItems={'center'}
              bg={'myGray.50'}
              border="base"
              fontSize={'sm'}
              px={3}
              borderRadius={'md'}
              h={'32px'}
            >
              {t(perLabel as any)}
              <ChevronDownIcon fontSize={'md'} />
            </Flex>
          }
          onChange={(v) => setSelectedPermission(v)}
        />
        <Button isLoading={isUpdating} ml="4" h={'32px'} onClick={onConfirm}>
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}

export default AddMemberModal;
