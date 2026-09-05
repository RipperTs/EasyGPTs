import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Input,
  ModalBody,
  ModalFooter,
  Stack,
  Textarea,
  useDisclosure
} from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  getWeKnoraSearchModes,
  type WeKnoraConnectionConfig,
  type WeKnoraConnectionInfo,
  type WeKnoraKnowledgeBase,
  type WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import {
  getWeKnoraConnectionInfo,
  getWeKnoraKnowledgeBases,
  saveWeKnoraConnection
} from '@/web/core/dataset/weknora';
import DatasetParamsModal from './DatasetParamsModal';

type Props = {
  appId: string;
  value: WeKnoraSearchSettings;
  onChange: (value: WeKnoraSearchSettings) => void;
};

const WeKnoraSettingsModal = ({
  appId,
  value,
  onChange,
  onClose
}: Props & { onClose: () => void }) => {
  const { toast } = useToast();
  const [draft, setDraft] = useState(value);
  const [connection, setConnection] = useState<WeKnoraConnectionConfig>({
    apiUrl: '',
    apiKey: '',
    tenantId: '',
    webUrl: ''
  });
  const [savedConnection, setSavedConnection] = useState<WeKnoraConnectionInfo>();
  const [datasets, setDatasets] = useState<WeKnoraKnowledgeBase[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const paramsModal = useDisclosure();

  useEffect(() => {
    if (!value.weknoraConnectionId) return;
    let active = true;
    setLoading(true);
    const load = async () => {
      try {
        const info = await getWeKnoraConnectionInfo(appId, value.weknoraConnectionId);
        if (!active) return;
        setSavedConnection(info);
        setConnection({
          apiUrl: info.apiUrl,
          tenantId: info.tenantId,
          webUrl: info.webUrl,
          apiKey: ''
        });
        const list = await getWeKnoraKnowledgeBases(appId, value.weknoraConnectionId);
        if (!active) return;
        setDatasets(list);
        setConnected(true);
      } catch (error) {
        if (active) setError(getErrText(error));
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [appId, value.weknoraConnectionId]);

  const selectedDatasets = useMemo(
    () =>
      datasets.filter((dataset) => draft.datasets.some((item) => item.datasetId === dataset.id)),
    [datasets, draft.datasets]
  );
  const allowedModes = useMemo(() => getWeKnoraSearchModes(selectedDatasets), [selectedDatasets]);
  const modeAllowed = allowedModes.includes(draft.searchMode as DatasetSearchModeEnum);
  const missingDatasets = draft.datasets.filter(
    (item) => !datasets.some((dataset) => dataset.id === item.datasetId)
  );

  const updateConnection = (key: keyof WeKnoraConnectionConfig, input: string) => {
    setConnection((state) => ({ ...state, [key]: input }));
    setConnected(false);
    setError('');
  };
  const connect = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await saveWeKnoraConnection({
        appId,
        connectionId: savedConnection?.connectionId,
        ...connection,
        apiKey: connection.apiKey || undefined
      });
      const scopeChanged =
        !!savedConnection &&
        (savedConnection.apiUrl !== result.apiUrl || savedConnection.tenantId !== result.tenantId);
      setDraft((state) => ({
        ...state,
        weknoraConnectionId: result.connectionId,
        datasets: scopeChanged ? [] : state.datasets
      }));
      setSavedConnection(result);
      setConnection({
        apiUrl: result.apiUrl,
        tenantId: result.tenantId,
        webUrl: result.webUrl,
        apiKey: ''
      });
      setDatasets(result.datasets);
      setConnected(true);
    } catch (error) {
      setError(getErrText(error));
      setConnected(false);
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
  const apply = () => {
    if (!connected || missingDatasets.length > 0 || !modeAllowed) return;
    if (
      !Number.isInteger(draft.weknoraMatchCount) ||
      draft.weknoraMatchCount < 1 ||
      draft.weknoraMatchCount > 200
    ) {
      return toast({ status: 'warning', title: '每库召回数量必须是 1～200 的整数' });
    }
    if (
      draft.datasets.length > 0 &&
      draft.datasetSearchUsingExtensionQuery &&
      !draft.datasetSearchExtensionModel
    ) {
      return toast({ status: 'warning', title: '请在检索参数中选择问题优化模型，或关闭问题优化' });
    }
    onChange({
      ...draft,
      weknoraKnowledgeIds: draft.weknoraKnowledgeIds.map((id) => id.trim()).filter(Boolean),
      weknoraTagIds: draft.weknoraTagIds.map((id) => id.trim()).filter(Boolean)
    });
    onClose();
  };

  return (
    <>
      <MyModal isOpen onClose={onClose} title="WeKnoraX知识库" w={['94vw', '640px']}>
        <ModalBody>
          <Stack spacing={4}>
            <FormControl isRequired>
              <FormLabel>Base URL</FormLabel>
              <Input
                value={connection.apiUrl}
                isDisabled={loading}
                placeholder="例如：https://weknora.example.com/api/v1"
                onChange={(event) => updateConnection('apiUrl', event.target.value)}
              />
            </FormControl>
            <FormControl isRequired={!savedConnection}>
              <FormLabel>API Key</FormLabel>
              <Input
                type="password"
                autoComplete="new-password"
                value={connection.apiKey}
                isDisabled={loading}
                placeholder={savedConnection ? '已保存；留空保持当前密钥' : '请输入 API Key'}
                onChange={(event) => updateConnection('apiKey', event.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>空间 ID（平台 API Key 必填）</FormLabel>
              <Input
                value={connection.tenantId}
                isDisabled={loading}
                onChange={(event) => updateConnection('tenantId', event.target.value)}
              />
            </FormControl>
            <FormControl>
              <FormLabel>WeKnora 网页地址（选填，用于查看来源）</FormLabel>
              <Input
                value={connection.webUrl}
                isDisabled={loading}
                placeholder="例如：https://weknora.example.com"
                onChange={(event) => updateConnection('webUrl', event.target.value)}
              />
            </FormControl>
            <Button
              isLoading={loading}
              onClick={connect}
              isDisabled={!appId || !connection.apiUrl || (!connection.apiKey && !savedConnection)}
            >
              连接并加载知识库
            </Button>
            {error && (
              <Box color="red.600" fontSize="sm">
                {error}
              </Box>
            )}
            {connected && (
              <>
                <FormLabel mb={0}>选择知识库</FormLabel>
                {datasets.length === 0 && <Box color="myGray.500">当前连接没有可访问的知识库</Box>}
                {datasets.map((dataset) => (
                  <Checkbox
                    key={dataset.id}
                    isChecked={draft.datasets.some((item) => item.datasetId === dataset.id)}
                    isDisabled={
                      getWeKnoraSearchModes([dataset]).length === 0 &&
                      !draft.datasets.some((item) => item.datasetId === dataset.id)
                    }
                    onChange={(event) => selectDataset(dataset.id, event.target.checked)}
                  >
                    {dataset.name}
                    {dataset.type === 'faq' ? '（FAQ）' : ''}
                    {getWeKnoraSearchModes([dataset]).length === 0
                      ? '（未启用可用的检索索引）'
                      : ''}
                  </Checkbox>
                ))}
                {missingDatasets.map((item) => (
                  <Checkbox
                    key={item.datasetId}
                    isChecked
                    onChange={() => selectDataset(item.datasetId, false)}
                  >
                    {item.datasetId}（已不可访问，请取消选择）
                  </Checkbox>
                ))}
                <Flex justify="space-between" align="center">
                  <FormLabel mb={0}>检索参数</FormLabel>
                  <Button size="sm" variant="outline" onClick={paramsModal.onOpen}>
                    设置
                  </Button>
                </Flex>
                {!modeAllowed && (
                  <Box color="red.600" fontSize="sm">
                    所选知识库不支持当前检索模式，请调整知识库或检索参数
                  </Box>
                )}
                <FormControl>
                  <FormLabel>每库召回数量</FormLabel>
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={draft.weknoraMatchCount}
                    onChange={(event) =>
                      setDraft((state) => ({
                        ...state,
                        weknoraMatchCount: Number(event.target.value)
                      }))
                    }
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>限定知识 ID（选填，每行一个）</FormLabel>
                  <Textarea
                    value={draft.weknoraKnowledgeIds.join('\n')}
                    onChange={(event) =>
                      setDraft((state) => ({
                        ...state,
                        weknoraKnowledgeIds: event.target.value.split('\n')
                      }))
                    }
                  />
                </FormControl>
                <FormControl>
                  <FormLabel>限定标签 ID（选填，每行一个）</FormLabel>
                  <Textarea
                    value={draft.weknoraTagIds.join('\n')}
                    onChange={(event) =>
                      setDraft((state) => ({
                        ...state,
                        weknoraTagIds: event.target.value.split('\n')
                      }))
                    }
                  />
                </FormControl>
              </>
            )}
          </Stack>
        </ModalBody>
        <ModalFooter gap={3}>
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          <Button
            isDisabled={loading || !connected || !modeAllowed || missingDatasets.length > 0}
            onClick={apply}
          >
            确定
          </Button>
        </ModalFooter>
      </MyModal>
      {paramsModal.isOpen && (
        <DatasetParamsModal
          {...draft}
          maxTokens={16000}
          allowedSearchModes={allowedModes}
          onClose={paramsModal.onClose}
          onSuccess={(params) => {
            setDraft((state) => ({
              ...state,
              searchMode: params.searchMode,
              limit: params.limit!,
              similarity: params.similarity!,
              usingReRank: !!params.usingReRank,
              datasetSearchUsingExtensionQuery: !!params.datasetSearchUsingExtensionQuery,
              datasetSearchExtensionModel: params.datasetSearchExtensionModel,
              datasetSearchExtensionBg: params.datasetSearchExtensionBg || ''
            }));
            paramsModal.onClose();
          }}
        />
      )}
    </>
  );
};

const WeKnoraSettings = (props: Props) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  return (
    <>
      <Flex gap={3} align="center" flexWrap="wrap">
        <Button size="sm" variant="outline" onClick={onOpen}>
          配置连接与知识库
        </Button>
        <Box fontSize="sm" color="myGray.600">
          {props.value.weknoraConnectionId
            ? `已选择 ${props.value.datasets.length} 个知识库`
            : '请填写 Base URL 和 API Key'}
        </Box>
      </Flex>
      {isOpen && <WeKnoraSettingsModal {...props} onClose={onClose} />}
    </>
  );
};

export default React.memo(WeKnoraSettings);
