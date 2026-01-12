import React, { useRef, useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';

import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import dynamic from 'next/dynamic';

import MyRadio from '@/components/common/MyRadio';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { cardStyles } from '../constants';

const Link = dynamic(() => import('./Link'));
const API = dynamic(() => import('./API'));
const FeiShu = dynamic(() => import('./FeiShu'));
const OffiAccount = dynamic(() => import('./OffiAccount'));

const OutLink = () => {
  const appId = useContextSelector(AppContext, (v) => v.appId);

  const publishList = useRef([
    {
      icon: '/imgs/modal/shareFill.svg',
      title: '在线对话窗口',
      desc: '分享链接给其他用户，可直接进行使用',
      value: PublishChannelEnum.share
    },
    {
      icon: 'support/outlink/apikeyFill',
      title: 'API 访问',
      desc: '通过 API 接入到已有系统中，或者企业微信、飞书等',
      value: PublishChannelEnum.apikey
    }
  ]);

  const [linkType, setLinkType] = useState<PublishChannelEnum>(PublishChannelEnum.share);

  return (
    <Box
      display={['block', 'flex']}
      overflowY={'auto'}
      overflowX={'hidden'}
      h={'100%'}
      flexDirection={'column'}
    >
      <Box {...cardStyles} boxShadow={2} px={[4, 8]} py={[4, 6]}>
        <MyRadio
          gridTemplateColumns={[
            'repeat(1,1fr)',
            'repeat(2, 1fr)',
            'repeat(3, 1fr)',
            'repeat(3, 1fr)',
            'repeat(4, 1fr)'
          ]}
          iconSize={'20px'}
          list={publishList.current}
          value={linkType}
          onChange={(e) => {
            setLinkType(e as PublishChannelEnum);
          }}
        />
      </Box>

      <Flex
        flexDirection={'column'}
        {...cardStyles}
        boxShadow={3.5}
        mt={4}
        px={[4, 8]}
        py={[4, 6]}
        flex={1}
      >
        {linkType === PublishChannelEnum.share && (
          <Link appId={appId} type={PublishChannelEnum.share} />
        )}
        {linkType === PublishChannelEnum.apikey && <API appId={appId} />}
        {linkType === PublishChannelEnum.feishu && <FeiShu appId={appId} />}
        {linkType === PublishChannelEnum.officialAccount && <OffiAccount appId={appId} />}
      </Flex>
    </Box>
  );
};

export default OutLink;
