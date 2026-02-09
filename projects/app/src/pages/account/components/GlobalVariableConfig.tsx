import React, { useMemo, useState } from 'react';
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
  deleteGlobalVariableCollaborators,
  getGlobalVariableCollaboratorList,
  getGlobalVariableDetail,
  updateGlobalVariable,
  updateGlobalVariableCollaborators
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

type EditStateType = {
  index: number | null;
  key: string;
  value: string;
};

const GlobalVariableConfig = () => {
  const { toast } = useToast();

  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [editState, setEditState] = useState<EditStateType | null>(null);

  const {
    data: detail,
    error,
    loading: isLoading,
    runAsync: refetchDetail
  } = useRequest2(getGlobalVariableDetail, {
    manual: false
  });

  const { runAsync: updateDetail, loading: isSaving } = useRequest2(updateGlobalVariable, {
    manual: true,
    successToast: '更新成功'
  });

  const variables = detail?.variables || [];
  const canWrite = !!detail?.permission?.hasWritePer;
  const canManage = !!detail?.permission?.hasManagePer;

  const { openConfirm, ConfirmModal } = useConfirm({
    type: 'delete',
    content: '确认删除该变量？'
  });

  const saving = useMemo(() => isSaving || isLoading, [isLoading, isSaving]);

  const onOpenCreateModal = () => {
    if (!canWrite) return;
    setEditState({
      index: null,
      key: '',
      value: ''
    });
  };

  const onOpenEditModal = (index: number) => {
    if (!canWrite) return;
    const current = variables[index];
    if (!current) return;

    setEditState({
      index,
      key: current.key,
      value: current.value
    });
  };

  const onSaveVariable = async () => {
    if (!canWrite || !detail || !editState) return;

    const key = editState.key.trim();
    if (!key) {
      toast({
        status: 'warning',
        title: '变量 key 不能为空'
      });
      return;
    }

    const duplicate = variables.some(
      (item, index) => item.key === key && (editState.index === null || index !== editState.index)
    );
    if (duplicate) {
      toast({
        status: 'warning',
        title: '变量 key 不能重复'
      });
      return;
    }

    const newVariables = [...variables];
    if (editState.index === null) {
      newVariables.push({
        key,
        value: editState.value
      });
    } else {
      newVariables[editState.index] = {
        key,
        value: editState.value
      };
    }

    await updateDetail({
      variables: newVariables
    });
    await refetchDetail();
    setEditState(null);
  };

  const onDeleteVariable = (index: number) => {
    if (!canWrite || !detail) return;

    openConfirm(async () => {
      const newVariables = detail.variables.filter((_, i) => i !== index);
      await updateDetail({
        variables: newVariables
      });
      await refetchDetail();
    })();
  };

  return (
    <Flex flexDirection={'column'} py={[0, 5]} h={'100%'}>
      <Flex
        px={[3, 8]}
        alignItems={['flex-start', 'center']}
        justifyContent={'space-between'}
        flexDirection={['column', 'row']}
        gap={2}
      >
        <Flex alignItems={'center'} gap={3}>
          <Box fontSize={'md'} fontWeight={'bold'}>
            团队全局变量
          </Box>
          {detail && <PermissionIconText defaultPermission={detail.defaultPermission} />}
        </Flex>

        <Flex gap={2}>
          {canManage && (
            <Button
              size={'sm'}
              variant={'whitePrimary'}
              onClick={() => setIsPermissionModalOpen(true)}
              isDisabled={saving}
            >
              权限配置
            </Button>
          )}
          <Button
            size={'sm'}
            onClick={onOpenCreateModal}
            isDisabled={!canWrite || saving}
            isLoading={isSaving}
          >
            新增变量
          </Button>
        </Flex>
      </Flex>

      <TableContainer mt={3} px={[3, 8]} flex={'1 0 0'} h={0} overflowY={'auto'}>
        <Table>
          <Thead>
            <Tr>
              <Th>Key</Th>
              <Th>Value</Th>
              <Th w={'170px'}>操作</Th>
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {variables.map((item, index) => (
              <Tr key={item.key}>
                <Td>{item.key}</Td>
                <Td whiteSpace={'pre-wrap'} wordBreak={'break-all'}>
                  {item.value}
                </Td>
                <Td>
                  <Button
                    size={'sm'}
                    mr={2}
                    variant={'whitePrimary'}
                    onClick={() => onOpenEditModal(index)}
                    isDisabled={!canWrite || saving}
                  >
                    编辑
                  </Button>
                  <Button
                    size={'sm'}
                    variant={'whitePrimary'}
                    colorScheme="red"
                    onClick={() => onDeleteVariable(index)}
                    isDisabled={!canWrite || saving}
                  >
                    删除
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>

        {!isLoading && detail && variables.length === 0 && <EmptyTip text={'暂无全局变量'} />}
        {!isLoading && !detail && !!error && <EmptyTip text={'无权限访问全局变量'} />}
      </TableContainer>

      {editState && (
        <MyModal
          isOpen
          onClose={() => setEditState(null)}
          title={editState.index === null ? '新增全局变量' : '编辑全局变量'}
          iconSrc="/imgs/modal/key.svg"
        >
          <ModalBody>
            <Box fontSize={'sm'} color={'myGray.600'}>
              变量 Key
            </Box>
            <Input
              mt={1}
              value={editState.key}
              placeholder="例如: API_BASE_URL"
              onChange={(e) =>
                setEditState((state) => (state ? { ...state, key: e.target.value } : state))
              }
            />

            <Box mt={4} fontSize={'sm'} color={'myGray.600'}>
              变量 Value
            </Box>
            <Input
              mt={1}
              value={editState.value}
              placeholder="请输入字符串值"
              onChange={(e) =>
                setEditState((state) => (state ? { ...state, value: e.target.value } : state))
              }
            />
          </ModalBody>
          <ModalFooter>
            <Button variant={'whiteBase'} onClick={() => setEditState(null)}>
              取消
            </Button>
            <Button ml={3} onClick={onSaveVariable} isLoading={isSaving}>
              保存
            </Button>
          </ModalFooter>
        </MyModal>
      )}

      {isPermissionModalOpen && detail && (
        <ConfigPerModal
          avatar={'/icon/logo.svg'}
          name={'团队全局变量'}
          isInheritPermission={true}
          refetchResource={refetchDetail}
          defaultPer={{
            value: detail.defaultPermission,
            defaultValue: GlobalVariableDefaultPermissionVal,
            onChange: async (permission) => {
              await updateDetail({
                defaultPermission: permission
              });
              await refetchDetail();
            }
          }}
          managePer={{
            permission: detail.permission,
            onGetCollaboratorList: getGlobalVariableCollaboratorList,
            permissionList: GlobalVariablePermissionList,
            onUpdateCollaborators: updateGlobalVariableCollaborators,
            onDelOneCollaborator: (tmbId: string) =>
              deleteGlobalVariableCollaborators({
                tmbId
              }),
            refreshDeps: [detail._id]
          }}
          onClose={() => setIsPermissionModalOpen(false)}
        />
      )}
      <ConfirmModal />
    </Flex>
  );
};

export default React.memo(GlobalVariableConfig);
