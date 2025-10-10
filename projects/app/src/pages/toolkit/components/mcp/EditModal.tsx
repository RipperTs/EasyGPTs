import React from 'react';
import {
  Box,
  Button,
  Flex,
  Grid,
  HStack,
  Input,
  ModalBody,
  ModalFooter,
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useFieldArray, useForm } from 'react-hook-form';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import SearchInput from '@fastgpt/web/components/common/Input/SearchInput';
import Path from '@/components/common/folder/Path';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getMyApps } from '@/web/core/app/api';
import { type ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { AppFolderTypeList, AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { postCreateMcpServer, putUpdateMcpServer } from '@/web/support/mcp/api';

export type McpAppForm = {
  appId: string;
  toolName: string;
  appName?: string;
  description: string;
};

export type EditMcpForm = {
  id?: string;
  name: string;
  apps: McpAppForm[];
};

export const defaultForm: EditMcpForm = { name: '', apps: [] };

const SelectAppModal = ({
  selectedApps,
  onClose,
  onConfirm
}: {
  selectedApps: McpAppForm[];
  onClose: () => void;
  onConfirm: (e: McpAppForm[]) => void;
}) => {
  const [searchKey, setSearchKey] = React.useState('');
  const [parentId, setParentId] = React.useState<ParentIdType>('');
  const [selectedList, setSelectedList] = React.useState<McpAppForm[]>(selectedApps);

  const { data: apps = [], loading: loadingApps } = useRequest2(
    () =>
      getMyApps({
        searchKey,
        parentId,
        type: [AppTypeEnum.folder, AppTypeEnum.httpPlugin, AppTypeEnum.plugin]
      }),
    { manual: false, refreshDeps: [searchKey, parentId], throttleWait: 200 }
  );
  const { data: paths = [] } = useRequest2(() => getAppFolderPath(parentId), {
    manual: false,
    refreshDeps: [parentId]
  });

  const isLoading = loadingApps;

  return (
    <MyModal
      isOpen
      onClose={onClose}
      iconSrc={'modal/AddClb'}
      title={'选择应用'}
      minW="800px"
      maxW={'60vw'}
      h={'100%'}
      maxH={'90vh'}
      isCentered
      isLoading={isLoading}
    >
      <ModalBody flex={'1'}>
        <Grid
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="0.5rem"
          gridTemplateColumns="1fr 1fr"
          h={'100%'}
        >
          <Flex
            h={'100%'}
            flexDirection="column"
            borderRight="1px solid"
            borderColor="myGray.200"
            p="4"
          >
            <SearchInput
              placeholder={'搜索应用'}
              bgColor="myGray.50"
              onChange={(e) => setSearchKey(e.target.value)}
            />

            {paths.length > 0 && !searchKey && (
              <Box mt={3}>
                <Path paths={paths} hoverStyle={{ bg: 'myGray.200' }} onClick={setParentId} />
              </Box>
            )}

            <Box mt="3" overflow={'auto'} flex={'1 0 0'} h={0}>
              {apps.map((item: any) => {
                const selected = selectedList.some((app) => app.appId === item._id);
                const isFolder = AppFolderTypeList.includes(item.type);
                return (
                  <HStack
                    key={item._id}
                    py={2}
                    px={3}
                    borderRadius={'md'}
                    cursor={'pointer'}
                    _hover={{ bg: 'myGray.100' }}
                    onClick={() => {
                      if (isFolder) return setParentId(item._id);
                      if (selected) {
                        setSelectedList((s) => s.filter((app) => app.appId !== item._id));
                      } else {
                        setSelectedList((s) => [
                          ...s,
                          {
                            appId: item._id,
                            toolName: item.name,
                            appName: item.name,
                            description: item.intro || ''
                          }
                        ]);
                      }
                    }}
                  >
                    <Avatar src={item.avatar} w="1.5rem" borderRadius={'sm'} />
                    <Box ml="2" flex={'1 0 0'}>
                      {item.name}
                    </Box>
                  </HStack>
                );
              })}
            </Box>
          </Flex>

          <Flex h={'100%'} p="4" flexDirection="column">
            <Box>已选择：{selectedList.length}</Box>
            <Flex flexDirection="column" mt="2" gap={1} overflow={'auto'} flex={'1 0 0'} h={0}>
              {selectedList.map((item) => (
                <HStack
                  key={item.appId}
                  py={2}
                  px={3}
                  borderRadius={'md'}
                  _hover={{ bg: 'myGray.100' }}
                >
                  <Box flex={'1 0 0'}>{item.toolName}</Box>
                  <MyIconButton
                    icon="delete"
                    hoverColor={'red.600'}
                    onClick={() =>
                      setSelectedList((s) => s.filter((app) => app.appId !== item.appId))
                    }
                  />
                </HStack>
              ))}
            </Flex>
          </Flex>
        </Grid>
      </ModalBody>
      <ModalFooter>
        <Button ml="4" h={'32px'} onClick={() => onConfirm(selectedList)}>
          确认
        </Button>
      </ModalFooter>
    </MyModal>
  );
};

const EditMcpModal = ({
  editMcp,
  onClose,
  onSuccess
}: {
  editMcp: EditMcpForm;
  onClose: () => void;
  onSuccess: () => void;
}) => {
  const isEdit = !!editMcp.id;
  const { isOpen, onOpen, onClose: closeSelect } = useDisclosure();

  const { register, handleSubmit, control } = useForm<EditMcpForm>({ defaultValues: editMcp });
  const { fields: apps, replace, remove } = useFieldArray({ control, name: 'apps' });

  const { runAsync: createMcp, loading: loadingCreate } = useRequest2(
    (data: EditMcpForm) =>
      postCreateMcpServer({
        name: data.name,
        apps: data.apps.map((a) => ({
          appId: a.appId,
          toolName: a.toolName,
          appName: a.appName,
          description: a.description
        }))
      }),
    { manual: true, successToast: '创建成功', onSuccess }
  );
  const { runAsync: updateMcp, loading: loadingUpdate } = useRequest2(
    (data: EditMcpForm) =>
      putUpdateMcpServer({
        id: data.id!,
        name: data.name,
        apps: data.apps.map((a) => ({
          appId: a.appId,
          toolName: a.toolName,
          appName: a.appName,
          description: a.description
        }))
      }),
    { manual: true, successToast: '更新成功', onSuccess }
  );

  const isConfirming = loadingCreate || loadingUpdate;

  return (
    <>
      <MyModal
        iconSrc="key"
        title={isEdit ? '编辑 MCP' : '创建 MCP'}
        w={'100%'}
        maxW={['90vw', '800px']}
        isOpen
        onClose={onClose}
      >
        <ModalBody>
          <Box>
            <FormLabel required mb={0.5}>
              名称
            </FormLabel>
            <Input {...register('name', { required: true })} bg={'myGray.50'} />
          </Box>
          <Box mt={6}>
            <Flex justifyContent={'space-between'} alignItems={'center'}>
              <FormLabel>应用集合</FormLabel>
              <Button variant={'whiteBase'} size={'sm'} onClick={onOpen}>
                管理应用
              </Button>
            </Flex>
            <TableContainer mt={2} position={'relative'}>
              <Table>
                <Thead>
                  <Tr>
                    <Th>工具名</Th>
                    <Th>应用名</Th>
                    <Th>描述</Th>
                    <Th></Th>
                  </Tr>
                </Thead>
                <Tbody fontSize={'sm'}>
                  {apps.map((app, index) => (
                    <Tr key={app.id} fontWeight={500} fontSize={'mini'} color={'myGray.900'}>
                      <Td>
                        <Input
                          {...register(`apps.${index}.toolName`, { required: true })}
                          placeholder={'用于对外暴露的工具名'}
                          bg={'myGray.50'}
                          w={'100%'}
                        />
                      </Td>
                      <Td>{app.appName}</Td>
                      <Td>
                        <Input
                          {...register(`apps.${index}.description`, { required: true })}
                          bg={'myGray.50'}
                          w={'100%'}
                        />
                      </Td>
                      <Td>
                        <Flex justifyContent={'flex-end'}>
                          <MyIconButton
                            icon="delete"
                            hoverColor={'red.600'}
                            onClick={() => remove(index)}
                            color={'myGray.600'}
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
              {apps.length === 0 && <EmptyTip />}
            </TableContainer>
          </Box>
        </ModalBody>
        <ModalFooter>
          <Button variant={'whiteBase'} mr={4} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={isConfirming}
            variant={'primary'}
            isDisabled={apps.length === 0}
            onClick={handleSubmit((data) => (isEdit ? updateMcp(data) : createMcp(data)))}
          >
            确认
          </Button>
        </ModalFooter>
      </MyModal>

      {isOpen && (
        <SelectAppModal
          selectedApps={apps as unknown as McpAppForm[]}
          onClose={closeSelect}
          onConfirm={(e) => {
            replace(
              e.map((i) => ({
                appId: i.appId,
                toolName: i.toolName,
                appName: i.appName,
                description: i.description
              }))
            );
            closeSelect();
          }}
        />
      )}
    </>
  );
};

export default EditMcpModal;
