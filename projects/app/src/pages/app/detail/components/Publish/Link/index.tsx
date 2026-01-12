import React, { useMemo, useState } from 'react';
import {
  Flex,
  Box,
  Button,
  TableContainer,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Tbody,
  ModalFooter,
  ModalBody,
  Input,
  Switch,
  IconButton,
  HStack
} from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useLoading } from '@fastgpt/web/hooks/useLoading';
import { useQuery } from '@tanstack/react-query';
import {
  getShareChatList,
  delShareChatById,
  createShareChat,
  putShareChat
} from '@/web/support/outLink/api';
import { formatTimeToChatTime } from '@fastgpt/global/common/string/time';
import { useCopyData } from '@/web/common/hooks/useCopyData';
import { useForm } from 'react-hook-form';
import { defaultOutLinkForm } from '@/web/core/app/constants';
import type { OutLinkEditType, OutLinkSchema } from '@fastgpt/global/support/outLink/type.d';
import { useRequest } from '@/web/common/hooks/useRequest';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import { useTranslation } from 'next-i18next';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/common/MyModal';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import MyMenu from '@fastgpt/web/components/common/MyMenu';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import { useI18n } from '@/web/context/I18n';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyBox from '@fastgpt/web/components/common/MyBox';

const SelectUsingWayModal = dynamic(() => import('./SelectUsingWayModal'));

