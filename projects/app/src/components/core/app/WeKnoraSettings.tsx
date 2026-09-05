import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  Input,
  ModalBody,
  ModalFooter,
  Spinner,
  Stack,
  useDisclosure,
  useTheme
} from '@chakra-ui/react';
import { useQuery } from '@tanstack/react-query';
import MyModal from '@fastgpt/web/components/common/MyModal';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  type WeKnoraConnectionConfig,
  type WeKnoraConnectionInfo,
  type WeKnoraKnowledgeBase,
  type WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import {
  getWeKnoraConnectionInfo,
  getWeKnoraKnowledgeBases,
  validateWeKnoraConnection,
  saveWeKnoraConnection
} from '@/web/core/dataset/weknora';
import WeKnoraParamsModal from './WeKnoraParamsModal';

const WeKnoraLoading = () => (
  <Flex
    role={'status'}
    aria-live={'polite'}
    alignItems={'center'}
    justifyContent={'center'}
    gap={4}
    px={4}
    py={6}
    bg={'myGray.50'}
    borderWidth={'1px'}
    borderColor={'borderColor.low'}
    borderRadius={'md'}
  >
    <Flex
      position={'relative'}
      alignItems={'center'}
      justifyContent={'center'}
      boxSize={'44px'}
      flexShrink={0}
    >
      <Spinner
        position={'absolute'}
        boxSize={'44px'}
        thickness={'2px'}
        speed={'0.8s'}
        emptyColor={'myGray.100'}
        color={'primary.500'}
        aria-hidden
      />
      <MyIcon name={'core/dataset/weknora'} w={'24px'} />
    </Flex>
    <Box>
      <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
        正在加载知识库
      </Box>
      <Box mt={1} fontSize={'xs'} color={'myGray.500'} lineHeight={'1.6'}>
        正在从 WeKnoraX 获取列表，请稍候
      </Box>
    </Box>
  </Flex>
);

type Props = {
  appId: string;
  value: WeKnoraSearchSettings;
  maxTokens?: number;
  onChange: (value: WeKnoraSearchSettings) => void;
};

