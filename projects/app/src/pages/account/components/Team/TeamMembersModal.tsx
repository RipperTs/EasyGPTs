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
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  IconButton,
  Flex,
  Avatar,
  Text,
  Box,
  Input,
  InputGroup,
  InputLeftElement,
  useDisclosure,
  Spinner
} from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTeamMembers, postInviteTeamMember, delRemoveMember } from '@/web/support/user/team/api';
import { TeamTmbItemType, TeamMemberItemType } from '@fastgpt/global/support/user/team/type.d';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { searchUsers } from '@/web/support/user/api';
import { debounce } from 'lodash';
import dynamic from 'next/dynamic';

const InviteMemberModal = dynamic(() => import('./InviteMemberModal'));

type TeamMembersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: TeamTmbItemType;
};

const TeamMembersModal = ({ isOpen, onClose, team }: TeamMembersModalProps) => {
  const { t } = useTranslation();
  const toast = useToast();
  const [searchText, setSearchText] = useState('');

  // 邀请成员模态框
  const {
    isOpen: isInviteModalOpen,
    onOpen: onInviteModalOpen,
    onClose: onInviteModalClose
  } = useDisclosure();

  // 获取团队成员列表
  const {
    data: members = [],
    loading: loadingMembers,
    refresh: refreshMembers
  } = useRequest2(() => getTeamMembers(team.teamId), {
    refreshDeps: [team.teamId],
    manual: false
  });

  // 过滤团队成员
  const filteredMembers = members.filter(
    (member) =>
      searchText === '' || member.memberName.toLowerCase().includes(searchText.toLowerCase())
  );

  // 删除成员确认
  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确定要移除该成员吗？'
  });

  // 删除成员
  const { mutate: removeMember, isLoading: isRemoving } = useRequest({
    mutationFn: async (tmbId: string) => {
      await delRemoveMember(tmbId);
      toast({
        title: '移除成功',
        status: 'success',
        position: 'top'
      });
      refreshMembers();
    },
    errorToast: '移除失败'
  });

  // 处理搜索
  const handleSearch = useCallback(
    debounce((value: string) => {
      setSearchText(value);
    }, 300),
    []
  );

  console.log('team', team);
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{'团队成员' + ' - ' + team.teamName}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex justifyContent="space-between" mb={4}>
            <InputGroup maxW="300px">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" />
              </InputLeftElement>
              <Input placeholder="搜索成员" onChange={(e) => handleSearch(e.target.value)} />
            </InputGroup>
            {team.permission.isOwner && (
              <Button
                leftIcon={<MyIcon name="common/addLight" w="16px" />}
                size="sm"
                onClick={onInviteModalOpen}
              >
                邀请成员
              </Button>
            )}
          </Flex>

          <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
            <Table variant="simple">
              <Thead>
                <Tr>
                  <Th>成员名称</Th>
                  <Th>角色</Th>
                  <Th>状态</Th>
                  {team.permission.isOwner && <Th>操作</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {loadingMembers ? (
                  <Tr>
                    <Td colSpan={team.permission.isOwner ? 4 : 3} textAlign="center" py={4}>
                      <Flex justify="center" align="center">
                        <Spinner size="sm" color="primary.500" mr={2} />
                        <Text>加载中...</Text>
                      </Flex>
                    </Td>
                  </Tr>
                ) : filteredMembers.length === 0 ? (
                  <Tr>
                    <Td colSpan={team.permission.isOwner ? 4 : 3} textAlign="center" py={4}>
                      <Text>暂无成员</Text>
                    </Td>
                  </Tr>
                ) : (
                  filteredMembers.map((member) => (
                    <Tr key={member.tmbId}>
                      <Td>
                        <Flex alignItems="center">
                          <Avatar size="sm" name={member.memberName} src={member.avatar} mr={2} />
                          <Text>{member.memberName}</Text>
                        </Flex>
                      </Td>
                      <Td>{member.role}</Td>
                      <Td>{member.status}</Td>
                      {team.permission.isOwner && (
                        <Td>
                          {member.role !== 'owner' && (
                            <IconButton
                              aria-label="Remove Member"
                              icon={<MyIcon name="delete" w="16px" />}
                              size="sm"
                              variant="ghost"
                              colorScheme="red"
                              isLoading={isRemoving}
                              onClick={openConfirm(() => removeMember(member.tmbId))}
                            />
                          )}
                        </Td>
                      )}
                    </Tr>
                  ))
                )}
              </Tbody>
            </Table>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button onClick={onClose} variant="outline">
            关闭
          </Button>
        </ModalFooter>
        <ConfirmModal />

        {/* 邀请成员模态框 */}
        {isInviteModalOpen && (
          <InviteMemberModal
            isOpen={isInviteModalOpen}
            onClose={() => {
              onInviteModalClose();
              refreshMembers();
            }}
            teamId={team.teamId}
          />
        )}
      </ModalContent>
    </Modal>
  );
};

export default TeamMembersModal;
