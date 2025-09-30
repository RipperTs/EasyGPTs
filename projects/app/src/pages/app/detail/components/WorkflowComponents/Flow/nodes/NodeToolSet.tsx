import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import { Box, Flex, Text } from '@chakra-ui/react';
import { ToolSourceHandle } from './render/Handle/ToolHandle';
import EmptyTip from '@fastgpt/web/components/common/EmptyTip';

const NodeToolSet = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { toolConfig } = data;
  const toolSetConfig = useMemo(() => {
    const configSource =
      (toolConfig?.mcpToolSet as any) ??
      (toolConfig?.httpToolSet as any) ??
      (toolConfig?.systemToolSet as any);
    if (configSource?.toolList?.length) {
      return configSource;
    }
    const inputConfig = (data.inputs || []).find((i: any) => i.key === 'mcpToolSetConfig')?.value;
    if (inputConfig?.toolList?.length) {
      return inputConfig;
    }
    return configSource || inputConfig || {};
  }, [data.inputs, toolConfig?.httpToolSet, toolConfig?.mcpToolSet, toolConfig?.systemToolSet]);

  const toolList: any[] = Array.isArray(toolSetConfig?.toolList) ? toolSetConfig.toolList : [];
  // MCP 工具集：来自 toolConfig.mcpToolSet 或 inputs.mcpToolSetConfig
  const isMcpToolSet = useMemo(() => {
    if (toolConfig?.mcpToolSet) return true;
    const inputConfig = (data.inputs || []).find((i: any) => i.key === 'mcpToolSetConfig');
    return !!inputConfig;
  }, [data.inputs, toolConfig?.mcpToolSet]);
  const title = useMemo(() => {
    const baseTitle = 'MCP 工具列表';
    return toolList.length ? `${baseTitle} (${toolList.length})` : baseTitle;
  }, [toolList.length]);
  const displayUrl = useMemo(
    () => toolSetConfig?.url || toolSetConfig?.baseUrl,
    [toolSetConfig?.baseUrl, toolSetConfig?.url]
  );

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      <Container>
        <Box px={1} pb={2}>
          <Text fontSize={'14px'} fontWeight={'600'} color={'myGray.900'}>
            {title}
          </Text>
          {displayUrl && (
            <Text mt={1} fontSize={'12px'} color={'myGray.500'} className="textEllipsis">
              接入地址：{displayUrl}
            </Text>
          )}
        </Box>
        <Box maxH={'500px'} overflowY={'auto'} className="nowheel">
          {toolList.length === 0 ? (
            <EmptyTip text="暂无工具" py={6} />
          ) : (
            toolList.map((tool: any, index: number) => (
              <Flex
                key={index}
                borderBottom={'1px solid'}
                borderColor={'myGray.200'}
                alignItems={'center'}
                py={2}
                px={3}
              >
                <Box w={'20px'} fontSize={'14px'} color={'myGray.500'} fontWeight={'medium'}>
                  {index + 1 < 10 ? `0${index + 1}` : index + 1}
                </Box>
                <Box maxW={'full'} pl={2} position="relative" width="400px">
                  <Box
                    fontSize={'14px'}
                    color={'myGray.900'}
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {tool.name}
                  </Box>
                  <Box
                    fontSize={'12px'}
                    color={'myGray.500'}
                    whiteSpace="nowrap"
                    overflow="hidden"
                    textOverflow="ellipsis"
                  >
                    {tool.description || '暂无描述'}
                  </Box>
                </Box>
                <Box flex={1} />
              </Flex>
            ))
          )}
        </Box>
      </Container>
      {/* MCP 工具集不展示底部紫色连接点，保持与插件/单独 MCP 插件一致 */}
      {!isMcpToolSet && <ToolSourceHandle nodeId={data.nodeId} />}
    </NodeCard>
  );
};

export default React.memo(NodeToolSet);
