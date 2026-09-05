import { createHash } from 'crypto';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type {
  WeKnoraConnectionConfig,
  WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import { createWeKnoraClient } from './client';
import { filterSearchResultsByMaxChars } from '../../workflow/utils';

export const searchWeKnora = async ({
  connection,
  settings,
  query,
  signal
}: {
  connection: WeKnoraConnectionConfig;
  settings: WeKnoraSearchSettings;
  query: string;
  signal?: AbortSignal;
}): Promise<SearchDataResponseItemType[]> => {
  const client = createWeKnoraClient(connection, signal);
  const datasetIds = [...new Set(settings.datasets.map((dataset) => dataset.datasetId))];
  const results = await client.search({ query, knowledge_base_ids: datasetIds });
  const resultDatasetIds = [...new Set(results.map((item) => item.knowledge_base_id))];
  if (resultDatasetIds.some((id) => !datasetIds.includes(id))) {
    throw new Error('WeKnoraX 返回结果的知识库归属与所选范围不一致');
  }
  const namespaces = new Map(
    await Promise.all(
      resultDatasetIds.map(async (id) => {
        const dataset = await client.getKnowledgeBase(id);
        const namespace = createHash('sha256')
          .update(`${connection.apiUrl}\n${dataset.tenant_id}`)
          .digest('hex')
          .slice(0, 24);
        return [id, namespace] as const;
      })
    )
  );

  // WeKnora owns retrieval, reranking and merging. Preserve its final ordering and scores.
  const quotes = results.map((item, index): SearchDataResponseItemType => {
    const datasetId = item.knowledge_base_id;
    const namespace = namespaces.get(datasetId)!;
    const sourceUrl = connection.webUrl
      ? new URL(`${connection.webUrl}/platform/knowledge-bases/${encodeURIComponent(datasetId)}`)
      : undefined;
    sourceUrl?.searchParams.set('knowledge_id', item.knowledge_id);

    return {
      id: `weknora:${namespace}:${datasetId}:${item.id}`,
      datasetId: `weknora:${namespace}:${datasetId}`,
      collectionId: `weknora:${namespace}:${datasetId}:${item.knowledge_id}`,
      sourceType: 'weknora',
      sourceName: item.knowledge_filename || item.knowledge_title,
      sourceId: sourceUrl?.toString(),
      q: item.content,
      a: '',
      chunkIndex: item.chunk_index,
      score: [{ type: SearchScoreTypeEnum.weknora, value: item.score, index }]
    };
  });

  return filterSearchResultsByMaxChars(quotes, settings.limit);
};
