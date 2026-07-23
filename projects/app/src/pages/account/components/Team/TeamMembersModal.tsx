import React, { useState } from 'react';
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
  Select,
  useDisclosure,
  Spinner
} from '@chakra-ui/react';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  delRemoveMember,
  getTeamMembers,
  updateMemberPermission
} from '@/web/support/user/team/api';
import type { TeamTmbItemType } from '@fastgpt/global/support/user/team/type';
import type { PermissionValueType } from '@fastgpt/global/support/permission/type';
import {
  ManagePermissionVal,
  ReadPermissionVal,
  WritePermissionVal
} from '@fastgpt/global/support/permission/constant';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';

const InviteMemberModal = dynamic(
  () => import('@/components/support/user/team/TeamManageModal/components/InviteModal')
);

type TeamMembersModalProps = {
  isOpen: boolean;
  onClose: () => void;
  team: TeamTmbItemType;
};

const TeamMembersModal = ({ isOpen, onClose, team }: TeamMembersModalProps) => {
  const toast = useToast();
  const [searchText, setSearchText] = useState('');
  const {
    isOpen: isInviteModalOpen,
    onOpen: onInviteModalOpen,
    onClose: onInviteModalClose
  } = useDisclosure();

  const {
    data: members = [],
    loading: loadingMembers,
    refresh: refreshMembers
  } = useRequest2(() => getTeamMembers(team.teamId), {
    refreshDeps: [team.teamId],
    manual: false
  });
  const filteredMembers = members.filter(
    (member) =>
      searchText === '' || member.memberName.toLowerCase().includes(searchText.toLowerCase())
  );

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确定要移除该成员吗？'
  });
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
  const { mutate: updatePermission, isLoading: isUpdatingPermission } = useRequest({
    mutationFn: ({ tmbId, permission }: { tmbId: string; permission: PermissionValueType }) =>
      updateMemberPermission({ tmbIds: [tmbId], permission }),
    onSuccess: refreshMembers,
    successToast: '权限修改成功',
    errorToast: '权限修改失败'
  });

  const showActions = team.permission.hasManagePer;
  const columnCount = showActions ? 5 : 4;

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="4xl">
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>{`团队成员 - ${team.teamName}`}</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <Flex justifyContent="space-between" mb={4}>
            <InputGroup maxW="300px">
              <InputLeftElement>
                <MyIcon name="common/searchLight" w="16px" />
              </InputLeftElement>
              <Input
                placeholder="搜索成员"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </InputGroup>
            {showActions && (
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
                  <Th>身份</Th>
                  <Th>权限</Th>
                  <Th>状态</Th>
                  {showActions && <Th>操作</Th>}
                </Tr>
              </Thead>
              <Tbody>
                {loadingMembers ? (
                  <Tr>
                    <Td colSpan={columnCount} textAlign="center" py={4}>
                      <Flex justify="center" align="center">
                        <Spinner size="sm" color="primary.500" mr={2} />
                        <Text>加载中...</Text>
                      </Flex>
                    </Td>
                  </Tr>
                ) : filteredMembers.length === 0 ? (
                  <Tr>
                    <Td colSpan={columnCount} textAlign="center" py={4}>
                      <Text>暂无成员</Text>
                    </Td>
                  </Tr>
                ) : (
                  filteredMembers.map((member) => {
                    const permissionValue = member.permission.hasManagePer
                      ? ManagePermissionVal
                      : member.permission.hasWritePer
                        ? WritePermissionVal
                        : ReadPermissionVal;
                    const permissionLabel = member.permission.hasManagePer
                      ? '管理'
                      : member.permission.hasWritePer
                        ? '可写'
                        : '只读';
                    const canRemoveMember =
                      showActions &&
                      !member.permission.isOwner &&
                      member.tmbId !== team.tmbId &&
                      (team.permission.isOwner || !member.permission.hasManagePer);
                    const canUpdatePermission =
                      canRemoveMember && member.status === TeamMemberStatusEnum.active;

                    return (
                      <Tr key={member.tmbId}>
                        <Td>
                          <Flex alignItems="center">
                            <Avatar size="sm" name={member.memberName} src={member.avatar} mr={2} />
                            <Text>{member.memberName}</Text>
                          </Flex>
                        </Td>
                        <Td>
                          {member.permission.isOwner
                            ? '所有者'
                            : member.permission.hasManagePer
                              ? '管理员'
                              : '成员'}
                        </Td>
                        <Td>
                          {canUpdatePermission ? (
                            <Select
                              size="sm"
                              w="120px"
                              value={permissionValue}
                              isDisabled={isUpdatingPermission}
                              onChange={(event) =>
                                updatePermission({
                                  tmbId: member.tmbId,
                                  permission: Number(event.target.value)
                                })
                              }
                            >
                              <option value={ReadPermissionVal}>只读</option>
                              <option value={WritePermissionVal}>可写</option>
                              {team.permission.isOwner && (
                                <option value={ManagePermissionVal}>管理</option>
                              )}
                            </Select>
                          ) : (
                            <Text>{member.permission.isOwner ? '全部权限' : permissionLabel}</Text>
                          )}
                        </Td>
                        <Td>{member.status}</Td>
                        {showActions && (
                          <Td>
                            {canRemoveMember && (
                              <IconButton
                                aria-label="移除成员"
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
                    );
                  })
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

        {isInviteModalOpen && (
          <InviteMemberModal
            teamId={team.teamId}
            operatorPermission={team.permission}
            onSuccess={refreshMembers}
            onClose={onInviteModalClose}
          />
        )}
      </ModalContent>
    </Modal>
  );
};

export default TeamMembersModal;