const Share = ({ appId }: { appId: string; type: PublishChannelEnum }) => {
  const { t } = useTranslation();
  const { setIsLoading } = useLoading();
  const { copyData } = useCopyData();
  const [editLinkData, setEditLinkData] = useState<OutLinkEditType>();
  const [selectedLinkData, setSelectedLinkData] = useState<OutLinkSchema>();
  const { toast } = useToast();
  const { ConfirmModal, openConfirm } = useConfirm({
    content: t('common:support.outlink.Delete link tip'),
    type: 'delete'
  });

  const {
    isFetching,
    data: shareChatList = [],
    refetch: refetchShareChatList
  } = useQuery(['initShareChatList', appId], () =>
    getShareChatList({ appId, type: PublishChannelEnum.share })
  );

  return (
    <MyBox h={'100%'} isLoading={isFetching} position={'relative'}>
      <Flex justifyContent={'space-between'}>
        <HStack>
          <Box color={'myGray.900'} fontSize={'lg'}>
            在线对话窗口
          </Box>
          <QuestionTip label="可以直接分享该模型给其他用户去进行对话，并设置是否需要用户登录来对话。" />
        </HStack>
        <Button
          variant={'whitePrimary'}
          colorScheme={'blue'}
          size={['sm', 'md']}
          {...(shareChatList.length >= 10
            ? {
                isDisabled: true,
                title: t('common:core.app.share.Amount limit tip')
              }
            : {})}
          onClick={() => setEditLinkData(defaultOutLinkForm)}
        >
          {t('common:core.app.share.Create link')}
        </Button>
      </Flex>
      <TableContainer mt={3}>
        <Table variant={'simple'} w={'100%'} overflowX={'auto'} fontSize={'sm'}>
          <Thead>
            <Tr>
              <Th>名称</Th>
              <Th>有效期</Th>
              <Th>返回引用</Th>
              <Th>是否登录</Th>
              <Th>备选模型</Th>
              <Th>最后使用时间</Th>
              <Th></Th>
            </Tr>
          </Thead>
          <Tbody>
            {shareChatList.map((item) => (
              <Tr key={item._id}>
                <Td>{item.name}</Td>
                <Td>
                  {item.limit?.expiredTime
                    ? dayjs(item.limit.expiredTime).format('YYYY-MM-DD HH:mm')
                    : '-'}
                </Td>
                <Td>{item.responseDetail ? '✔' : '✖'}</Td>
                <Td>{item.isLogin ? '✔' : '✖'}</Td>
                <Td>{item.alternativeModel ? '✔' : '✖'}</Td>
                <Td>
                  {item.lastTime ? formatTimeToChatTime(item.lastTime) : t('common:common.Un used')}
                </Td>
                <Td display={'flex'} alignItems={'center'}>
                  <Button
                    onClick={() => setSelectedLinkData(item as OutLinkSchema)}
                    size={'sm'}
                    mr={3}
                    variant={'whitePrimary'}
                  >
                    {t('common:core.app.outLink.Select Mode')}
                  </Button>
                  <MyMenu
                    Button={
                      <IconButton
                        icon={<MyIcon name={'more'} w={'14px'} />}
                        name={'more'}
                        variant={'whiteBase'}
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
                              setEditLinkData({
                                _id: item._id,
                                name: item.name,
                                responseDetail: item.responseDetail,
                                limit: item.limit,
                                isLogin: item.isLogin,
                                alternativeModel: item.alternativeModel
                              })
                          },
                          {
                            label: t('common:common.Delete'),
                            icon: 'delete',
                            type: 'danger',
                            onClick: () =>
                              openConfirm(async () => {
                                setIsLoading(true);
                                try {
                                  await delShareChatById(item._id);
                                  refetchShareChatList();
                                } catch (error) {
                                  console.log(error);
                                }
                                setIsLoading(false);
                              })()
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

      {shareChatList.length === 0 && !isFetching && (
        <EmptyTip text={t('common:core.app.share.Not share link')} />
      )}
      {!!editLinkData && (
        <EditLinkModal
          appId={appId}
          type={PublishChannelEnum.share}
          defaultData={editLinkData}
          onCreate={(id) => {
            const url = `${location.origin}/chat/share?shareId=${id}`;
            copyData(url, t('common:core.app.share.Create link tip'));
            refetchShareChatList();
            setEditLinkData(undefined);
          }}
          onEdit={() => {
            toast({
              status: 'success',
              title: t('common:common.Update Successful')
            });
            refetchShareChatList();
            setEditLinkData(undefined);
          }}
          onClose={() => setEditLinkData(undefined)}
        />
      )}
      {!!selectedLinkData && (
        <SelectUsingWayModal
          share={selectedLinkData}
          onClose={() => setSelectedLinkData(undefined)}
        />
      )}
      <ConfirmModal />
    </MyBox>
  );
};

// edit link modal
function EditLinkModal({
  appId,
  type,
  defaultData,
  onClose,
  onCreate,
  onEdit
}: {
  appId: string;
  type: PublishChannelEnum;
  defaultData: OutLinkEditType;
  onClose: () => void;
  onCreate: (id: string) => void;
  onEdit: () => void;
}) {
  const { t } = useTranslation();
  const { publishT } = useI18n();
  const {
    register,
    setValue,
    handleSubmit: submitShareChat
  } = useForm({
    defaultValues: defaultData
  });

  const isEdit = useMemo(() => !!defaultData._id, [defaultData]);

  const { mutate: onclickCreate, isLoading: creating } = useRequest({
    mutationFn: async (e: OutLinkEditType) =>
      createShareChat({
        ...e,
        appId,
        type
      }),
    errorToast: t('common:common.Create Failed'),
    onSuccess: onCreate
  });
  const { mutate: onclickUpdate, isLoading: updating } = useRequest({
    mutationFn: (e: OutLinkEditType) => {
      return putShareChat(e);
    },
    errorToast: t('common:common.Update Failed'),
    onSuccess: onEdit
  });

  return (
    <MyModal
      isOpen={true}
      iconSrc="/imgs/modal/shareFill.svg"
      title={isEdit ? publishT('edit_link') : publishT('create_link')}
    >
      <ModalBody>
        <Flex alignItems={'center'}>
          <FormLabel flex={'0 0 90px'}>{t('common:Name')}</FormLabel>
          <Input
            placeholder={publishT('link_name')}
            maxLength={20}
            {...register('name', {
              required: t('common:common.name_is_empty') || 'name_is_empty'
            })}
          />
        </Flex>
        <Flex alignItems={'center'} mt={4}>
          <FormLabel flex={'0 0 90px'} alignItems={'center'}>
            {t('common:common.Expired Time')}
          </FormLabel>
          <Input
            type="datetime-local"
            defaultValue={
              defaultData.limit?.expiredTime
                ? dayjs(defaultData.limit?.expiredTime).format('YYYY-MM-DDTHH:mm')
                : ''
            }
            onChange={(e) => {
              setValue('limit.expiredTime', new Date(e.target.value));
            }}
          />
        </Flex>

        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            <FormLabel>备选模型</FormLabel>
            <QuestionTip
              ml={1}
              label="加入到备选模型列表, 在PC窗口可快速切换到此模型对话"
            ></QuestionTip>
          </Flex>
          <Switch {...register('alternativeModel')} />
        </Flex>

        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            <FormLabel>返回引用</FormLabel>
            <QuestionTip ml={1} label="在回复中返回引用内容, 但不会允许用户下载文档"></QuestionTip>
          </Flex>
          <Switch {...register('responseDetail')} />
        </Flex>

        <Flex alignItems={'center'} mt={4}>
          <Flex flex={'0 0 90px'} alignItems={'center'}>
            <FormLabel>是否登录</FormLabel>
          </Flex>
          <Switch {...register('isLogin')} />
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

export default React.memo(Share);