export const WeKnoraSettingsModal = ({
  appId,
  value,
  maxTokens = 16000,
  onChange,
  onClose
}: Props & { onClose: () => void }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState(value);
  const [connection, setConnection] = useState<WeKnoraConnectionConfig>({
    apiUrl: '',
    apiKey: '',
    webUrl: ''
  });
  const [savedConnection, setSavedConnection] = useState<WeKnoraConnectionInfo>();
  const [validatedConnection, setValidatedConnection] = useState<WeKnoraConnectionConfig>();
  const [datasets, setDatasets] = useState<WeKnoraKnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingConnection, setEditingConnection] = useState(!value.weknoraConnectionId);
  const [error, setError] = useState('');
  const paramsModal = useDisclosure();
  const busy = loading || saving;
  const connected =
    !!validatedConnection &&
    connection.apiUrl === validatedConnection.apiUrl &&
    connection.apiKey === validatedConnection.apiKey &&
    connection.webUrl === validatedConnection.webUrl;

  useEffect(() => {
    if (!value.weknoraConnectionId) return;
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const info = await getWeKnoraConnectionInfo(appId, value.weknoraConnectionId);
        if (!active) return;
        setSavedConnection(info);
        setConnection({ apiUrl: info.apiUrl, webUrl: info.webUrl, apiKey: '' });
        const list = await getWeKnoraKnowledgeBases(appId, value.weknoraConnectionId);
        if (!active) return;
        setDatasets(list);
        setValidatedConnection({ apiUrl: info.apiUrl, webUrl: info.webUrl, apiKey: '' });
      } catch (error) {
        if (active) {
          setError(getErrText(error));
          setEditingConnection(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [appId, value.weknoraConnectionId]);

  const missingDatasets = draft.datasets.filter(
    (item) => !datasets.some((dataset) => dataset.id === item.datasetId)
  );
  const updateConnection = (key: keyof WeKnoraConnectionConfig, input: string) => {
    setConnection((state) => {
      if (key !== 'apiUrl') return { ...state, [key]: input };
      let webUrl = '';
      try {
        const url = new URL(input);
        if (url.protocol === 'http:' || url.protocol === 'https:') webUrl = url.origin;
      } catch {
        // The URL may be incomplete while typing; connection submission validates it.
      }
      return { ...state, apiUrl: input, webUrl };
    });
    setError('');
  };
  const connect = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await validateWeKnoraConnection({
        appId,
        connectionId: savedConnection?.connectionId,
        ...connection,
        apiKey: connection.apiKey || undefined
      });
      const scopeChanged =
        !validatedConnection ||
        validatedConnection.apiUrl !== result.apiUrl ||
        validatedConnection.apiKey !== connection.apiKey.trim();
      setDraft((state) => ({
        ...state,
        datasets: scopeChanged ? [] : state.datasets
      }));
      const validatedConfig = {
        apiUrl: result.apiUrl,
        webUrl: result.webUrl,
        apiKey: connection.apiKey.trim()
      };
      setConnection(validatedConfig);
      setValidatedConnection(validatedConfig);
      setDatasets(result.datasets);
      setEditingConnection(false);
    } catch (error) {
      setError(getErrText(error));
      setValidatedConnection(undefined);
    } finally {
      setLoading(false);
    }
  };
  const selectDataset = (id: string, checked: boolean) => {
    setDraft((state) => ({
      ...state,
      datasets: checked
        ? [...state.datasets, { datasetId: id }]
        : state.datasets.filter((item) => item.datasetId !== id)
    }));
  };
  const apply = async () => {
    if (busy || !connected || missingDatasets.length > 0) return;
    if (draft.datasets.length === 0) {
      return toast({ status: 'warning', title: '请至少选择一个知识库' });
    }
    if (!Number.isFinite(draft.limit) || draft.limit < 100 || draft.limit > maxTokens) {
      return toast({ status: 'warning', title: `引用长度必须在 100～${maxTokens} Token 之间` });
    }
    setSaving(true);
    setError('');
    try {
      let confirmedConnection = savedConnection;
      if (
        !confirmedConnection ||
        connection.apiKey ||
        connection.apiUrl !== confirmedConnection.apiUrl ||
        connection.webUrl !== confirmedConnection.webUrl
      ) {
        confirmedConnection = await saveWeKnoraConnection({
          appId,
          connectionId: confirmedConnection?.connectionId,
          ...connection,
          apiKey: connection.apiKey || undefined
        });
      }
      onChange({
        weknoraConnectionId: confirmedConnection.connectionId,
        datasets: draft.datasets,
        limit: draft.limit
      });
      onClose();
    } catch (error) {
      setError(getErrText(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <MyModal
        isOpen
        onClose={saving ? undefined : onClose}
        title={'选择 WeKnoraX 知识库'}
        iconSrc={'core/dataset/weknora'}
        w={['94vw', '640px']}
        maxW={['94vw', '640px']}
      >
        <ModalBody px={[4, 6]} py={5} fontSize={'sm'} color={'myGray.900'}>
          <Stack spacing={5}>
            <Box borderWidth={'1px'} borderColor={'borderColor.low'} borderRadius={'lg'} p={4}>
              <Flex alignItems={'center'} justifyContent={'space-between'} gap={3}>
                <Flex alignItems={'center'} gap={2}>
                  <Box fontWeight={'medium'}>连接设置</Box>
                  {connected && (
                    <Box
                      px={2}
                      py={0.5}
                      borderRadius={'sm'}
                      bg={'green.50'}
                      color={'green.600'}
                      fontSize={'xs'}
                    >
                      已连接
                    </Box>
                  )}
                </Flex>
                {(savedConnection || validatedConnection) && (
                  <Button
                    size={'xs'}
                    variant={'transparentBase'}
                    isDisabled={busy}
                    onClick={() => setEditingConnection((state) => !state)}
                  >
                    {editingConnection ? '收起' : '编辑连接'}
                  </Button>
                )}
              </Flex>
              {!editingConnection && (
                <Box mt={2} fontSize={'xs'} color={'myGray.500'} wordBreak={'break-all'}>
                  {connection.apiUrl || '正在读取连接…'}
                </Box>
              )}
              <Collapse in={editingConnection}>
                <Stack spacing={4} mt={4}>
                  <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={4}>
                    <FormControl isRequired>
                      <FormLabel fontSize={'sm'} fontWeight={'normal'} mb={2}>
                        Base URL
                      </FormLabel>
                      <Input
                        size={'sm'}
                        borderRadius={'md'}
                        value={connection.apiUrl}
                        isDisabled={busy}
                        placeholder={'https://weknora.example.com/api/v1'}
                        onChange={(event) => updateConnection('apiUrl', event.target.value)}
                      />
                    </FormControl>
                    <FormControl isRequired={!savedConnection}>
                      <FormLabel fontSize={'sm'} fontWeight={'normal'} mb={2}>
                        API Key
                      </FormLabel>
                      <Input
                        size={'sm'}
                        borderRadius={'md'}
                        type={'password'}
                        autoComplete={'new-password'}
                        value={connection.apiKey}
                        isDisabled={busy}
                        placeholder={
                          savedConnection ? '地址不变时，留空保持密钥' : '请输入 API Key'
                        }
                        onChange={(event) => updateConnection('apiKey', event.target.value)}
                      />
                    </FormControl>
                  </Grid>
                  <FormControl>
                    <FormLabel fontSize={'sm'} fontWeight={'normal'} mb={2}>
                      来源网页地址
                      <Box as={'span'} ml={1} color={'myGray.500'}>
                        （选填）
                      </Box>
                    </FormLabel>
                    <Input
                      size={'sm'}
                      borderRadius={'md'}
                      value={connection.webUrl}
                      isDisabled={busy}
                      placeholder={'根据 Base URL 自动填写，可手动修改'}
                      onChange={(event) => updateConnection('webUrl', event.target.value)}
                    />
                  </FormControl>
                  <Flex justifyContent={'flex-end'}>
                    <Button
                      size={'sm'}
                      isLoading={loading}
                      onClick={connect}
                      isDisabled={
                        saving ||
                        !appId ||
                        !connection.apiUrl ||
                        (!connection.apiKey && !savedConnection)
                      }
                    >
                      连接并加载知识库
                    </Button>
                  </Flex>
                </Stack>
              </Collapse>
            </Box>
            {error && (
              <Box
                color={'red.600'}
                bg={'red.50'}
                borderRadius={'md'}
                p={3}
                wordBreak={'break-word'}
              >
                {error}
              </Box>
            )}
            <Box>
              <Flex alignItems={'center'} justifyContent={'space-between'} mb={3}>
                <Box fontWeight={'medium'}>选择知识库</Box>
                {connected && (
                  <Box fontSize={'xs'} color={'myGray.500'}>
                    已选择 {draft.datasets.length} 个
                  </Box>
                )}
              </Flex>
              {loading ? (
                <WeKnoraLoading />
              ) : connected ? (
                <>
                  {datasets.length === 0 && (
                    <Box
                      py={6}
                      textAlign={'center'}
                      bg={'myGray.50'}
                      borderRadius={'md'}
                      color={'myGray.500'}
                    >
                      当前连接没有可访问的知识库
                    </Box>
                  )}
                  <Grid templateColumns={['1fr', 'repeat(2, minmax(0, 1fr))']} gap={3}>
                    {datasets.map((dataset) => {
                      const checked = draft.datasets.some((item) => item.datasetId === dataset.id);
                      return (
                        <Checkbox
                          key={dataset.id}
                          isChecked={checked}
                          isDisabled={saving}
                          onChange={(event) => selectDataset(dataset.id, event.target.checked)}
                          p={3}
                          borderWidth={'1px'}
                          borderColor={checked ? 'primary.300' : 'borderColor.low'}
                          borderRadius={'md'}
                          bg={checked ? 'primary.50' : 'white'}
                          _hover={{ borderColor: 'primary.300' }}
                          sx={{ '.chakra-checkbox__label': { flex: 1, minWidth: 0 } }}
                        >
                          <Flex alignItems={'center'} gap={2}>
                            <MyIcon name={'core/dataset/weknora'} w={'24px'} flexShrink={0} />
                            <Box
                              fontSize={'sm'}
                              fontWeight={'normal'}
                              noOfLines={2}
                              wordBreak={'break-word'}
                            >
                              {dataset.name}
                              {dataset.type === 'faq' && (
                                <Box as={'span'} ml={1} color={'myGray.500'} fontSize={'xs'}>
                                  FAQ
                                </Box>
                              )}
                            </Box>
                          </Flex>
                        </Checkbox>
                      );
                    })}
                  </Grid>
                  {missingDatasets.map((item) => (
                    <Checkbox
                      key={item.datasetId}
                      isChecked
                      isDisabled={saving}
                      mt={3}
                      onChange={() => selectDataset(item.datasetId, false)}
                    >
                      <Box fontSize={'sm'} color={'red.600'} wordBreak={'break-all'}>
                        {item.datasetId}（已不可访问，请取消选择）
                      </Box>
                    </Checkbox>
                  ))}
                </>
              ) : (
                <Box
                  py={6}
                  textAlign={'center'}
                  bg={'myGray.50'}
                  borderRadius={'md'}
                  color={'myGray.500'}
                >
                  连接 WeKnoraX 后，选择需要关联的知识库
                </Box>
              )}
            </Box>
            <Flex
              alignItems={'center'}
              justifyContent={'space-between'}
              gap={3}
              borderTopWidth={'1px'}
              borderColor={'borderColor.low'}
              pt={4}
            >
              <Box>
                <Box fontWeight={'medium'}>引用长度</Box>
                <Box mt={1} fontSize={'xs'} color={'myGray.500'}>
                  最多 {draft.limit} Token
                </Box>
              </Box>
              <Button
                size={'sm'}
                variant={'transparentBase'}
                isDisabled={saving}
                onClick={paramsModal.onOpen}
              >
                设置
              </Button>
            </Flex>
          </Stack>
        </ModalBody>
        <ModalFooter px={[4, 6]} gap={3} borderTopWidth={'1px'} borderColor={'borderColor.low'}>
          <Button variant={'whiteBase'} isDisabled={saving} onClick={onClose}>
            取消
          </Button>
          <Button
            isLoading={saving}
            isDisabled={loading || !connected || missingDatasets.length > 0}
            onClick={apply}
          >
            确定
          </Button>
        </ModalFooter>
      </MyModal>
      {paramsModal.isOpen && (
        <WeKnoraParamsModal
          limit={draft.limit}
          maxTokens={maxTokens}
          onClose={paramsModal.onClose}
          onSuccess={(limit) => setDraft((state) => ({ ...state, limit }))}
        />
      )}
    </>
  );
};

const WeKnoraSettings = (props: Props) => {
  const theme = useTheme();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const {
    data: datasets = [],
    isFetching,
    error,
    refetch
  } = useQuery(
    ['weknoraKnowledgeBases', props.appId, props.value.weknoraConnectionId],
    () => getWeKnoraKnowledgeBases(props.appId, props.value.weknoraConnectionId),
    {
      enabled: !!props.appId && !!props.value.weknoraConnectionId,
      retry: false,
      refetchOnWindowFocus: false
    }
  );
  const selectedDatasets = datasets.filter((dataset) =>
    props.value.datasets.some((item) => item.datasetId === dataset.id)
  );

  return (
    <>
      <Grid gridTemplateColumns={'repeat(2, minmax(0, 1fr))'} gridGap={4} minW={'350px'} w={'100%'}>
        <Button
          h={'36px'}
          leftIcon={<MyIcon name={'common/selectLight'} w={'14px'} />}
          onClick={onOpen}
        >
          选择
        </Button>
        {selectedDatasets.map((dataset) => (
          <Flex
            key={dataset.id}
            alignItems={'center'}
            h={'36px'}
            border={theme.borders.base}
            px={2}
            borderRadius={'md'}
          >
            <MyIcon name={'core/dataset/weknora'} w={'24px'} flexShrink={0} />
            <Box
              ml={3}
              flex={'1 0 0'}
              w={0}
              className={'textEllipsis'}
              fontWeight={'bold'}
              fontSize={['md', 'lg']}
            >
              {dataset.name}
            </Box>
          </Flex>
        ))}
      </Grid>
      {isFetching && (
        <Box mt={3}>
          <WeKnoraLoading />
        </Box>
      )}
      {!!error && (
        <Box mt={3} fontSize={'sm'} color={'red.600'}>
          知识库加载失败：{getErrText(error)}
        </Box>
      )}
      {isOpen && (
        <WeKnoraSettingsModal
          {...props}
          onClose={onClose}
          onChange={(settings) => {
            props.onChange(settings);
            if (settings.weknoraConnectionId === props.value.weknoraConnectionId) void refetch();
          }}
        />
      )}
    </>
  );
};

export default React.memo(WeKnoraSettings);
