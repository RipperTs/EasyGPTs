import React, { useMemo, useState } from 'react';
import MyModal from '@fastgpt/web/components/common/MyModal';
import { Box, Flex, HStack, ModalBody } from '@chakra-ui/react';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import MyIconButton from '@fastgpt/web/components/common/Icon/button';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { McpKeyType } from '@fastgpt/global/support/mcp/type';

type LinkWay = 'http' | 'sse';

const UsageModal = ({ mcp, onClose }: { mcp: McpKeyType; onClose: () => void }) => {
  const { feConfigs } = useSystemStore();
  const [linkWay, setLinkWay] = useState<LinkWay>('http');

  const { url, jsonConfig } = useMemo(() => {
    if (linkWay === 'http') {
      const baseUrl = feConfigs?.customApiDomain || `${location.origin}/api`;
      const url = `${baseUrl}/mcp/app/${mcp.key}/mcp`;
      const jsonConfig = `{
  "mcpServers": {
    "mcp-${mcp._id}": { 
      "url": "${url}" 
    }
  }
}`;
      return { url, jsonConfig };
    }
    const url = feConfigs?.mcpServerProxyEndpoint
      ? `${feConfigs.mcpServerProxyEndpoint}/${mcp.key}/sse`
      : '';
    const jsonConfig = `{
  "mcpServers": {
    "mcp-${mcp._id}": { 
      "url": "${url}" 
    }
  }
}`;
    return { url, jsonConfig };
  }, [
    feConfigs?.customApiDomain,
    feConfigs?.mcpServerProxyEndpoint,
    feConfigs?.systemTitle,
    linkWay,
    mcp._id,
    mcp.key
  ]);

  return (
    <MyModal iconSrc="support/team/key" isOpen title={'MCP 服务使用方式'} onClose={onClose}>
      <ModalBody>
        <Flex>
          <LightRowTabs<LinkWay>
            m={'auto'}
            w={'100%'}
            list={[
              { label: 'Streamable HTTP', value: 'http' },
              { label: 'SSE', value: 'sse' }
            ]}
            value={linkWay}
            onChange={setLinkWay}
          />
        </Flex>

        {url ? (
          <>
            <Box mt={4}>
              <FormLabel>服务接入地址</FormLabel>
              <HStack mt={0.5} bg={'myGray.50'} px={2} py={1} borderRadius={'md'} fontSize={'sm'}>
                <Box
                  userSelect={'all'}
                  flex={'1 0 0'}
                  whiteSpace={'pre-wrap'}
                  wordBreak={'break-all'}
                >
                  {url}
                </Box>
                <MyIconButton icon="copy" onClick={() => navigator.clipboard?.writeText(url)} />
              </HStack>
            </Box>

            <Box mt={4}>
              <Box borderRadius={'md'} bg={'myGray.100'} overflow={'hidden'} fontSize={'sm'}>
                <Flex
                  p={3}
                  bg={'myWhite.500'}
                  border={'base'}
                  borderTopLeftRadius={'md'}
                  borderTopRightRadius={'md'}
                >
                  <Box flex={1}>客户端配置</Box>
                  <MyIconButton
                    icon="copy"
                    onClick={() => navigator.clipboard?.writeText(jsonConfig)}
                  />
                </Flex>
                <Box whiteSpace={'pre-wrap'} wordBreak={'break-all'} p={3} overflowX={'auto'}>
                  {jsonConfig}
                </Box>
              </Box>
            </Box>
          </>
        ) : (
          <Flex h={'200px'} justifyContent={'center'} alignItems={'center'}>
            未配置 mcpServerProxyEndpoint，无法使用 SSE 方式
          </Flex>
        )}
      </ModalBody>
    </MyModal>
  );
};

export default React.memo(UsageModal);
