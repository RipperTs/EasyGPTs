import { getPluginGroups, getSystemPlugTemplates } from '@/web/core/app/api/plugin';
import { Box, Flex, Grid, useDisclosure } from '@chakra-ui/react';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { useMemo, useState } from 'react';
import PluginCard from './components/PluginCard';
import { i18nT } from '@fastgpt/web/i18n/utils';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { serviceSideProps } from '@/web/common/utils/i18n';
import ToolkitSideMenu from './components/SideMenu';

const Toolkit = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const { isPc } = useSystem();

  const { data: plugins = [] } = useRequest2(getSystemPlugTemplates, {
    manual: false
  });
  const { data: pluginGroups = [] } = useRequest2(getPluginGroups, {
    manual: false
  });

  const [search, setSearch] = useState('');
  const { isOpen, onOpen, onClose } = useDisclosure();

  const { group: selectedGroup = pluginGroups?.[0]?.groupId, type: selectedType = 'all' } =
    router.query;

  const pluginGroupTypes = useMemo(() => {
    const allTypes = [
      {
        typeId: 'all',
        typeName: i18nT('common:common.All')
      }
    ];
    const currentTypes =
      pluginGroups?.find((group) => group.groupId === selectedGroup)?.groupTypes ?? [];

    return [
      ...allTypes,
      ...currentTypes.filter((type) =>
        plugins.find((plugin) => plugin.templateType === type.typeId)
      )
    ];
  }, [pluginGroups, plugins, selectedGroup]);

  const currentPlugins = useMemo(() => {
    const typeArray = pluginGroupTypes?.map((type) => type.typeId);
    return plugins
      .filter(
        (plugin) =>
          (selectedType === 'all' && typeArray?.includes(plugin.templateType)) ||
          selectedType === plugin.templateType
      )
      .filter((plugin) => {
        const str = `${plugin.name}${plugin.intro}${plugin.instructions}`;
        const regx = new RegExp(search, 'gi');
        return regx.test(str);
      });
  }, [pluginGroupTypes, plugins, selectedType, search]);

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
          router.push({ query: { group: groupId, type: typeId } })
        }
        onClickMcp={() => router.push('/toolkit/mcp')}
        activeMcp={false}
      />
      <Box ml={[0, '200px']} p={[5, 6]}>
        <Flex alignItems={'center'}>
          <Flex flex={1} fontSize={'xl'} fontWeight={'medium'} color={'myGray.900'}>
            {isPc ? (
              <Box>
                {t(
                  pluginGroups?.find((group) => group.groupId === selectedGroup)?.groupName as any
                )}
              </Box>
            ) : (
              <MyIcon name="menu" w={'20px'} mr={1.5} onClick={onOpen} />
            )}
          </Flex>
        </Flex>

        <Grid
          gridTemplateColumns={[
            '1fr',
            'repeat(2,1fr)',
            'repeat(2,1fr)',
            'repeat(3,1fr)',
            'repeat(4,1fr)'
          ]}
          gridGap={4}
          alignItems={'stretch'}
          py={5}
        >
          {currentPlugins.map((item) => (
            <PluginCard key={item.id} item={item} groups={pluginGroups} />
          ))}
        </Grid>
      </Box>
    </Flex>
  );
};

export default Toolkit;

export async function getServerSideProps(context: any) {
  return {
    props: { ...(await serviceSideProps(context, ['app', 'user'])) }
  };
}
