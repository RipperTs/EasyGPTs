import React, { useMemo } from 'react';
import { useContextSelector } from 'use-context-selector';
import WeKnoraSettings from '@/components/core/app/WeKnoraSettings';
import { WorkflowContext } from '@/pages/app/detail/components/WorkflowComponents/context';
import { getWeKnoraSettingsFromInputs } from '@fastgpt/global/core/dataset/weknora';
import type { RenderInputProps } from '../type';

const SelectWeKnoraDataset = ({ inputs = [], nodeId }: RenderInputProps) => {
  const appId = useContextSelector(WorkflowContext, (context) => context.appId);
  const onChangeNode = useContextSelector(WorkflowContext, (context) => context.onChangeNode);
  const settings = useMemo(() => getWeKnoraSettingsFromInputs(inputs), [inputs]);

  return (
    <WeKnoraSettings
      appId={appId || ''}
      value={settings}
      onChange={(value) => {
        for (const [key, inputValue] of Object.entries(value)) {
          const input = inputs.find((item) => item.key === key);
          if (!input) continue;
          onChangeNode({
            nodeId,
            type: 'updateInput',
            key,
            value: { ...input, value: inputValue }
          });
        }
      }}
    />
  );
};

export default React.memo(SelectWeKnoraDataset);
