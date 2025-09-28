import React, { useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  ModalBody,
  Input,
  Textarea,
  TableContainer,
  Table,
  Thead,
  Th,
  Tbody,
  Tr,
  Td,
  ModalFooter
} from '@chakra-ui/react';
import { useSelectFile } from '@/web/common/file/hooks/useSelectFile';
import { useForm } from 'react-hook-form';
import { compressImgFileAndUpload } from '@/web/common/file/controller';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import HttpInput from '@fastgpt/web/components/common/Input/HttpInput';
import { AppSchema } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppListContext } from './context';
import { HttpPluginImgUrl, MongoImageTypeEnum } from '@fastgpt/global/common/file/image/constants';
import { getMCPTools, postCreateMCPTools } from '@/web/core/app/api/plugin';
import { useRouter } from 'next/router';

export type EditMcpToolsProps = {
  id?: string;
  avatar: string;
  name: string;
  intro?: string;
  pluginData?: AppSchema['pluginData'];
};

const defaultAvatar = HttpPluginImgUrl;

const McpToolsEditModal = ({ onClose }: { onClose: () => void }) => {
  const { toast } = useToast();
  const router = useRouter();
  const { parentId, loadMyApps } = useContextSelector(AppListContext, (v) => v);

  const { register, setValue, handleSubmit, watch } = useForm<EditMcpToolsProps>({
    defaultValues: { avatar: defaultAvatar, name: '', intro: '' }
  });
  const avatar = watch('avatar');

  const [serverUrl, setServerUrl] = useState('');
  const [customHeaders, setCustomHeaders] = useState<{ key: string; value: string }[]>([
    { key: 'Authorization', value: 'Bearer ' }
  ]);
  const [updateTrigger, setUpdateTrigger] = useState(false);
  const [tools, setTools] = useState<{ name: string; description: string; inputSchema: any }[]>([]);
  const headersObj = useMemo(
    () => Object.fromEntries(customHeaders.filter((h) => h.key).map((h) => [h.key, h.value])),
    [customHeaders]
  );

  const { File, onOpen: onOpenSelectFile } = useSelectFile({
    fileType: 'image/*',
    multiple: false
  });
  const onSelectFile = async (e: File[]) => {
    const file = e[0];
    if (!file) return;
    try {
      const src = await compressImgFileAndUpload({
        type: MongoImageTypeEnum.pluginAvatar,
        file,
        maxW: 300,
        maxH: 300
      });
      setValue('avatar', src);
    } catch (err: any) {
      toast({ title: err?.message || '上传失败', status: 'warning' });
    }
  };

  const { mutate: onFetchTools, isLoading: isLoadingTools } = useRequest({
    mutationFn: async () => {
      if (!serverUrl || (!serverUrl.startsWith('https://') && !serverUrl.startsWith('http://'))) {
        return toast({ title: '无效的 MCP 地址', status: 'warning' });
      }
      const list = await getMCPTools({ url: serverUrl, headers: headersObj });
      setTools(list);
    },
    errorToast: '获取工具失败'
  });

  const { mutate: onCreate, isLoading: isCreating } = useRequest({
    mutationFn: async (data: EditMcpToolsProps) => {
      return postCreateMCPTools({
        parentId,
        name: data.name,
        avatar: data.avatar,
        url: serverUrl,
        headers: headersObj,
        toolList: tools
      });
    },
    onSuccess(res: string) {
      loadMyApps();
      onClose();
      if (res) {
        router.push(`/app/detail/${res}`);
      }
    },
    successToast: '创建成功',
    errorToast: '创建失败'
  });

  return (
    <>
      <MyModal
        isOpen
        onClose={onClose}
        iconSrc="core/app/type/pluginFill"
        title={'导入 MCP 工具集'}
        w={['90vw', '600px']}
        h={['90vh', '80vh']}
        position={'relative'}
      >
        <ModalBody flex={'1 0 0'} overflow={'auto'}>
          <Box color={'myGray.800'} fontWeight={'bold'}>
            名称与头像
          </Box>
          <Flex mt={3} alignItems={'center'}>
            <MyTooltip label={'设置头像'}>
              <Avatar
                flexShrink={0}
                src={avatar}
                w={['28px', '32px']}
                h={['28px', '32px']}
                cursor={'pointer'}
                borderRadius={'md'}
                onClick={onOpenSelectFile}
              />
            </MyTooltip>
            <Input
              flex={1}
              ml={4}
              bg={'myWhite.600'}
              placeholder={'请输入名称'}
              {...register('name', { required: '名称不能为空' })}
            />
          </Flex>

          <Box color={'myGray.800'} fontWeight={'bold'} mt={4}>
            MCP 地址
          </Box>
          <Flex mt={2} alignItems={'center'}>
            <Input
              placeholder={'https://your.mcp.server'}
              bg={'myWhite.600'}
              onBlur={(e) => setServerUrl(e.target.value)}
            />
            <Button
              ml={2}
              size={'sm'}
              variant={'whitePrimary'}
              isLoading={isLoadingTools}
              onClick={() => onFetchTools()}
            >
              获取工具
            </Button>
          </Flex>

          <Box color={'myGray.800'} fontWeight={'bold'} mt={4}>
            请求头（可选）
          </Box>
          <Box
            mt={1}
            borderRadius={'md'}
            overflow={'hidden'}
            borderWidth={'1px'}
            borderBottom={'none'}
          >
            <TableContainer overflowY={'visible'} overflowX={'unset'}>
              <Table>
                <Thead>
                  <Tr>
                    <Th px={2}>Header</Th>
                    <Th px={2}>Value</Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {customHeaders.map((item, index) => (
                    <Tr key={index}>
                      <Td p={0} w={'150px'}>
                        <HttpInput
                          placeholder={'Header Key'}
                          value={item.key}
                          onBlur={(val) =>
                            setCustomHeaders((prev) =>
                              prev.map((h, i) => (i === index ? { ...h, key: val } : h))
                            )
                          }
                          updateTrigger={updateTrigger}
                        />
                      </Td>
                      <Td p={0}>
                        <Flex alignItems={'center'}>
                          <HttpInput
                            placeholder={'Header Value'}
                            value={item.value}
                            onBlur={(val) =>
                              setCustomHeaders((prev) =>
                                prev.map((h, i) => (i === index ? { ...h, value: val } : h))
                              )
                            }
                          />
                          <MyIcon
                            name={'delete'}
                            cursor={'pointer'}
                            _hover={{ color: 'red.600' }}
                            w={'14px'}
                            onClick={() =>
                              setCustomHeaders((prev) => prev.filter((_, i) => i !== index))
                            }
                          />
                        </Flex>
                      </Td>
                    </Tr>
                  ))}
                  <Tr>
                    <Td p={0} w={'150px'}>
                      <HttpInput
                        placeholder={'添加 Header'}
                        value={''}
                        updateTrigger={updateTrigger}
                        onBlur={(val) => {
                          if (!val) return;
                          setCustomHeaders((prev) => [...prev, { key: val, value: '' }]);
                          setUpdateTrigger((prev) => !prev);
                        }}
                      />
                    </Td>
                    <Td p={0}>
                      <Box display={'flex'} alignItems={'center'}>
                        <HttpInput />
                      </Box>
                    </Td>
                  </Tr>
                </Tbody>
              </Table>
            </TableContainer>
          </Box>

          <Box color={'myGray.800'} fontWeight={'bold'} mt={4}>
            工具列表（{tools.length}）
          </Box>
          <Box
            mt={3}
            borderRadius={'md'}
            overflow={'hidden'}
            borderWidth={'1px'}
            borderBottom={'none'}
          >
            <TableContainer maxH={400} overflowY={'auto'}>
              <Table bg={'white'}>
                <Thead bg={'myGray.50'}>
                  <Th>名称</Th>
                  <Th>描述</Th>
                </Thead>
                <Tbody>
                  {tools.map((item, index) => (
                    <Tr key={index}>
                      <Td>{item.name}</Td>
                      <Td fontSize={'sm'} textColor={'gray.600'} maxW={80} whiteSpace={'pre-wrap'}>
                        {item.description}
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </TableContainer>
          </Box>
        </ModalBody>

        <ModalFooter>
          <Button variant={'whiteBase'} mr={3} onClick={onClose}>
            关闭
          </Button>
          <Button
            isDisabled={tools.length === 0}
            onClick={handleSubmit((data) => onCreate(data))}
            isLoading={isCreating}
          >
            确认创建
          </Button>
        </ModalFooter>
      </MyModal>
      <File onSelect={onSelectFile} />
    </>
  );
};

export default McpToolsEditModal;
