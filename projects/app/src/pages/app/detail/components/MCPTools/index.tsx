import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Flex,
  Button,
  Input,
  Textarea,
  NumberInput,
  NumberInputField,
  Switch,
  Select,
  useToast
} from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import dynamic from 'next/dynamic';
import { AppContext } from '../context';
import { getMCPTools, postRunMCPTool, postUpdateMCPTools } from '@/web/core/app/api/plugin';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { cardStyles } from '../constants';
import styles from '../SimpleApp/styles.module.scss';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import FolderPath from '@/components/common/folder/Path';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getAppFolderPath } from '@/web/core/app/api/app';
import { useRouter } from 'next/router';

type McpTool = { name: string; description: string; inputSchema: any };

const Field = ({
  label,
  children,
  required
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) => (
  <Box mb={3}>
    <Box fontSize={'sm'} color={'myGray.600'} mb={1}>
      {label}
      {required && (
        <Box as={'span'} color={'red.500'} ml={1}>
          *
        </Box>
      )}
    </Box>
    {children}
  </Box>
);

const MCPTools: React.FC = () => {
  const toast = useToast();
  const appDetail = useContextSelector(AppContext, (v) => v.appDetail);

  const mcpConfig = useMemo(() => {
    const node = appDetail?.modules?.[0];
    const val = node?.inputs?.find((i: any) => i.key === 'mcpToolSetConfig')?.value || {};
    const {
      url = '',
      headers = {},
      toolList = []
    } = val as {
      url?: string;
      headers?: Record<string, string>;
      toolList?: McpTool[];
    };
    return { url, headers, toolList };
  }, [appDetail?.modules]);

  const [url, setUrl] = useState<string>(mcpConfig.url);
  const [headers, setHeaders] = useState<Record<string, string>>(mcpConfig.headers || {});
  const [tools, setTools] = useState<McpTool[]>(mcpConfig.toolList || []);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const selectedTool = tools[selectedIndex];
  const [params, setParams] = useState<Record<string, any>>({});
  const [runResult, setRunResult] = useState<string>('');
  const [isRunning, setIsRunning] = useState<boolean>(false);

  useEffect(() => {
    setUrl(mcpConfig.url);
    setHeaders(mcpConfig.headers || {});
    setTools(mcpConfig.toolList || []);
    setSelectedIndex(0);
    setParams({});
    setRunResult('');
    setIsRunning(false);
  }, [mcpConfig]);

  const onParse = async () => {
    try {
      const list = await getMCPTools({ url, headers });
      setTools(list);
      setSelectedIndex(0);
      setParams({});
      toast({ title: '解析成功', status: 'success' });
    } catch (e: any) {
      toast({ title: e?.message || '解析失败', status: 'error' });
    }
  };

  const { mutate: onSave, isLoading: saving } = useRequest({
    mutationFn: () =>
      postUpdateMCPTools({ appId: appDetail._id, url, headers, toolList: tools || [] }),
    successToast: '更新成功',
    errorToast: '更新失败'
  });

  const renderParamInput = (key: string, schema: any, required?: boolean) => {
    const type = schema.type;
    const enumList: string[] | undefined = schema.enum;
    const value = params[key];
    const description = schema.description || '';

    if (enumList && enumList.length > 0) {
      return (
        <Field key={key} label={`${key} (${type})`} required={required}>
          <Select
            bg={'myWhite.600'}
            value={value ?? enumList[0]}
            onChange={(e) => setParams((s) => ({ ...s, [key]: e.target.value }))}
          >
            {enumList.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
      );
    }
    if (type === 'string') {
      return (
        <Field key={key} label={`${key} (${type})`} required={required}>
          <Input
            bg={'myWhite.600'}
            value={value ?? ''}
            onChange={(e) => setParams((s) => ({ ...s, [key]: e.target.value }))}
            placeholder={description}
          />
        </Field>
      );
    }
    if (type === 'number' || type === 'integer') {
      return (
        <Field key={key} label={`${key} (${type})`} required={required}>
          <NumberInput
            value={value ?? ''}
            onChange={(v) => setParams((s) => ({ ...s, [key]: Number(v) }))}
          >
            <NumberInputField bg={'myWhite.600'} placeholder={description} />
          </NumberInput>
        </Field>
      );
    }
    if (type === 'boolean') {
      return (
        <Field key={key} label={`${key} (${type})`} required={required}>
          <Flex alignItems={'center'}>
            <Switch
              isChecked={!!value}
              onChange={(e) => setParams((s) => ({ ...s, [key]: e.target.checked }))}
            />
            {description && (
              <Box ml={2} fontSize={'sm'} color={'myGray.600'}>
                {description}
              </Box>
            )}
          </Flex>
        </Field>
      );
    }
    // object/array 采用 JSON 文本
    return (
      <Field key={key} label={`${key} (${type})`} required={required}>
        <Textarea
          rows={4}
          bg={'myWhite.600'}
          value={typeof value === 'string' ? value : JSON.stringify(value ?? '', null, 2)}
          onChange={(e) => setParams((s) => ({ ...s, [key]: e.target.value }))}
          placeholder={description || '请输入 JSON 文本'}
        />
      </Field>
    );
  };

  const onRun = async () => {
    if (!selectedTool) return;
    setIsRunning(true);
    const formatParams: Record<string, any> = { ...params };
    // 尝试解析 JSON 文本字段
    Object.entries(selectedTool.inputSchema?.properties || {}).forEach(([k, v]: any) => {
      const tp = v?.type;
      if ((tp === 'object' || tp === 'array') && typeof formatParams[k] === 'string') {
        try {
          formatParams[k] = JSON.parse(formatParams[k]);
        } catch {}
      }
      if (tp === 'number' || tp === 'integer') {
        if (formatParams[k] !== undefined) formatParams[k] = Number(formatParams[k]);
      }
      if (tp === 'boolean') {
        if (typeof formatParams[k] === 'string') {
          formatParams[k] = formatParams[k] === 'true';
        }
      }
    });
    try {
      const res = await postRunMCPTool({
        url,
        toolName: selectedTool.name,
        headers,
        params: formatParams
      });
      setRunResult(typeof res === 'string' ? res : JSON.stringify(res, null, 2));
    } catch (e: any) {
      setRunResult(e?.message || '调用失败');
    } finally {
      setIsRunning(false);
    }
  };

  const AppCard = useMemo(() => dynamic(() => import('../SimpleApp/AppCard')), []);
  const { isPc } = useSystem();
  const router = useRouter();
  const appId = useContextSelector(AppContext, (v) => v.appId);
  const { data: paths = [] } = useRequest2(() => getAppFolderPath(appId), {
    manual: false,
    refreshDeps: [appId]
  });
  const onclickRoute = (parentId: string) => {
    router.push({ pathname: '/app/list', query: { parentId } });
  };

  return (
    <Flex h={'100%'} flexDirection={'column'} px={[3, 0]} pr={[3, 3]} pb={3}>
      {/* 顶部面包屑导航 */}
      <Flex pt={[2, 3]} alignItems={'flex-start'} mb={[2, 3]}>
        <Box flex={'1'}>
          <FolderPath
            rootName={'全部应用'}
            paths={paths}
            hoverStyle={{ color: 'primary.600' }}
            onClick={onclickRoute}
          />
        </Box>
      </Flex>

      {/* 主体内容区域：左右布局 */}
      <Flex flex={'1 0 0'} h={0} gap={[0, 1]} flexDirection={['column', 'row']}>
        {/* 左侧：应用介绍、MCP地址、工具列表 */}
        <Box
          className={styles.EditAppBox}
          minW={['auto', '580px']}
          flex={'1'}
          overflowY={'auto'}
          pr={[0, 1]}
        >
          {/* 应用介绍卡片 */}
          <Box {...cardStyles} boxShadow={'2'} mb={4}>
            <AppCard />
          </Box>

          {/* MCP 地址配置 */}
          <Box {...cardStyles} boxShadow={'3.5'} p={4} mb={4}>
            <Box fontWeight={'600'} mb={3}>
              MCP 地址
            </Box>
            <Flex gap={2} alignItems={'center'}>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} bg={'myWhite.600'} />
              <Button onClick={onParse} variant={'whitePrimary'}>
                解析
              </Button>
              <Button onClick={() => onSave()} isLoading={saving}>
                保存
              </Button>
            </Flex>
            <Box mt={3} fontWeight={'600'}>
              鉴权配置
            </Box>
            <Box mt={2}>
              {Object.entries(headers).map(([k, v]) => (
                <Flex key={k} gap={2} alignItems={'center'} mb={2}>
                  <Input
                    value={k}
                    onChange={(e) => {
                      const nv = e.target.value;
                      setHeaders((s) => {
                        const ns: Record<string, string> = {};
                        Object.keys(s).forEach((key) => {
                          ns[key === k ? nv : key] = s[key];
                        });
                        return ns;
                      });
                    }}
                    bg={'myWhite.600'}
                    placeholder={'Header Key'}
                  />
                  <Input
                    value={v}
                    onChange={(e) => setHeaders((s) => ({ ...s, [k]: e.target.value }))}
                    bg={'myWhite.600'}
                    placeholder={'Header Value'}
                  />
                  <Button
                    variant={'whiteBase'}
                    onClick={() =>
                      setHeaders((s) => {
                        const ns = { ...s };
                        delete ns[k];
                        return ns;
                      })
                    }
                  >
                    删除
                  </Button>
                </Flex>
              ))}
              <Button
                mt={1}
                variant={'whiteBase'}
                onClick={() => {
                  // 生成一个唯一的key名称
                  let newKey = 'Authorization';
                  let index = 1;
                  while (headers.hasOwnProperty(newKey)) {
                    newKey = `Header${index}`;
                    index++;
                  }
                  setHeaders((s) => ({ ...s, [newKey]: '' }));
                }}
              >
                添加 Header
              </Button>
            </Box>
          </Box>

          {/* 工具列表 */}
          <Box {...cardStyles} boxShadow={'3.5'} p={4}>
            <Box fontWeight={'600'} mb={3}>
              工具列表：{tools.length}
            </Box>
            <Box>
              {tools.map((t, i) => (
                <Flex
                  key={t.name}
                  p={3}
                  borderWidth={'1px'}
                  borderColor={i === selectedIndex ? 'primary.600' : 'myGray.200'}
                  borderRadius={'md'}
                  _notLast={{ mb: 2 }}
                  cursor={'pointer'}
                  onClick={() => {
                    setSelectedIndex(i);
                    setParams({});
                    setRunResult('');
                  }}
                  _hover={{ borderColor: 'primary.400', bg: 'myGray.50' }}
                >
                  <Box w={'20px'} color={'myGray.500'} mt={1}>
                    {String(i + 1).padStart(2, '0')}
                  </Box>
                  <Box ml={2} flex={1}>
                    <Box fontWeight={'600'}>{t.name}</Box>
                    <Box color={'myGray.600'} fontSize={'sm'} mt={1} noOfLines={2}>
                      {t.description}
                    </Box>
                  </Box>
                </Flex>
              ))}
            </Box>
          </Box>
        </Box>

        {/* 右侧：调试预览 */}
        {isPc && (
          <Box
            {...cardStyles}
            boxShadow={'3'}
            flex={'2 0 0'}
            w={0}
            p={4}
            display={'flex'}
            flexDirection={'column'}
          >
            <Box fontWeight={'600'} fontSize={'md'} mb={3}>
              调试预览
            </Box>

            {!selectedTool ? (
              <Flex flex={'1'} alignItems={'center'} justifyContent={'center'}>
                <Box color={'myGray.500'} textAlign={'center'}>
                  请选择左侧工具进行调试
                </Box>
              </Flex>
            ) : (
              <Box display={'flex'} flexDirection={'column'} flex={'1'} overflow={'hidden'}>
                {/* 工具信息头部 */}
                <Box pb={3} borderBottom={'1px solid'} borderColor={'myGray.100'}>
                  <Box fontWeight={'600'} fontSize={'sm'} color={'myGray.900'}>
                    {selectedTool?.name}
                  </Box>
                  <Box color={'myGray.600'} fontSize={'xs'} mt={1}>
                    {selectedTool?.description}
                  </Box>
                </Box>

                {/* 参数和结果区域 */}
                <Box flex={'1'} display={'flex'} flexDirection={'column'} overflow={'auto'} pt={4}>
                  {/* 输入参数 */}
                  {Object.entries(selectedTool?.inputSchema?.properties || {}).length > 0 && (
                    <Box mb={4}>
                      <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.700'} mb={3}>
                        输入
                      </Box>
                      {Object.entries(selectedTool?.inputSchema?.properties || {}).map(
                        ([key, schema]: any) =>
                          renderParamInput(
                            key,
                            schema,
                            selectedTool?.inputSchema?.required?.includes(key)
                          )
                      )}
                    </Box>
                  )}

                  {/* 运行按钮 */}
                  <Button
                    onClick={onRun}
                    isLoading={isRunning}
                    loadingText="运行中..."
                    colorScheme={'blue'}
                    mb={4}
                    w={'100px'}
                  >
                    运行
                  </Button>

                  {/* 输出结果 */}
                  <Box flex={'1'}>
                    <Flex alignItems={'center'} justifyContent={'space-between'} mb={2}>
                      <Box fontSize={'sm'} fontWeight={'500'} color={'myGray.700'}>
                        输出
                      </Box>
                      {runResult && (
                        <Button
                          size={'xs'}
                          variant={'ghost'}
                          onClick={() => {
                            navigator.clipboard.writeText(runResult);
                            toast({ title: '已复制', status: 'success', duration: 2000 });
                          }}
                        >
                          复制
                        </Button>
                      )}
                    </Flex>
                    <Box
                      bg={'#1e1e1e'}
                      borderRadius={'md'}
                      p={4}
                      minH={'200px'}
                      maxH={'400px'}
                      overflowY={'auto'}
                      css={{
                        '&::-webkit-scrollbar': {
                          width: '8px'
                        },
                        '&::-webkit-scrollbar-track': {
                          background: 'transparent'
                        },
                        '&::-webkit-scrollbar-thumb': {
                          background: '#4a5568',
                          borderRadius: '4px'
                        }
                      }}
                    >
                      {isRunning ? (
                        <Flex alignItems={'center'} color={'gray.400'}>
                          <Box mr={2}>正在执行...</Box>
                        </Flex>
                      ) : runResult ? (
                        <Box
                          as={'pre'}
                          color={'gray.100'}
                          fontSize={'13px'}
                          lineHeight={'1.5'}
                          whiteSpace={'pre-wrap'}
                          wordBreak={'break-word'}
                          fontFamily={'Monaco, Menlo, Consolas, "Courier New", monospace'}
                          m={0}
                        >
                          {runResult}
                        </Box>
                      ) : (
                        <Box
                          color={'gray.500'}
                          fontSize={'13px'}
                          fontFamily={'Monaco, Menlo, Consolas, "Courier New", monospace'}
                        >
                          {'// 点击运行按钮查看结果'}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Flex>
    </Flex>
  );
};

export default MCPTools;
