import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import type { ECharts, EChartsOption } from 'echarts';

type Props = {
  option: EChartsOption;
  height?: number | string;
};

const EChartsPanel = ({ option, height = 320 }: Props) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const optionRef = useRef<EChartsOption>(option);

  const heightValue = useMemo(
    () => (typeof height === 'number' ? `${height}px` : height),
    [height]
  );

  useEffect(() => {
    if (!elRef.current) return;

    let chart: ECharts | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let canceled = false;

    (async () => {
      const echarts = await import('echarts');
      if (canceled || !elRef.current) return;

      chart = echarts.init(elRef.current);
      chartRef.current = chart;
      chart.setOption(optionRef.current, { notMerge: true });

      resizeObserver = new ResizeObserver(() => {
        chart?.resize();
      });
      resizeObserver.observe(elRef.current);
    })();

    return () => {
      canceled = true;
      resizeObserver?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    optionRef.current = option;
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <Box ref={elRef} w={'100%'} h={heightValue} />;
};

export default EChartsPanel;
