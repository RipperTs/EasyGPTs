import { Box, Flex } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { navbarWidth } from '@/components/Layout';
import { useTranslation } from 'next-i18next';

export interface ToolkitSideMenuProps {
  isPc: boolean;
  isOpen: boolean;
  onClose: () => void;
  pluginGroups: any[];
  selectedGroup?: string | string[];
  selectedType?: string | string[];
  onSelectGroupType: (groupId: string, typeId: string) => void;
  onClickMcp: () => void;
  activeMcp?: boolean;
}

const ToolkitSideMenu = ({
  isPc,
  isOpen,
  onClose,
  pluginGroups = [],
  selectedGroup,
  selectedType,
  onSelectGroupType,
  onClickMcp,
  activeMcp
}: ToolkitSideMenuProps) => {
  const { t } = useTranslation();
  const selectedGroupStr = selectedGroup ? String(selectedGroup) : undefined;
  const selectedTypeStr = selectedType ? String(selectedType) : undefined;
  // MCP页时不突出任何系统插件分组与类型
  const effectiveGroup = activeMcp ? undefined : selectedGroupStr;
  const effectiveType = activeMcp ? undefined : selectedTypeStr;

  return (
    <>
      {/* Mask */}
      {!isPc && isOpen && (
        <Box
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bg="blackAlpha.600"
          onClick={onClose}
          zIndex={99}
        />
      )}

      {/* Sidebar */}
      {(isPc || isOpen) && (
        <Box
          position={'fixed'}
          left={isPc ? navbarWidth : 0}
          top={0}
          bg={'myGray.25'}
          w={['60vw', '200px']}
          h={'full'}
          borderLeft={'1px solid'}
          borderRight={'1px solid'}
          borderColor={'myGray.200'}
          pt={4}
          px={2.5}
          pb={2.5}
          zIndex={100}
          userSelect={'none'}
        >
          {pluginGroups.map((group: any) => {
            const groupIdStr = String(group.groupId);
            // 计算该分组下需要展示的类型：all + 该分组的类型中在插件列表中出现过的类型
            const types = [
              { typeId: 'all', typeName: t('common:common.All') as any },
              ...((group.groupTypes || []) as any[])
            ];

            return (
              <Box key={group.groupId}>
                <Flex
                  p={2}
                  mb={0.5}
                  fontSize={'sm'}
                  rounded={'md'}
                  color={'myGray.900'}
                  cursor={'pointer'}
                  _hover={{ bg: 'primary.50' }}
                  onClick={() => {
                    onSelectGroupType(group.groupId, 'all');
                    onClose();
                  }}
                >
                  <Avatar src={group.groupAvatar} w={'1rem'} mr={1.5} color={'primary.600'} />
                  <Box>{t(group.groupName as any)}</Box>
                </Flex>

                {/* 显示所有二级类型 */}
                {types.map((type: any) => (
                  <Flex
                    key={String(type.typeId)}
                    fontSize={'14px'}
                    fontWeight={500}
                    rounded={'md'}
                    py={2}
                    pl={'30px'}
                    cursor={'pointer'}
                    mb={0.5}
                    _hover={{ bg: 'primary.50' }}
                    {...(groupIdStr === effectiveGroup && String(type.typeId) === effectiveType
                      ? { bg: 'primary.50', color: 'primary.600' }
                      : { bg: 'transparent', color: 'myGray.500' })}
                    onClick={() => {
                      onSelectGroupType(group.groupId, String(type.typeId));
                      onClose();
                    }}
                  >
                    {t(type.typeName as any)}
                  </Flex>
                ))}
              </Box>
            );
          })}

          {/* MCP 服务：同级菜单入口 */}
          <Flex
            p={2}
            mt={2}
            mb={0.5}
            fontSize={'sm'}
            rounded={'md'}
            cursor={'pointer'}
            _hover={{ bg: 'primary.50' }}
            {...(activeMcp
              ? { bg: 'primary.50', color: 'primary.600' }
              : { bg: 'transparent', color: 'myGray.900' })}
            onClick={() => {
              onClickMcp();
              onClose();
            }}
          >
            <MyIcon name={'core/app/type/mcp'} w={'1rem'} mr={1.5} color={'primary.600'} />
            <Box>MCP服务</Box>
          </Flex>
        </Box>
      )}
    </>
  );
};

export default ToolkitSideMenu;
