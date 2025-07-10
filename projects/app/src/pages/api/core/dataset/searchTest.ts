import type { NextApiRequest } from 'next';
import type { SearchTestProps } from '@/global/core/dataset/api.d';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { searchDatasetData } from '@fastgpt/service/core/dataset/search/controller';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { UsageSourceEnum } from '@fastgpt/global/support/wallet/usage/constants';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { datasetSearchQueryExtension } from '@fastgpt/service/core/dataset/search/utils';
import {
  checkTeamAIPoints,
  checkTeamReRankPermission
} from '@fastgpt/service/support/permission/teamLimit';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const requestStart = Date.now();
  console.log(`[SearchTest] 请求开始 - 时间戳: ${requestStart}`);

  const {
    datasetId,
    text,
    limit = 1500,
    similarity,
    searchMode,
    usingReRank,

    datasetSearchUsingExtensionQuery = true,
    datasetSearchExtensionModel,
    datasetSearchExtensionBg = ''
  } = req.body as SearchTestProps;

  console.log(`[SearchTest] 请求参数解析完成 - 耗时: ${Date.now() - requestStart}ms`);
  console.log(
    `[SearchTest] 参数信息: datasetId=${datasetId}, text长度=${text?.length}, limit=${limit}, searchMode=${searchMode}, usingReRank=${usingReRank}`
  );

  if (!datasetId || !text) {
    console.log(`[SearchTest] 参数验证失败 - datasetId: ${datasetId}, text: ${text}`);
    return Promise.reject(CommonErrEnum.missingParams);
  }

  const start = Date.now();

  // auth dataset role
  console.log(`[SearchTest] 开始数据集权限验证 - 时间戳: ${Date.now()}`);
  const authStart = Date.now();
  const { dataset, teamId, tmbId, apikey } = await authDataset({
    req,
    authToken: true,
    authApiKey: true,
    datasetId,
    per: ReadPermissionVal
  });
  console.log(
    `[SearchTest] 数据集权限验证完成 - 耗时: ${Date.now() - authStart}ms, teamId: ${teamId}`
  );

  // auth balance
  console.log(`[SearchTest] 开始检查团队AI积分 - 时间戳: ${Date.now()}`);
  const balanceStart = Date.now();
  await checkTeamAIPoints(teamId);
  console.log(`[SearchTest] 团队AI积分检查完成 - 耗时: ${Date.now() - balanceStart}ms`);

  // query extension
  console.log(`[SearchTest] 开始查询扩展处理 - 时间戳: ${Date.now()}`);
  const extensionStart = Date.now();
  const extensionModel =
    datasetSearchUsingExtensionQuery && datasetSearchExtensionModel
      ? getLLMModel(datasetSearchExtensionModel)
      : undefined;
  console.log(
    `[SearchTest] 扩展模型获取完成 - 耗时: ${Date.now() - extensionStart}ms, 模型: ${extensionModel?.name || '无'}`
  );

  const queryExtensionStart = Date.now();
  const { concatQueries, rewriteQuery, aiExtensionResult } = await datasetSearchQueryExtension({
    query: text,
    extensionModel,
    extensionBg: datasetSearchExtensionBg
  });
  console.log(`[SearchTest] 查询扩展完成 - 耗时: ${Date.now() - queryExtensionStart}ms`);
  console.log(
    `[SearchTest] 扩展结果: concatQueries数量=${concatQueries.length}, rewriteQuery长度=${rewriteQuery?.length}, 有AI结果=${!!aiExtensionResult}`
  );

  // 检查rerank权限
  console.log(`[SearchTest] 开始检查ReRank权限 - 时间戳: ${Date.now()}`);
  const reRankPermissionStart = Date.now();
  const hasReRankPermission = usingReRank && (await checkTeamReRankPermission(teamId));
  console.log(
    `[SearchTest] ReRank权限检查完成 - 耗时: ${Date.now() - reRankPermissionStart}ms, 结果: ${hasReRankPermission}`
  );

  // 数据集搜索
  console.log(`[SearchTest] 开始数据集搜索 - 时间戳: ${Date.now()}`);
  const searchStart = Date.now();
  const { searchRes, tokens, ...result } = await searchDatasetData({
    teamId,
    reRankQuery: rewriteQuery,
    queries: concatQueries,
    model: dataset.vectorModel,
    limit: Math.min(limit, 20000),
    similarity,
    datasetIds: [datasetId],
    searchMode,
    usingReRank: hasReRankPermission
  });
  console.log(`[SearchTest] 数据集搜索完成 - 耗时: ${Date.now() - searchStart}ms`);
  console.log(
    `[SearchTest] 搜索结果: 结果数量=${searchRes.length}, tokens=${tokens}, 向量模型=${dataset.vectorModel}`
  );

  // push bill
  console.log(`[SearchTest] 开始推送使用量计费 - 时间戳: ${Date.now()}`);
  const billingStart = Date.now();
  const { totalPoints } = pushGenerateVectorUsage({
    teamId,
    tmbId,
    tokens,
    model: dataset.vectorModel,
    source: apikey ? UsageSourceEnum.api : UsageSourceEnum.fastgpt,

    ...(aiExtensionResult &&
      extensionModel && {
        extensionModel: extensionModel.name,
        extensionTokens: aiExtensionResult.tokens
      })
  });
  console.log(
    `[SearchTest] 使用量计费完成 - 耗时: ${Date.now() - billingStart}ms, 总积分: ${totalPoints}`
  );

  if (apikey) {
    console.log(`[SearchTest] 开始更新API密钥使用量 - 时间戳: ${Date.now()}`);
    const apiKeyStart = Date.now();
    updateApiKeyUsage({
      apikey,
      totalPoints: totalPoints
    });
    console.log(`[SearchTest] API密钥使用量更新完成 - 耗时: ${Date.now() - apiKeyStart}ms`);
  }

  const totalDuration = Date.now() - start;
  const requestDuration = Date.now() - requestStart;
  console.log(
    `[SearchTest] 请求处理完成 - 总耗时: ${totalDuration}ms (${(totalDuration / 1000).toFixed(3)}s)`
  );
  console.log(
    `[SearchTest] 完整请求耗时: ${requestDuration}ms (${(requestDuration / 1000).toFixed(3)}s)`
  );

  return {
    list: searchRes,
    duration: `${((Date.now() - start) / 1000).toFixed(3)}s`,
    queryExtensionModel: aiExtensionResult?.model,
    ...result
  };
}

export default NextAPI(handler);
