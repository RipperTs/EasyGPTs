import { useEffect, useState } from 'react';
import { clientInitData } from '@/web/common/system/staticData';
import { useRouter } from 'next/router';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types/index.d';
import { useMemoizedFn, useMount } from 'ahooks';
import { TrackEventName } from '../common/system/constants';

const DEFAULT_SYSTEM_TITLE = 'LLM应用开发平台';

// 初始化上下文数据
export const useInitApp = () => {
  const router = useRouter();
  const { hiId } = router.query as { hiId?: string };
  const { loadGitStar, setInitd, feConfigs } = useSystemStore();
  const [scripts, setScripts] = useState<FastGPTFeConfigsType['scripts']>([]);
  const [title, setTitle] = useState(DEFAULT_SYSTEM_TITLE);

  const initFetch = useMemoizedFn(async () => {
    const {
      feConfigs: { scripts, isPlus, systemTitle }
    } = await clientInitData();

    setTitle(systemTitle?.trim() || DEFAULT_SYSTEM_TITLE);
    setScripts(scripts || []);
    setInitd();
  });

  useMount(() => {
    initFetch();

    const errorTrack = (event: ErrorEvent) => {
      window.umami?.track(TrackEventName.windowError, {
        device: {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          appName: navigator.appName
        },
        error: event,
        url: location.href
      });
    };
    // add window error track
    window.addEventListener('error', errorTrack);

    return () => {
      window.removeEventListener('error', errorTrack);
    };
  });

  useEffect(() => {
    hiId && localStorage.setItem('inviterId', hiId);
  }, [hiId]);

  return {
    feConfigs,
    scripts,
    title
  };
};
