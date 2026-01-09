import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Flex,
  ModalFooter,
  ModalBody,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  useTheme,
  Link,
  Input,
  IconButton
} from '@chakra-ui/react';
import {
  getOpenApiKeys,
  createAOpenApiKey,
  delOpenApiById,
  putOpenApiKey,
  getOpenApiKeyDetail
} from '@/web/support/openapi/api';
import type { EditApiKeyProps } from '@/global/support/openapi/api.d';
import { useQuery, useMutation } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { AddIcon } from '@chakra-ui/icons';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getDocPath } from '@/web/common/system/doc';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import MyBox from '@fastgpt/web/components/common/MyBox';

type EditProps = EditApiKeyProps & { _id?: string };
const defaultEditData: EditProps = {
  name: '',
  limit: {
    maxUsagePoints: -1
  }
};

const getApiKeyPreview = (key: string) => {
  if (!key) return '';
  if (key.length <= 16) return key;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
};

const ApiKeyTable = ({ tips, appId }: { tips: string; appId?: string }) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const { copyData } = useCopyData();
  const { feConfigs } = useSystemStore();
  const [baseUrl, setBaseUrl] = useState('https://fastgpt.in/api');
  const [editData, setEditData] = useState<EditProps>();
  const [newApiKey, setNewApiKey] = useState('');
  const [viewApiKey, setViewApiKey] = useState('');
  const [viewingId, setViewingId] = useState<string>();

  const { ConfirmModal, openConfirm } = useConfirm({
    type: 'delete',
    content: t('workflow:delete_api')
  });

  const { mutate: onclickRemove, isLoading: isDeleting } = useMutation({
    mutationFn: async (id: string) => {
      return delOpenApiById(id);
    },
    onSuccess() {
      refetch();
    }
  });

  const { mutate: onclickViewApiKey, isLoading: isFetchingApiKey } = useRequest({
    mutationFn: async (id: string) => {
      const res = await getOpenApiKeyDetail(id);
      return res.apiKey;
    },
    errorToast: 'Error',
    onSuccess: (res) => {
      if (typeof res === 'string') {
        setViewApiKey(res);
      }
      setViewingId(undefined);
    },
    onError: () => setViewingId(undefined)
  });

  const {
    data: apiKeys = [],
    isLoading: isGetting,
    refetch
  } = useQuery(['getOpenApiKeys', appId], () => getOpenApiKeys({ appId }));

  useEffect(() => {
    setBaseUrl(feConfigs?.customApiDomain || `${location.origin}/api`);
  }, [feConfigs?.customApiDomain]);

  return (
    <MyBox
      isLoading={isGetting || isDeleting}
      display={'flex'}
      flexDirection={'column'}
      h={'100%'}
      position={'relative'}
    >
      <Box display={['block', 'flex']} alignItems={'center'}>
        <Box flex={1}>
          <Flex alignItems={'flex-end'}>
            <Box color={'myGray.900'} fontSize={'lg'}>
              {t('common:support.openapi.Api manager')}
            </Box>
          </Flex>
          <Box fontSize={'mini'} color={'myGray.600'}>
            {tips}
          </Box>
        </Box>
        <Flex
          mt={[2, 0]}
          bg={'myGray.100'}
          py={2}
          px={4}
          borderRadius={'md'}
          cursor={'pointer'}
          userSelect={'none'}
          onClick={() => copyData(baseUrl, t('common:support.openapi.Copy success'))}
        >
          <Box border={theme.borders.md} px={2} borderRadius={'md'} fontSize={'xs'}>
            {t('common:support.openapi.Api baseurl')}
          </Box>
          <Box ml={2} fontSize={'sm'}>
            {baseUrl}
          </Box>
        </Flex>
        <Box mt={[2, 0]} textAlign={'right'}>
          <Button
            ml={3}
            leftIcon={<AddIcon fontSize={'md'} />}
            variant={'whitePrimary'}
            onClick={() =>
              setEditData({
                ...defaultEditData,
                appId
              })
            }
          >
            {t('common:new_create')}
          </Button>
        </Box>
      </Box>
      <TableContainer mt={3} position={'relative'} minH={'300px'}>
        <Table>
          <Thead>
            <Tr>
              <Th>{t('common:Name')}</Th>
              <Th>API KEY</Th>
              <Th>{t('common:common.Create Time')}</Th>
              <Th>{t('common:common.Last use time')}</Th>
              <Th />
            </Tr>
          </Thead>
          <Tbody fontSize={'sm'}>
            {apiKeys.map(({ _id, name, usagePoints, limit, apiKey, createTime, lastUsedTime }) => (
              <Tr key={_id}>
                <Td>{name}</Td>
                <Td>
                  <Flex alignItems={'center'}>
                    <Box flex={'1 0 0'} minW={0}>
                      {getApiKeyPreview(apiKey)}
                      <IconButton
                        ml={2}
                        size={'xs'}
                        variant={'whitePrimary'}
                        icon={<MyIcon name={'visible'} w={'14px'} />}
                        aria-label={'查看完整 API Key'}
                        isLoading={isFetchingApiKey && viewingId === _id}
                        onClick={() => {
                          setViewingId(_id);
                          onclickViewApiKey(_id);
                        }}
                      />
                    </Box>
                  </Flex>
                </Td>
                <Td whiteSpace={'pre-wrap'}>{dayjs(createTime).format('YYYY/MM/DD\nHH:mm:ss')}</Td>
                <Td whiteSpace={'pre-wrap'}>
                  {lastUsedTime
                    ? dayjs(lastUsedTime).format('YYYY/MM/DD\nHH:mm:ss')
                    : t('common:common.Un used')}
                </Td>
                <Td>
                  <MyMenu
                    offset={[-50, 5]}
                    Button={
                      <IconButton
                        icon={<MyIcon name={'more'} w={'14px'} />}
                        name={'more'}
                        variant={'whitePrimary'}
                        size={'sm'}
                        aria-label={''}
                      />
                    }
                    menuList={[
                      {
                        children: [
                          {
                            label: t('common:common.Edit'),
                            icon: 'edit',
                            onClick: () =>
                              setEditData({
                                _id,
                                name,
                                limit,
                                appId
                              })
                          },
                          {
                            label: t('common:common.Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () => openConfirm(() => onclickRemove(_id))()
                          }
                        ]
                      }
                    ]}
                  />
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </TableContainer>

      {!!editData && (
        <EditKeyModal
          defaultData={editData}
          onClose={() => setEditData(undefined)}
          onCreate={(id) => {
            setNewApiKey(id);
            refetch();
            setEditData(undefined);
          }}
          onEdit={() => {
            refetch();
            setEditData(undefined);
          }}
        />
      )}
      <ConfirmModal />
      <MyModal
        isOpen={!!newApiKey}
        w={['400px', '600px']}
        iconSrc="/imgs/modal/key.svg"
        title={
          <Box>
            <Box fontWeight={'bold'}>{t('common:support.openapi.New api key')}</Box>
            <Box fontSize={'xs'} color={'myGray.600'}>
              {t('common:support.openapi.New api key tip')}
            </Box>
          </Box>
        }
        onClose={() => setNewApiKey('')}
      >
        <ModalBody pt={5}>
          <Flex
            bg={'myGray.100'}
            px={3}
            py={2}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            cursor={'pointer'}
            borderRadius={'md'}
            userSelect={'all'}
            onClick={() => copyData(newApiKey)}
          >
            <Box flex={1}>{newApiKey}</Box>
            <MyIcon ml={1} name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={() => setNewApiKey('')}>
            {t('common:common.OK')}
          </Button>
        </ModalFooter>
      </MyModal>

      <MyModal
        isOpen={!!viewApiKey}
        w={['400px', '600px']}
        iconSrc="/imgs/modal/key.svg"
        title={<Box fontWeight={'bold'}>完整 API Key</Box>}
        onClose={() => setViewApiKey('')}
      >
        <ModalBody pt={5}>
          <Flex
            bg={'myGray.100'}
            px={3}
            py={2}
            whiteSpace={'pre-wrap'}
            wordBreak={'break-all'}
            cursor={'pointer'}
            borderRadius={'md'}
            userSelect={'all'}
            onClick={() => copyData(viewApiKey, '复制成功')}
          >
            <Box flex={1}>{viewApiKey}</Box>
            <MyIcon ml={1} name={'copy'} w={'16px'}></MyIcon>
          </Flex>
        </ModalBody>
        <ModalFooter>
          <Button variant="whiteBase" onClick={() => setViewApiKey('')}>
            {t('common:common.Close')}
          </Button>
        </ModalFooter>
      </MyModal>
    </MyBox>
  );
};

export default React.memo(ApiKeyTable);

// edit link modal
function EditKeyModal({
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  defaultData: EditProps;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { publishT } = useI18n();
  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: EditProps) => createAOpenApiKey(e),
    errorToast: t('workflow:create_link_error'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: EditProps) => {
      //@ts-ignore
      return putOpenApiKey(e);
    },
    errorToast: t('workflow:update_link_error'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/key.svg"
      title={isEdit ? publishT('edit_api_key') : publishT('create_api_key')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
          <Input
            placeholder={publishT('key_alias') || 'key_alias'}
            maxLength={20}
            {...register('name', {
              required: t('common:common.name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
      </ModalBody>

      <ModalFooter>
        <Button variant={'whiteBase'} mr={3} onClick={onClose}>
          {t('common:common.Close')}
        </Button>

        <Button
          isLoading={creating || updating}
          onClick={submitShareChat((data) => (isEdit ? onclickUpdate(data) : onclickCreate(data)))}
        >
          {t('common:common.Confirm')}
        </Button>
      </ModalFooter>
    </MyModal>
  );
}
