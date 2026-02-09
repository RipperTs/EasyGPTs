import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import {
  createGlobalVariableGroup,
  deleteGlobalVariableCollaborators,
  deleteGlobalVariableGroup,
  getGlobalVariableGroupCollaboratorList,
  getGlobalVariableGroupList,
  updateGlobalVariableGroup,
  updateGlobalVariableGroupCollaborators
} from '@/web/support/globalVariable/api';
import ConfigPerModal from '@/components/support/permission/ConfigPerModal';
import {
  GlobalVariableDefaultPermissionVal,
  GlobalVariablePermissionList
} from '@fastgpt/global/support/permission/globalVariable/constant';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import PermissionIconText from '@/components/support/permission/IconText';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';

type VariableEditStateType = {
  index: number | null;
  key: string;
  value: string;
};

type GroupEditStateType = {
  mode: 'create' | 'edit';
  name: string;
  groupKey: string;
};

const GlobalVariableConfig = () => {
  const { toast } = useToast();

  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [variableEditState, setVariableEditState] = useState<VariableEditStateType | null>(null);
  const [groupEditState, setGroupEditState] = useState<GroupEditStateType | null>(null);

  const {
    data: groups = [],
    loading: isLoadingGroups,
    runAsync: refetchGroups
  } = useRequest2(getGlobalVariableGroupList, {
    manual: false
  });

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId('');
      return;
    }
    if (!groups.some((item) => String(item._id) === selectedGroupId)) {
      setSelectedGroupId(String(groups[0]._id));
    }
  }, [groups, selectedGroupId]);

  const selectedGroup = useMemo(
    () => groups.find((item) => String(item._id) === selectedGroupId),
    [groups, selectedGroupId]
  );

  const canWrite = !!selectedGroup?.permission?.hasWritePer;
  const canManage = !!selectedGroup?.permission?.hasManagePer;
  const variables = selectedGroup?.variables || [];

  const { runAsync: onCreateGroup, loading: isCreatingGroup } = useRequest2(
    createGlobalVariableGroup,
    {
      manual: true,
      successToast: '创建分组成功'
    }
  );
  const { runAsync: onUpdateGroup, loading: isUpdatingGroup } = useRequest2(
    updateGlobalVariableGroup,
    {
      manual: true,
      successToast: '更新成功'
    }
  );
  const { runAsync: onDeleteGroup, loading: isDeletingGroup } = useRequest2(
    deleteGlobalVariableGroup,
    {
      manual: true,
      successToast: '删除成功'
    }
  );

  const loadingAction = isCreatingGroup || isUpdatingGroup || isDeletingGroup;

  const { openConfirm: openDeleteGroupConfirm, ConfirmModal: DeleteGroupConfirmModal } = useConfirm(
    {
      type: 'delete',
      content: '确认删除该分组？删除后该分组下变量将一并删除。'
    }
  );
  const { openConfirm: openDeleteVariableConfirm, ConfirmModal: DeleteVariableConfirmModal } =
    useConfirm({
      type: 'delete',
      content: '确认删除该变量？'
    });

  const openCreateGroupModal = () => {
    setGroupEditState({
      mode: 'create',
      name: '',
      groupKey: ''
    });
  };

  const openEditGroupModal = () => {
    if (!selectedGroup || !canWrite) return;
    setGroupEditState({
      mode: 'edit',
      name: selectedGroup.name,
      groupKey: selectedGroup.groupKey
    });
  };

  const saveGroup = async () => {
    if (!groupEditState) return;

    const name = groupEditState.name.trim();
    const groupKey = groupEditState.groupKey.trim();
    if (!name) {
      toast({
        status: 'warning',
        title: '分组名称不能为空'
      });
      return;
    }
    if (!groupKey) {
      toast({
        status: 'warning',
        title: '分组标识不能为空'
      });
      return;
    }

    if (groupEditState.mode === 'create') {
      const created = await onCreateGroup({
        name,
        groupKey
      });
      await refetchGroups();
      setSelectedGroupId(String(created._id));
    } else if (selectedGroup) {
      await onUpdateGroup({
        groupId: String(selectedGroup._id),
        name,
        groupKey
      });
      await refetchGroups();
    }

    setGroupEditState(null);
  };

  const removeGroup = () => {
    if (!selectedGroup || !canManage) return;

    openDeleteGroupConfirm(async () => {
      await onDeleteGroup({
        groupId: String(selectedGroup._id)
      });
      await refetchGroups();
    })();
  };

  const openCreateVariableModal = () => {
    if (!selectedGroup || !canWrite) return;
    setVariableEditState({
      index: null,
      key: '',
      value: ''
    });
  };

  const openEditVariableModal = (index: number) => {
    if (!selectedGroup || !canWrite) return;
    const current = variables[index];
    if (!current) return;

    setVariableEditState({
      index,
      key: current.key,
      value: current.value
    });
  };

  const saveVariable = async () => {
    if (!selectedGroup || !canWrite || !variableEditState) return;

    const key = variableEditState.key.trim();
    if (!key) {
      toast({
        status: 'warning',
        title: '变量 key 不能为空'
      });
      return;
    }

    const duplicate = variables.some(
      (item, index) =>
        item.key === key && (variableEditState.index === null || index !== variableEditState.index)
    );
    if (duplicate) {
      toast({
        status: 'warning',
        title: '同一分组下变量 key 不能重复'
      });
      return;
    }

    const newVariables = [...variables];
    if (variableEditState.index === null) {
      newVariables.push({
        key,
        value: variableEditState.value
      });
    } else {
      newVariables[variableEditState.index] = {
        key,
        value: variableEditState.value
      };
    }

    await onUpdateGroup({
      groupId: String(selectedGroup._id),
      variables: newVariables
    });
    await refetchGroups();
    setVariableEditState(null);
  };

  const removeVariable = (index: number) => {
    if (!selectedGroup || !canWrite) return;

    openDeleteVariableConfirm(async () => {
      await onUpdateGroup({
        groupId: String(selectedGroup._id),
        variables: variables.filter((_, i) => i !== index)
      });
      await refetchGroups();
    })();
  };

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'} fontSize={'sm'}>
      <Flex
        px={[3, 8]}
        alignItems={['flex-start', 'center']}
        justifyContent={'space-between'}
        flexDirection={['column', 'row']}
        gap={2}
      >
        <Box fontSize={'sm'} fontWeight={'bold'}>
          系统全局变量
        </Box>
        <Button size={'sm'} onClick={openCreateGroupModal} isLoading={isCreatingGroup}>
          新建分组
        </Button>
      </Flex>

      <Flex px={[3, 8]} mt={3} gap={4} flex={'1 0 0'} h={0} overflow={'hidden'}>
        <Box w={['160px', '240px']} border={'base'} borderRadius={'md'} p={2} overflowY={'auto'}>
          {groups.map((group) => {
            const active = String(group._id) === selectedGroupId;
            return (
              <Box
                key={String(group._id)}
                px={3}
                py={2}
                mb={2}
                borderRadius={'md'}
                borderWidth={1}
                borderColor={active ? 'primary.600' : 'myGray.200'}
                bg={active ? 'primary.50' : 'transparent'}
                cursor={'pointer'}
                onClick={() => setSelectedGroupId(String(group._id))}
              >
                <Box fontSize={'xs'} fontWeight={'bold'} className="textEllipsis">
                  {group.name}
                </Box>
                <Box fontSize={'xs'} color={'myGray.500'} className="textEllipsis">
                  {group.groupKey}
                </Box>
              </Box>
            );
          })}
          {!isLoadingGroups && groups.length === 0 && <EmptyTip text={'暂无分组'} />}
        </Box>

        <Flex flexDirection={'column'} flex={'1 0 0'} minW={0}>
          {selectedGroup ? (
            <>
              <Flex
                justifyContent={'space-between'}
                alignItems={'center'}
                mb={2}
                gap={2}
                flexWrap={'wrap'}
              >
                <Flex alignItems={'center'} gap={2} minW={0}>
                  <Box fontSize={'sm'} fontWeight={'bold'} className="textEllipsis">
                    {selectedGroup.name}
                  </Box>
                  <Box fontSize={'xs'} color={'myGray.500'}>
                    ({selectedGroup.groupKey})
                  </Box>
                  <PermissionIconText defaultPermission={selectedGroup.defaultPermission} />
                </Flex>

                <Flex gap={2} flexWrap={'wrap'}>
                  {canManage && (
                    <Button
                      size={'sm'}
                      variant={'whitePrimary'}
                      onClick={() => setIsPermissionModalOpen(true)}
                      isDisabled={loadingAction}
                    >
                      权限配置
                    </Button>
                  )}
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    onClick={openEditGroupModal}
                    isDisabled={!canWrite || loadingAction}
                  >
                    编辑分组
                  </Button>
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    colorScheme="red"
                    onClick={removeGroup}
                    isDisabled={!canManage || loadingAction}
                  >
                    删除分组
                  </Button>
                  <Button
                    size={'sm'}
                    onClick={openCreateVariableModal}
                    isDisabled={!canWrite || loadingAction}
                  >
                    新增变量
                  </Button>
                </Flex>
              </Flex>

              <TableContainer
                border={'base'}
                borderRadius={'md'}
                flex={'1 0 0'}
                h={0}
                overflowY={'auto'}
              >
                <Table>
                  <Thead>
                    <Tr>
                      <Th>Key</Th>
                      <Th>Value</Th>
                      <Th w={'170px'}>操作</Th>
                    </Tr>
                  </Thead>
                  <Tbody fontSize={'xs'}>
                    {variables.map((item, index) => (
                      <Tr key={item.key}>
                        <Td>{item.key}</Td>
                        <Td whiteSpace={'pre-wrap'} wordBreak={'break-all'}>
                          {item.value}
                        </Td>
                        <Td>
                          <Button
                            size={'xs'}
                            mr={2}
                            variant={'ghost'}
                            onClick={() => openEditVariableModal(index)}
                            isDisabled={!canWrite || loadingAction}
                          >
                            编辑
                          </Button>
                          <Button
                            size={'xs'}
                            variant="ghost"
                            colorScheme="red"
                            onClick={() => removeVariable(index)}
                            isDisabled={!canWrite || loadingAction}
                          >
                            删除
                          </Button>
                        </Td>
                      </Tr>
                    ))}
                  </Tbody>
                </Table>
                {variables.length === 0 && <EmptyTip text={'该分组暂无变量'} />}
              </TableContainer>
            </>
          ) : (
            <EmptyTip text={'请先新建分组'} />
          )}
        </Flex>
      </Flex>

      {groupEditState && (
        <MyModal
          isOpen
          onClose={() => setGroupEditState(null)}
          title={groupEditState.mode === 'create' ? '新建分组' : '编辑分组'}
          iconSrc="/imgs/modal/key.svg"
        >
          <ModalBody>
            <Box fontSize={'sm'} color={'myGray.600'}>
              分组名称
            </Box>
            <Input
              size={'sm'}
              mt={1}
              value={groupEditState.name}
              placeholder="例如：开发环境"
              onChange={(e) =>
                setGroupEditState((state) => (state ? { ...state, name: e.target.value } : state))
              }
            />

            <Box mt={4} fontSize={'sm'} color={'myGray.600'}>
              分组标识（用于工作流引用前缀）
            </Box>
            <Input
              size={'sm'}
              mt={1}
              value={groupEditState.groupKey}
              placeholder="例如：dev"
              onChange={(e) =>
                setGroupEditState((state) =>
                  state ? { ...state, groupKey: e.target.value } : state
                )
              }
            />
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setGroupEditState(null)}>
              取消
            </Button>
            <Button ml={3} onClick={saveGroup} isLoading={isCreatingGroup || isUpdatingGroup}>
              保存
            </Button>
          </ModalFooter>
        </MyModal>
      )}

      {variableEditState && (
        <MyModal
          isOpen
          onClose={() => setVariableEditState(null)}
          title={variableEditState.index === null ? '新增变量' : '编辑变量'}
          iconSrc="/imgs/modal/key.svg"
        >
          <ModalBody>
            <Box fontSize={'sm'} color={'myGray.600'}>
              变量 Key
            </Box>
            <Input
              size={'sm'}
              mt={1}
              value={variableEditState.key}
              placeholder="例如：API_BASE_URL"
              onChange={(e) =>
                setVariableEditState((state) => (state ? { ...state, key: e.target.value } : state))
              }
            />

            <Box mt={4} fontSize={'sm'} color={'myGray.600'}>
              变量 Value
            </Box>
            <Input
              size={'sm'}
              mt={1}
              value={variableEditState.value}
              placeholder="请输入字符串值"
              onChange={(e) =>
                setVariableEditState((state) =>
                  state ? { ...state, value: e.target.value } : state
                )
              }
            />
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setVariableEditState(null)}>
              取消
            </Button>
            <Button ml={3} onClick={saveVariable} isLoading={isUpdatingGroup}>
              保存
            </Button>
          </ModalFooter>
        </MyModal>
      )}

      {isPermissionModalOpen && selectedGroup && (
        <ConfigPerModal
          avatar={'/icon/logo.svg'}
          name={`全局变量分组：${selectedGroup.name}`}
          isInheritPermission={true}
          refetchResource={refetchGroups}
          defaultPer={{
            value: selectedGroup.defaultPermission,
            defaultValue: GlobalVariableDefaultPermissionVal,
            onChange: async (permission) => {
              await onUpdateGroup({
                groupId: String(selectedGroup._id),
                defaultPermission: permission
              });
              await refetchGroups();
            }
          }}
          managePer={{
            permission: selectedGroup.permission,
            onGetCollaboratorList: () =>
              getGlobalVariableGroupCollaboratorList(String(selectedGroup._id)),
            permissionList: GlobalVariablePermissionList,
            onUpdateCollaborators: ({ tmbIds, permission }) =>
              updateGlobalVariableGroupCollaborators({
                groupId: String(selectedGroup._id),
                tmbIds,
                permission
              }),
            onDelOneCollaborator: (tmbId: string) =>
              deleteGlobalVariableCollaborators({
                groupId: String(selectedGroup._id),
                tmbId
              }),
            refreshDeps: [selectedGroup._id]
          }}
          onClose={() => setIsPermissionModalOpen(false)}
        />
      )}
      <DeleteGroupConfirmModal />
      <DeleteVariableConfirmModal />
    </Flex>
  );
};

export default React.memo(GlobalVariableConfig);
