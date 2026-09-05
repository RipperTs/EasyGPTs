import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import type { WeKnoraSearchSettings } from '@fastgpt/global/core/dataset/weknora';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { getWeKnoraConnection } from '../../../dataset/weknora/connection';
import { searchWeKnora } from '../../../dataset/weknora/search';
import type { DatasetSearchResponse } from './search';

export const dispatchWeKnoraSearch = async (
  props: ModuleDispatchProps<WeKnoraSearchSettings & { userChatInput: string }>
): Promise<DatasetSearchResponse> => {
  const { params, runningAppInfo, abortSignal } = props;
  const query = params.userChatInput?.trim();
  if (!query) throw new Error('请输入需要检索的问题');
  if (!Array.isArray(params.datasets) || params.datasets.length === 0) {
    throw new Error('请选择 WeKnoraX 知识库');
  }
  if (!Number.isFinite(params.limit) || params.limit < 100) {
    throw new Error('引用长度必须不少于 100 Token');
  }

  const connection = await getWeKnoraConnection({
    connectionId: params.weknoraConnectionId,
    appId: runningAppInfo.id,
    teamId: runningAppInfo.teamId
  });
  const quoteQA = await searchWeKnora({ connection, settings: params, query, signal: abortSignal });

  return {
    quoteQA,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      query,
      limit: params.limit,
      quoteList: quoteQA,
      nodeInputs: { datasets: params.datasets }
    },
    nodeDispatchUsages: [],
    [DispatchNodeResponseKeyEnum.toolResponses]: quoteQA.map((item) => ({
      id: item.id,
      text: item.q
    }))
  };
};
