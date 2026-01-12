import React, { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  InputGroup,
  InputLeftElement,
  Select,
  Table,
  TableContainer,
  Tag,
  Tbody,
  Td,
  Th,
  Thead,
  Tr
} from '@chakra-ui/react';
import PageContainer from '@/components/PageContainer';
import { useUserStore } from '@/web/support/user/useUserStore';
import { usePagination } from '@fastgpt/web/hooks/usePagination';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import MyIcon from '@fastgpt/web/components/common/Icon';
import dayjs from 'dayjs';
import { adminDeleteUser, AdminUserListItem, getAdminUserList } from '@/web/support/user/admin/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import CreateUserModal from './components/CreateUserModal';
import EditUserModal from './components/EditUserModal';
import UpdateUserPasswordModal from './components/UpdateUserPasswordModal';
import { serviceSideProps } from '@/web/common/utils/i18n';
import { UserStatusEnum } from '@fastgpt/global/support/user/constant';

const UsersManage = () => {
  const { userInfo } = useUserStore();
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState<`${UserStatusEnum}` | ''>('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUserListItem | null>(null);
  const [pwdUser, setPwdUser] = useState<AdminUserListItem | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string>('');

  const statusMap = useMemo<Record<`${UserStatusEnum}`, { label: string; colorScheme: string }>>(
    () => ({
      active: { label: '启用', colorScheme: 'green' },
      forbidden: { label: '停用', colorScheme: 'gray' }
    }),
    []
  );

  const { data, total, pageSize, isLoading, Pagination, getData } =
    usePagination<AdminUserListItem>({
      api: getAdminUserList,
      pageSize: 30,
      params: {
        keyword,
        status
      },
      refreshDeps: [keyword, status]
    });

  const { openConfirm, ConfirmModal } = useConfirm({
    content: '确认删除？'
  });

  const { mutate: onDelete, isLoading: deleting } = useRequest({
    mutationFn: (userId: string) => adminDeleteUser({ userId }),
    onSuccess() {
      setDeletingUserId('');
      getData(1);
    },
    successToast: '删除成功',
    errorToast: '删除失败'
  });

  if (userInfo && userInfo.username !== 'root') {
    return (
      <PageContainer>
        <Flex alignItems={'center'} justifyContent={'center'} h={'100%'} color={'myGray.600'}>
          无权限访问
        </Flex>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <Flex flexDirection={'column'} py={[0, 5]} px={5} h={'100%'} position={'relative'}>
        <Flex
          alignItems={['stretch', 'center']}
          justifyContent={'space-between'}
          flexDirection={['column', 'row']}
          gap={[3, 0]}
        >
          <Button alignSelf={['flex-start', 'auto']} onClick={() => setCreateOpen(true)}>
            新增用户
          </Button>

          <HStack spacing={3} justifyContent={'flex-end'}>
            <Select
              w={['100%', '120px']}
              value={status}
              onChange={(e) => setStatus(e.target.value as `${UserStatusEnum}` | '')}
            >
              <option value="">全部状态</option>
              <option value={UserStatusEnum.active}>启用</option>
              <option value={UserStatusEnum.forbidden}>停用</option>
            </Select>

            <InputGroup w={['100%', '320px']}>
              <InputLeftElement>
                <MyIcon name={'common/searchLight'} w={'16px'} />
              </InputLeftElement>
              <Input
                placeholder="输入用户名搜索"
                value={keywordInput}
                onChange={(e) => setKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  setKeyword(keywordInput.trim());
                }}
              />
            </InputGroup>

            <Button
              variant={'whiteBase'}
              onClick={() => setKeyword(keywordInput.trim())}
              isLoading={isLoading}
            >
              搜索
            </Button>
          </HStack>
        </Flex>

        <Box mt={4} pb={6}>
          <TableContainer bg={'white'} borderRadius={'md'} overflow={'hidden'}>
            <Table>
              <Thead>
                <Tr>
                  <Th>用户名</Th>
                  <Th>当前团队</Th>
                  <Th>状态</Th>
                  <Th>最后登录</Th>
                  <Th>更新时间</Th>
                  <Th textAlign={'right'}>操作</Th>
                </Tr>
              </Thead>
              <Tbody fontSize={'sm'}>
                {data.map((item) => {
                  const statusInfo = statusMap[item.status];
                  const isRoot = item.username === 'root';
                  return (
                    <Tr key={item._id}>
                      <Td>
                        <HStack spacing={2}>
                          <Avatar size={'sm'} src={item.avatar} name={item.username} />
                          <Box>{item.username}</Box>
                        </HStack>
                      </Td>
                      <Td>{item.currentTeam?.teamName || '-'}</Td>
                      <Td>
                        <Tag colorScheme={statusInfo?.colorScheme}>{statusInfo?.label}</Tag>
                      </Td>
                      <Td>
                        {item.lastLoginTime
                          ? dayjs(item.lastLoginTime).format('YYYY/MM/DD HH:mm')
                          : '-'}
                      </Td>
                      <Td>
                        {item.createTime ? dayjs(item.createTime).format('YYYY/MM/DD HH:mm') : '-'}
                      </Td>
                      <Td textAlign={'right'}>
                        <HStack spacing={2} justifyContent={'flex-end'}>
                          <Button
                            size={'sm'}
                            variant={'whiteBase'}
                            onClick={() => setEditUser(item)}
                            isDisabled={isRoot}
                          >
                            编辑
                          </Button>
                          <Button
                            size={'sm'}
                            variant={'whitePrimary'}
                            onClick={() => setPwdUser(item)}
                            isDisabled={isRoot}
                          >
                            改密码
                          </Button>
                          <Button
                            size={'sm'}
                            variant={'dangerFill'}
                            onClick={() => {
                              setDeletingUserId(item._id);
                              openConfirm(
                                () => onDelete(item._id),
                                () => setDeletingUserId(''),
                                `确认删除用户：${item.username}？（删除后将无法登录）`
                              )();
                            }}
                            isDisabled={isRoot}
                            isLoading={deleting && deletingUserId === item._id}
                          >
                            删除
                          </Button>
                        </HStack>
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>

          {total > pageSize && (
            <Flex mt={4} justifyContent={'flex-end'}>
              <Pagination />
            </Flex>
          )}
        </Box>

        <ConfirmModal />
        {createOpen && (
          <CreateUserModal onClose={() => setCreateOpen(false)} onSuccess={() => getData(1)} />
        )}
        {editUser && (
          <EditUserModal
            user={editUser}
            onClose={() => setEditUser(null)}
            onSuccess={() => getData(1)}
          />
        )}
        {pwdUser && (
          <UpdateUserPasswordModal
            user={pwdUser}
            onClose={() => setPwdUser(null)}
            onSuccess={() => {}}
          />
        )}
      </Flex>
    </PageContainer>
  );
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['user']))
    }
  };
}

export default UsersManage;
