import Markdown from '@/components/Markdown';
import {
  Accordion,
  AccordionButton,
  AccordionIcon,
  AccordionItem,
  AccordionPanel,
  Box,
  Button,
  Flex,
  HStack
} from '@chakra-ui/react';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import {
  AIChatItemValueItemType,
  ToolModuleResponseItemType,
  UserChatItemValueItemType
} from '@fastgpt/global/core/chat/type';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import Avatar from '@fastgpt/web/components/common/Avatar';
import { InteractiveNodeResponseItemType } from '@fastgpt/global/core/workflow/template/system/userSelect/type';
import { isEqual } from 'lodash';
import { onSendPrompt } from '../ChatContainer/useChat';

type props = {
  value: UserChatItemValueItemType | AIChatItemValueItemType;
  isLastChild: boolean;
  isChatting: boolean;
};

const RenderText = React.memo(function RenderText({
  showAnimation,
  text
}: {
  showAnimation: boolean;
  text?: string;
}) {
  let source = (text || '').trim();

  // First empty line
  // if (!source && !isLastChild) return null;

  return <Markdown source={source} showAnimation={showAnimation} />;
});
const RenderTool = React.memo(
  function RenderTool({
    showAnimation,
    tools
  }: {
    showAnimation: boolean;
    tools: ToolModuleResponseItemType[];
  }) {
    return (
      <Box>
        {tools.map((tool) => {
          const toolParams = (() => {
            try {
              return JSON.stringify(JSON.parse(tool.params), null, 2);
            } catch (error) {
              return tool.params;
            }
          })();
          const toolResponse = (() => {
            try {
              return JSON.stringify(JSON.parse(tool.response), null, 2);
            } catch (error) {
              return tool.response;
            }
          })();

          return (
            <Accordion key={tool.id} allowToggle>
              <AccordionItem borderTop={'none'} borderBottom={'none'}>
                <AccordionButton
                  w={'auto'}
                  bg={'white'}
                  borderRadius={'md'}
                  borderWidth={'1px'}
                  borderColor={'myGray.200'}
                  boxShadow={'1'}
                  pl={3}
                  pr={2.5}
                  _hover={{
                    bg: 'auto'
                  }}
                >
                  <Avatar src={tool.toolAvatar} w={'1.25rem'} h={'1.25rem'} borderRadius={'sm'} />
                  <Box mx={2} fontSize={'sm'} color={'myGray.900'}>
                    {tool.toolName}
                  </Box>
                  {showAnimation && !tool.response && <MyIcon name={'common/loading'} w={'14px'} />}
                  <AccordionIcon color={'myGray.600'} ml={5} />
                </AccordionButton>
                <AccordionPanel
                  py={0}
                  px={0}
                  mt={3}
                  borderRadius={'md'}
                  overflow={'hidden'}
                  maxH={'500px'}
                  overflowY={'auto'}
                >
                  {toolParams && toolParams !== '{}' && (
                    <Box mb={3}>
                      <Markdown
                        source={`~~~json#Input
${toolParams}`}
                      />
                    </Box>
                  )}
                  {toolResponse && (
                    <Markdown
                      source={`~~~json#Response
${toolResponse}`}
                    />
                  )}
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          );
        })}
      </Box>
    );
  },
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

const RenderResoningContent = React.memo(function RenderResoningContent({
  content,
  showAnimation
}: {
  content: string;
  showAnimation: boolean;
}) {
  return (
    <Accordion allowToggle defaultIndex={0}>
      <AccordionItem borderTop={'none'} borderBottom={'none'}>
        <AccordionButton
          w={'auto'}
          bg={'white'}
          borderRadius={'md'}
          borderWidth={'1px'}
          borderColor={'myGray.200'}
          boxShadow={'1'}
          pl={3}
          pr={2.5}
          py={1}
          _hover={{
            bg: 'auto'
          }}
        >
          <HStack mr={2} spacing={1}>
            <MyIcon name={'core/chat/think'} w={'0.85rem'} />
            <Box fontSize={'sm'}>思考过程</Box>
          </HStack>

          {showAnimation && <MyIcon name={'common/loading'} w={'0.85rem'} />}
          <AccordionIcon color={'myGray.600'} ml={5} />
        </AccordionButton>
        <AccordionPanel
          py={0}
          pr={0}
          pl={3}
          mt={2}
          borderLeft={'2px solid'}
          borderColor={'myGray.300'}
          color={'myGray.500'}
        >
          <Markdown source={content} />
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
});

const RenderInteractive = React.memo(function RenderInteractive({
  interactive
}: {
  interactive: InteractiveNodeResponseItemType;
}) {
  return (
    <>
      {interactive?.params?.description && <Markdown source={interactive.params.description} />}
      <Flex flexDirection={'column'} gap={2} w={'250px'}>
        {interactive.params.userSelectOptions?.map((option) => {
          const selected = option.value === interactive?.params?.userSelectedVal;

          return (
            <Button
              key={option.key}
              variant={'whitePrimary'}
              whiteSpace={'pre-wrap'}
              isDisabled={interactive?.params?.userSelectedVal !== undefined}
              {...(selected
                ? {
                    _disabled: {
                      cursor: 'default',
                      borderColor: 'primary.300',
                      bg: 'primary.50 !important',
                      color: 'primary.600'
                    }
                  }
                : {})}
              onClick={() => {
                onSendPrompt({
                  text: option.value,
                  isInteractivePrompt: true
                });
              }}
            >
              {option.value}
            </Button>
          );
        })}
      </Flex>
    </>
  );
});

const AIResponseBox = ({ value, isLastChild, isChatting }: props) => {
  if (value.type === ChatItemValueTypeEnum.text && value.text)
    return <RenderText showAnimation={isChatting && isLastChild} text={value.text.content} />;
  if (value.type === ChatItemValueTypeEnum.reasoning && value.reasoning)
    return <RenderResoningContent showAnimation={isChatting} content={value.reasoning.content} />;
  if (value.type === ChatItemValueTypeEnum.tool && value.tools)
    return <RenderTool showAnimation={isChatting && isLastChild} tools={value.tools} />;
  if (
    value.type === ChatItemValueTypeEnum.interactive &&
    value.interactive &&
    value.interactive.type === 'userSelect'
  )
    return <RenderInteractive interactive={value.interactive} />;
};

export default React.memo(AIResponseBox);
