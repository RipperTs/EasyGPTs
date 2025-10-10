import {
  Box,
  Button,
  Flex,
  HStack,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import { serviceSideProps } from '@/web/common/utils/i18n';
import ToolkitSideMenu from './components/SideMenu';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { useMemo, useState } from 'react';
import MyBox from '@fastgpt/web/components/common/MyBox';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import PopoverConfirm from '@fastgpt/web/components/common/MyPopover/PopoverConfirm';
import { deleteMcpServer, getMcpServerList } from '@/web/support/mcp/api';
import type { McpKeyType } from '@fastgpt/global/support/mcp/type';
import { useUserStore } from '@/web/support/user/useUserStore';
import UsageModal from './components/mcp/UsageModal';
import EditMcpModal, { defaultForm, type EditMcpForm } from './components/mcp/EditModal';

const MCPPage = () => {
  const { isPc } = useSystem();
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, { manual: false });
  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, { manual: false });

  // MCP页不默认选中任何分组/类型，避免与“MCP服务”同时高亮
  const { group: selectedGroup, type: selectedType } = router.query as any;

  // 侧边栏分组与类型由 ToolkitSideMenu 渲染，这里无需使用

  // 数据
  const {
    data: mcpList = [],
    loading: loadingList,
    refresh: reload
  } = useRequest2(getMcpServerList, { manual: false });
  const [usageMcp, setUsageMcp] = useState<McpKeyType | undefined>();
  const [editMcp, setEditMcp] = useState<EditMcpForm | undefined>();
  const { userInfo } = useUserStore();

  const { runAsync: onDeleteMcpServer } = useRequest2(deleteMcpServer, {
    manual: true,
    onSuccess: () => reload()
  });

  const isLoading = loadingList;

  return (
    <Flex flexDirection={'column'} h={'100%'} overflow={'auto'}>
      <ToolkitSideMenu
        isPc={isPc}
        isOpen={isOpen}
        onClose={onClose}
        pluginGroups={pluginGroups}
        selectedGroup={selectedGroup as any}
        selectedType={selectedType as any}
        onSelectGroupType={(groupId, typeId) =>
          router.push({ pathname: '/toolkit', query: { group: groupId, type: typeId } })
        }
        onClickMcp={() => router.push('/toolkit/mcp')}
        activeMcp
      />

      <Box ml={[0, '200px']} p={[5, 6]}>
        <MyBox isLoading={isLoading} h={'100%'} p={0}>
          <Flex alignItems={'flex-end'} justifyContent={'space-between'} px={4} pt={4}>
            <Box>
              <Box fontSize={'lg'} color={'myGray.900'} fontWeight={500}>
                MCP 服务
              </Box>
              <Box fontSize={'xs'} color={'myGray.500'}>
                允许你选择部分工具插件，以 MCP 的协议对外提供使用。但由于 MCP
                协议的不成熟，该功能仍处于测试阶段。
              </Box>
            </Box>
            <Button
              isDisabled={!userInfo?.team?.permission.hasWritePer}
              onClick={() => setEditMcp(defaultForm)}
            >
              创建服务
            </Button>
          </Flex>

          <TableContainer mt={4} bg={'white'} borderRadius={'md'}>
            <Table>
              <Thead>
                <Tr borderBottom={'base'}>
                  <Th bg={'white'}>名称</Th>
                  <Th bg={'white'}>关联工具数量</Th>
                  <Th bg={'white'}>操作</Th>
                </Tr>
              </Thead>
              <Tbody fontSize={'sm'}>
                {mcpList.map((mcp: McpKeyType) => (
                  <Tr key={mcp._id} fontWeight={500} fontSize={'sm'} color={'myGray.900'}>
                    <Td>{mcp.name}</Td>
                    <Td>{mcp.apps.length}</Td>
                    <Td>
                      <HStack>
                        <Button
                          mr={4}
                          variant={'whiteBase'}
                          size={'sm'}
                          onClick={() => setUsageMcp(mcp)}
                        >
                          开始使用
                        </Button>
                        <MyIconButton
                          icon="edit"
                          onClick={() =>
                            setEditMcp({ id: mcp._id, name: mcp.name, apps: mcp.apps as any })
                          }
                        />
                        <PopoverConfirm
                          Trigger={
                            <Box>
                              <MyIconButton icon="delete" hoverBg="red.50" hoverColor={'red.600'} />
                            </Box>
                          }
                          type="delete"
                          content={'删除后不可恢复，确认删除该 MCP 服务？'}
                          onConfirm={() => onDeleteMcpServer(mcp._id)}
                        />
                      </HStack>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
            {mcpList.length === 0 && <EmptyTip />}
          </TableContainer>
        </MyBox>

        {!!usageMcp && <UsageModal mcp={usageMcp} onClose={() => setUsageMcp(undefined)} />}
        {!!editMcp && (
          <EditMcpModal
            editMcp={editMcp}
            onClose={() => setEditMcp(undefined)}
            onSuccess={() => {
              setEditMcp(undefined);
              reload();
            }}
          />
        )}
      </Box>
    </Flex>
  );
};

export default MCPPage;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['app', 'user'])) }
  };
}
