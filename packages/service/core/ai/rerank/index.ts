import { addLog } from '../../../common/system/log';
import { POST } from '../../../common/api/serverRequest';
import { MongoReRankModel } from '../../model/rerankSchema';

type PostReRankResponse = {
  id: string;
  results: {
    index: number;
    relevance_score: number;
  }[];
};
type ReRankCallResult = { id: string; score?: number }[];

type ReRankRequest = {
  query: string;
  documents: { id: string; text: string }[];
};

const getConfiguredReRankModel = async () => {
  const model = await MongoReRankModel.findOne(
    { isActive: true },
    {},
    { sort: { updateTime: -1 } }
  );
  if (!model || !model.requestUrl) {
    throw new Error('未配置可用的重排模型');
  }
  return model;
};

const callReRank = async (
  { query, documents }: ReRankRequest,
  model: Awaited<ReturnType<typeof getConfiguredReRankModel>>
): Promise<{ id: string; score: number }[]> => {
  const start = Date.now();
  const data = await POST<PostReRankResponse>(
    model.requestUrl,
    { model: model.model, query, documents: documents.map((doc) => doc.text) },
    { headers: { Authorization: `Bearer ${model.apiKey}` }, timeout: 30000 }
  );
  if (!Array.isArray(data.results) || data.results.length === 0) {
    throw new Error('重排服务未返回有效结果');
  }
  const results = data.results.map((item) => {
    if (
      !Number.isInteger(item.index) ||
      !documents[item.index] ||
      !Number.isFinite(item.relevance_score)
    ) {
      throw new Error('重排服务返回了无效的文档索引或评分');
    }
    return { id: documents[item.index].id, score: item.relevance_score };
  });
  addLog.info('ReRank finish:', { time: Date.now() - start });
  return results;
};

export async function reRankRecall({
  query,
  documents
}: {
  query: string;
  documents: { id: string; text: string }[];
}): Promise<ReRankCallResult> {
  const model = await getConfiguredReRankModel();
  return callReRank({ query, documents }, model).catch((err) => {
    addLog.error('rerank error', err);
    return [];
  });
}
