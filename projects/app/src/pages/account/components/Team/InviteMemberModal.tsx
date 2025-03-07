import React, { useState, useCallback } from 'react';
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalFooter,
  ModalBody,
  ModalCloseButton,
  Button,
  useToast,
  Input,
  InputGroup,
  InputLeftElement,
  Box,
  Flex,
  Text,
  Avatar,
  VStack,
  Divider
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { postInviteTeamMember } from '@/web/support/user/team/api';
import { searchUsers } from '@/web/support/user/api';
import { debounce } from 'lodash';
import MyIcon from '@fastgpt/web/components/common/Icon';

type InviteMemberModalProps = {
  isOpen: boolean;
  onClose: () => void;
  teamId: string;
};

const InviteMemberModal = ({ isOpen, onClose, teamId }: InviteMemberModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchText, setSearchText] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{
      userId: string;
      username: string;
      avatar: string;
    }>
  >([]);
  const [selectedUser, setSelectedUser] = useState<{
    userId: string;
    username: string;
    avatar: string;
  } | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  // 搜索用户
  const searchUser = useCallback(
    debounce(async (keyword: string) => {
      if (!keyword) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        console.log('搜索用户:', keyword);
        const results = await searchUsers(keyword);
        console.log('搜索结果:', results);
        setSearchResults(results);
      } catch (error) {
        console.error('搜索用户失败:', error);
        toast({
          title: '搜索用户失败',
          status: 'error'
        });
      } finally {
        setIsSearching(false);
      }
    }, 300),
    [toast]
  );

  // 处理搜索输入
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchText(value);
      if (value.trim()) {
        searchUser(value);
      } else {
        setSearchResults([]);
      }
    },
    [searchUser]
  );

  // 选择用户
  const handleSelectUser = useCallback(
    (user: { userId: string; username: string; avatar: string }) => {
      setSelectedUser(user);
      setSearchResults([]);
      setSearchText('');
    },
    []
  );

  // 邀请成员
  const { mutate: inviteMember, isLoading: isInviting } = useRequest({
    mutationFn: async () => {
      if (!selectedUser) {
        toast({
          title: '请先选择用户',
          status: 'warning',
          position: 'top'
        });
        return;
      }

      console.log('邀请成员:', {
        teamId,
        usernames: [selectedUser.username],
        userId: selectedUser.userId
      });

      await postInviteTeamMember({
        teamId,
        usernames: [selectedUser.username],
        permission: 0,
        userId: selectedUser.userId
      } as any);

      toast({
        title: '邀请成功',
        status: 'success',
        position: 'top'
      });

      onClose();
    },
    errorToast: '邀请失败'
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>邀请成员</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text mb={2}>搜索用户</Text>
              <InputGroup>
                <InputLeftElement>
                  <MyIcon name="common/searchLight" w="16px" />
                </InputLeftElement>
                <Input
                  placeholder="输入用户名搜索"
                  value={searchText}
                  onChange={handleSearchChange}
                />
              </InputGroup>

              {searchResults.length > 0 && (
                <Box mt={2} borderWidth="1px" borderRadius="md" maxH="200px" overflow="auto">
                  {searchResults.map((user) => (
                    <Flex
                      key={user.userId}
                      p={2}
                      alignItems="center"
                      _hover={{ bg: 'gray.50' }}
                      cursor="pointer"
                      onClick={() => handleSelectUser(user)}
                    >
                      <Avatar size="sm" name={user.username} src={user.avatar} mr={2} />
                      <Text>{user.username}</Text>
                    </Flex>
                  ))}
                </Box>
              )}

              {isSearching && (
                <Text mt={2} fontSize="sm" color="gray.500">
                  搜索中...
                </Text>
              )}

              {searchText && !isSearching && searchResults.length === 0 && (
                <Text mt={2} fontSize="sm" color="gray.500">
                  未找到匹配的用户
                </Text>
              )}
            </Box>

            {selectedUser && (
              <>
                <Divider />
                <Box>
                  <Text mb={2}>已选择用户</Text>
                  <Flex
                    p={2}
                    alignItems="center"
                    borderWidth="1px"
                    borderRadius="md"
                    justifyContent="space-between"
                  >
                    <Flex alignItems="center">
                      <Avatar
                        size="sm"
                        name={selectedUser.username}
                        src={selectedUser.avatar}
                        mr={2}
                      />
                      <Text>{selectedUser.username}</Text>
                    </Flex>
                    <Button
                      size="sm"
                      variant="ghost"
                      colorScheme="red"
                      onClick={() => setSelectedUser(null)}
                    >
                      移除
                    </Button>
                  </Flex>
                </Box>
              </>
            )}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button mr={3} onClick={onClose} variant="outline">
            取消
          </Button>
          <Button
            colorScheme="primary"
            isLoading={isInviting}
            onClick={inviteMember}
            isDisabled={!selectedUser}
          >
            邀请
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

export default InviteMemberModal;
