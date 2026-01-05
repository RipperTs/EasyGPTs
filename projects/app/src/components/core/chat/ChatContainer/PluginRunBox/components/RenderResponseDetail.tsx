import { ResponseBox } from '../../../components/WholeResponseModal';
import React from 'react';
import { useContextSelector } from 'use-context-selector';
import { PluginRunContext } from '../context';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { formatTime2YMDHM } from '@fastgpt/global/common/string/time';
const RenderResponseDetail = () => {
  const { histories, isChatting } = useContextSelector(PluginRunContext, (v) => v);
  const { t } = useTranslation();
  const responseData = histories?.[1]?.responseData || [];
  const responseTimeStr = (() => {
    const time = histories?.[1]?.time as unknown;
    if (!time) return '';
    const date = time instanceof Date ? time : new Date(String(time));
    if (Number.isNaN(date.getTime())) return '';
    return formatTime2YMDHM(date);
  })();

  return isChatting ? (
    <>{t('chat:in_progress')}</>
  ) : (
    <Box flex={'1 0 0'} h={'100%'} overflow={'auto'}>
      {!!responseTimeStr && (
        <Box px={3} pt={2} fontSize={'xs'} color={'myGray.500'}>
          {responseTimeStr}
        </Box>
      )}
      <ResponseBox useMobile={true} response={responseData} showDetail={true} />
    </Box>
  );
};

export default RenderResponseDetail;
