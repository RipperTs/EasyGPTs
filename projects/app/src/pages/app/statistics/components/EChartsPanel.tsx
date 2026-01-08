import React, { useEffect, useMemo, useRef } from 'react';
import { Box } from '@chakra-ui/react';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';

type Props = {
  option: EChartsOption;
  height?: number | string;
};

const EChartsPanel = ({ option, height = 320 }: Props) => {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);

  const heightValue = useMemo(
    () => (typeof height === 'number' ? `${height}px` : height),
    [height]
  );

  useEffect(() => {
    if (!elRef.current) return;

    const chart = echarts.init(elRef.current);
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.resize();
    });
    resizeObserver.observe(elRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return <Box ref={elRef} w={'100%'} h={heightValue} />;
};

export default EChartsPanel;
