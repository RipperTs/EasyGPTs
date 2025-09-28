import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import NodeCard from './render/NodeCard';
import Container from '../components/Container';
import IOTitle from '../components/IOTitle';
import RenderInput from './render/RenderInput';
import RenderOutput from './render/RenderOutput';
import RenderToolInput from './render/RenderToolInput';
import { useTranslation } from 'next-i18next';
import { FlowNodeOutputTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { useContextSelector } from 'use-context-selector';
import { WorkflowContext } from '../../context';

const NodeTool = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const splitToolInputs = useContextSelector(WorkflowContext, (ctx) => ctx.splitToolInputs);
  const { nodeId, inputs, outputs } = data;
  const { isTool, commonInputs } = splitToolInputs(inputs, nodeId);

  const filterHiddenInputs = useMemo(() => commonInputs.filter((item) => true), [commonInputs]);

  return (
    <NodeCard minW={'350px'} selected={selected} {...data}>
      {isTool && (
        <>
          <Container>
            <RenderToolInput nodeId={nodeId} inputs={inputs} />
          </Container>
        </>
      )}

      {filterHiddenInputs.length > 0 && (
        <>
          <Container>
            <IOTitle text={t('common:common.Input')} />
            <RenderInput nodeId={nodeId} flowInputList={commonInputs} />
          </Container>
        </>
      )}

      {outputs.filter((output) => output.type !== FlowNodeOutputTypeEnum.hidden).length > 0 && (
        <>
          <Container>
            <IOTitle text={t('common:common.Output')} />
            <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
          </Container>
        </>
      )}
    </NodeCard>
  );
};

export default React.memo(NodeTool);
