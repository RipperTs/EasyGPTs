import { Box, Flex, useDisclosure } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { serviceSideProps } from '@/web/common/utils/i18n';
import ToolkitSideMenu from './components/SideMenu';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { useRouter } from 'next/router';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { useMemo } from 'react';
import { i18nT } from '@fastgpt/web/i18n/utils';

const MCPPage = () => {
  const { isPc } = useSystem();
  const router = useRouter();
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, { manual: false });
  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, { manual: false });

  // MCP页不默认选中任何分组/类型，避免与“MCP服务”同时高亮
  const { group: selectedGroup, type: selectedType } = router.query as any;

  const pluginGroupTypes = useMemo(() => {
    const allTypes = [{ typeId: 'all', typeName: i18nT('common:common.All') }];
    const currentTypes =
      pluginGroups?.find((group: any) => group.groupId === selectedGroup)?.groupTypes ?? [];
    return [
      ...allTypes,
      ...currentTypes.filter((type: any) =>
        plugins.find((plugin: any) => plugin.templateType === type.typeId)
      )
    ];
  }, [pluginGroups, plugins, selectedGroup]);

  return (
    <Flex flexDirection={'column'} h={'100%'} overflow={'auto'}>
      <ToolkitSideMenu
        isPc={isPc}
        isOpen={isOpen}
        onClose={onClose}
        pluginGroups={pluginGroups}
        selectedGroup={selectedGroup as any}
        selectedType={selectedType as any}
        onSelectGroupType={(groupId, typeId) =>
          router.push({ pathname: '/toolkit', query: { group: groupId, type: typeId } })
        }
        onClickMcp={() => router.push('/toolkit/mcp')}
        activeMcp
      />

      <Box ml={[0, '200px']} p={[5, 6]}>
        <Flex alignItems={'center'}>
          <Flex flex={1} fontSize={'xl'} fontWeight={'medium'} color={'myGray.900'}>
            {isPc ? (
              <Box>MCP服务</Box>
            ) : (
              <MyIcon name="menu" w={'20px'} mr={1.5} onClick={onOpen} />
            )}
          </Flex>
        </Flex>

        <Flex
          h={'calc(100vh - 80px)'}
          alignItems={'center'}
          justifyContent={'center'}
          flexDirection={'column'}
        >
          <MyIcon name={'core/app/modelsConfig'} w={'32px'} h={'32px'} color={'myGray.500'} />
          <Box mt={3} fontSize={'lg'} color={'myGray.900'} fontWeight={'medium'}>
            MCP服务
          </Box>
          <Box mt={2} color={'myGray.500'}>
            页面建设中...
          </Box>
        </Flex>
      </Box>
    </Flex>
  );
};

export default MCPPage;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['app', 'user'])) }
  };
}
