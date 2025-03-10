import React, { useState, useCallback } from 'react';
import {
  Box,
  Flex,
  Button,
  Heading,
  Text,
  useDisclosure,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  useToast,
  Avatar,
  Tag,
  HStack
} from '@chakra-ui/react';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useRequest, useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getTeamList, delDeleteTeam, putSwitchTeam } from '@/web/support/user/team/api';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dynamic from 'next/dynamic';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import { TeamTmbItemType } from '@fastgpt/global/support/user/team/type.d';
import { setToken } from '@/web/support/user/auth';

const CreateTeamModal = dynamic(() => import('./CreateTeamModal'));
const EditTeamModal = dynamic(() => import('./EditTeamModal'));
const TeamMembersModal = dynamic(() => import('./TeamMembersModal'));

const TeamManagement = () => {
  const toast = useToast();
  const { userInfo, initUserInfo } = useUserStore();

  // 创建团队模态框
  const {
    isOpen: isCreateTeamModalOpen,
    onOpen: onCreateTeamModalOpen,
    onClose: onCreateTeamModalClose
  } = useDisclosure();

  // 编辑团队模态框
  const [editingTeam, setEditingTeam] = useState<TeamTmbItemType | null>(null);
  const {
    isOpen: isEditTeamModalOpen,
    onOpen: onEditTeamModalOpen,
    onClose: onEditTeamModalClose
  } = useDisclosure();

  // 团队成员模态框
  const [selectedTeam, setSelectedTeam] = useState<TeamTmbItemType | null>(null);
  const {
    isOpen: isTeamMembersModalOpen,
    onOpen: onTeamMembersModalOpen,
    onClose: onTeamMembersModalClose
  } = useDisclosure();

  // 删除团队确认
  const { openConfirm: openDeleteConfirm, ConfirmModal: DeleteConfirmModal } = useConfirm({
    title: '确认删除',
    type: 'delete'
  });

  // 获取团队列表
  const {
    data: teamList = [],
    loading: loadingTeams,
    refresh: refreshTeams
  } = useRequest2(() => getTeamList(TeamMemberStatusEnum.active), {
    refreshDeps: [userInfo?.team?.teamId],
    manual: false
  });

  // 编辑团队
  const handleEditTeam = useCallback(
    (team: TeamTmbItemType) => {
      setEditingTeam(team);
      onEditTeamModalOpen();
    },
    [onEditTeamModalOpen]
  );

  // 删除团队
  const handleDeleteTeam = useCallback(
    (team: TeamTmbItemType) => {
      console.log('删除团队', team);

      const onOpen = openDeleteConfirm(
        () => {
          console.log('确认删除团队', team.teamId);

          return new Promise((resolve, reject) => {
            delDeleteTeam(team.teamId)
              .then((res) => {
                console.log('删除团队成功', res);
                toast({
                  title: '删除成功',
                  status: 'success',
                  position: 'top'
                });
                refreshTeams();
                resolve(true);
              })
              .catch((err) => {
                console.error('删除团队失败', err);
                toast({
                  title: '删除失败',
                  description: err.message || '未知错误',
                  status: 'error',
                  position: 'top'
                });
                reject(err);
              });
          });
        },
        undefined,
        `确定要删除团队 "${team.teamName}" 吗？此操作不可恢复。`
      );

      onOpen();
    },
    [toast, refreshTeams, openDeleteConfirm]
  );

  // 查看团队成员
  const handleViewTeamMembers = useCallback(
    (team: TeamTmbItemType) => {
      setSelectedTeam(team);
      onTeamMembersModalOpen();
    },
    [onTeamMembersModalOpen]
  );

  // 切换团队
  const { mutate: switchTeam, isLoading: isSwitchingTeam } = useRequest({
    mutationFn: async (teamId: string) => {
      // 调用切换团队API
      const token = await putSwitchTeam(teamId);

      // 设置新token
      setToken(token);

      // 刷新用户信息
      await initUserInfo();

      toast({
        title: '切换团队成功',
        status: 'success',
        position: 'top'
      });
    },
    errorToast: '切换团队失败'
  });

  return (
    <Box p={5}>
      <Flex justifyContent="space-between" alignItems="center" mb={6}>
        <Heading size="md">团队管理</Heading>
        <Button
          size="sm"
          onClick={onCreateTeamModalOpen}
          colorScheme="primary"
          leftIcon={<MyIcon name="common/addLight" w="14px" />}
        >
          创建团队
        </Button>
      </Flex>

      <Box borderWidth="1px" borderRadius="lg" overflow="hidden">
        <Table variant="simple">
          <Thead>
            <Tr>
              <Th>团队名称</Th>
              <Th>角色</Th>
              <Th>状态</Th>
              <Th>操作</Th>
            </Tr>
          </Thead>
          <Tbody>
            {teamList.map((team) => (
              <Tr key={team.teamId}>
                <Td>
                  <Flex alignItems="center">
                    <Avatar src={team.avatar} size="sm" mr={2} />
                    <Text fontWeight="medium">{team.teamName}</Text>
                    {team.teamId === userInfo?.team?.teamId && (
                      <Tag size="sm" colorScheme="green" ml={2}>
                        当前
                      </Tag>
                    )}
                  </Flex>
                </Td>
                <Td>{team.role}</Td>
                <Td>{team.status}</Td>
                <Td>
                  <HStack spacing={2}>
                    {team.teamId !== userInfo?.team?.teamId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        isLoading={isSwitchingTeam}
                        onClick={() => switchTeam(team.teamId)}
                        leftIcon={<MyIcon name="change" w="14px" />}
                      >
                        切换
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewTeamMembers(team)}
                      leftIcon={<MyIcon name="support/team/memberLight" w="14px" />}
                    >
                      成员
                    </Button>
                    {team.role === 'owner' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditTeam(team)}
                        leftIcon={<MyIcon name="edit" w="14px" />}
                      >
                        编辑
                      </Button>
                    )}
                    {team.role === 'owner' && team.teamId !== userInfo?.team?.teamId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={() => handleDeleteTeam(team)}
                        leftIcon={<MyIcon name="common/trash" w="14px" />}
                      >
                        删除
                      </Button>
                    )}
                  </HStack>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Box>

      {/* 创建团队模态框 */}
      {isCreateTeamModalOpen && (
        <CreateTeamModal
          isOpen={isCreateTeamModalOpen}
          onClose={() => {
            onCreateTeamModalClose();
            refreshTeams();
          }}
        />
      )}

      {/* 编辑团队模态框 */}
      {isEditTeamModalOpen && editingTeam && (
        <EditTeamModal
          isOpen={isEditTeamModalOpen}
          onClose={() => {
            onEditTeamModalClose();
            setEditingTeam(null);
            refreshTeams();
          }}
          team={editingTeam}
        />
      )}

      {/* 团队成员模态框 */}
      {isTeamMembersModalOpen && selectedTeam && (
        <TeamMembersModal
          isOpen={isTeamMembersModalOpen}
          onClose={() => {
            onTeamMembersModalClose();
            setSelectedTeam(null);
            refreshTeams();
          }}
          team={selectedTeam}
        />
      )}

      {/* 删除团队确认对话框 */}
      <DeleteConfirmModal closeText="取消" confirmText="删除" />
    </Box>
  );
};

export default TeamManagement;
