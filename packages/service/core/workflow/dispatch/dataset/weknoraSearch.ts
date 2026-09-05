import type {
  DispatchNodeResponseType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import {
  getWeKnoraSettingsFromInputs,
  type WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import { getWeKnoraConnection } from '../../../dataset/weknora/connection';
import { searchWeKnora } from '../../../dataset/weknora/search';
import { datasetSearchQueryExtension } from '../../../dataset/search/utils';
import { getAllLLMModels } from '../../../model/controller';
import { ModelTypeEnum } from '../../../ai/model';
import { getHistories } from '../utils';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { checkTeamReRankPermission } from '../../../../support/permission/teamLimit';
import type { DatasetSearchResponse } from './search';

export const dispatchWeKnoraSearch = async (
  props: ModuleDispatchProps<WeKnoraSearchSettings & { userChatInput: string }>
): Promise<DatasetSearchResponse> => {
  const { params: resolvedParams, node, runningAppInfo, histories, abortSignal } = props;
  // Filters are literal node settings. The generic resolver treats two string IDs as a reference.
  const { weknoraKnowledgeIds, weknoraTagIds } = getWeKnoraSettingsFromInputs(node.inputs);
  const params = {
    ...resolvedParams,
    weknoraKnowledgeIds,
    weknoraTagIds
  };
  if (!params.userChatInput?.trim()) throw new Error('请输入需要检索的问题');
  if (!Array.isArray(params.datasets) || params.datasets.length === 0) {
    throw new Error('请选择 WeKnora 知识库');
  }
  if (
    !Number.isInteger(params.weknoraMatchCount) ||
    params.weknoraMatchCount < 1 ||
    params.weknoraMatchCount > 200
  ) {
    throw new Error('每库召回数量必须是 1～200 的整数');
  }
  if (!Number.isFinite(params.limit) || params.limit < 100) {
    throw new Error('引用长度必须不少于 100 Token');
  }
  if (!Number.isFinite(params.similarity) || params.similarity < 0 || params.similarity > 1) {
    throw new Error('相似度必须在 0～1 之间');
  }
  if (params.usingReRank && !(await checkTeamReRankPermission(runningAppInfo.teamId))) {
    throw new Error('当前团队无权使用结果重排');
  }

  const connection = await getWeKnoraConnection({
    connectionId: params.weknoraConnectionId,
    appId: runningAppInfo.id,
    teamId: runningAppInfo.teamId
  });
  const extensionModel = params.datasetSearchUsingExtensionQuery
    ? (await getAllLLMModels()).find(
        (model) => model.model === params.datasetSearchExtensionModel && model.usedInQueryExtension
      )
    : undefined;
  if (params.datasetSearchUsingExtensionQuery && !extensionModel) {
    throw new Error('请选择可用的问题优化模型');
  }

  const { concatQueries, rewriteQuery, aiExtensionResult } = await datasetSearchQueryExtension({
    query: params.userChatInput,
    extensionModel,
    extensionBg: params.datasetSearchExtensionBg,
    histories: getHistories(6, histories)
  });
  const quoteQA = await searchWeKnora({
    connection,
    settings: params,
    queries: concatQueries,
    reRankQuery: rewriteQuery,
    signal: abortSignal
  });

  const nodeResponse: DispatchNodeResponseType = {
    query: concatQueries.join('\n'),
    similarity:
      params.usingReRank || params.searchMode === DatasetSearchModeEnum.embedding
        ? params.similarity
        : undefined,
    limit: params.limit,
    searchMode: params.searchMode,
    searchUsingReRank: params.usingReRank,
    quoteList: quoteQA,
    nodeInputs: {
      datasets: params.datasets,
      weknoraMatchCount: params.weknoraMatchCount,
      weknoraKnowledgeIds: params.weknoraKnowledgeIds,
      weknoraTagIds: params.weknoraTagIds
    }
  };
  const nodeDispatchUsages: ChatNodeUsageType[] = [];
  if (aiExtensionResult) {
    const { totalPoints, modelName } = formatModelChars2Points({
      model: aiExtensionResult.model,
      tokens: aiExtensionResult.tokens,
      modelType: ModelTypeEnum.llm
    });
    nodeResponse.totalPoints = totalPoints;
    nodeResponse.extensionModel = modelName;
    nodeResponse.extensionTokens = aiExtensionResult.tokens;
    nodeResponse.extensionResult = aiExtensionResult.extensionQueries.join('\n');
    nodeDispatchUsages.push({
      totalPoints,
      moduleName: 'WeKnora 问题优化',
      model: modelName,
      tokens: aiExtensionResult.tokens
    });
  }

  return {
    quoteQA,
    [DispatchNodeResponseKeyEnum.nodeResponse]: nodeResponse,
    nodeDispatchUsages,
    [DispatchNodeResponseKeyEnum.toolResponses]: quoteQA.map((item) => ({
      id: item.id,
      text: item.q
    }))
  };
};
