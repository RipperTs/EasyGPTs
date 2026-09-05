import { createHash } from 'crypto';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import {
  getWeKnoraSearchModes,
  type WeKnoraConnectionConfig,
  type WeKnoraSearchSettings
} from '@fastgpt/global/core/dataset/weknora';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { createWeKnoraClient } from './client';
import { requestReRank } from '../../ai/rerank';
import { filterSearchResultsByMaxChars } from '../../workflow/utils';

export const searchWeKnora = async ({
  connection,
  settings,
  queries,
  reRankQuery,
  signal
}: {
  connection: WeKnoraConnectionConfig;
  settings: WeKnoraSearchSettings;
  queries: string[];
  reRankQuery: string;
  signal?: AbortSignal;
}): Promise<SearchDataResponseItemType[]> => {
  const client = createWeKnoraClient(connection, signal);
  const lists: SearchDataResponseItemType[][] = [];
  const vectorOnly = settings.searchMode === DatasetSearchModeEnum.embedding;
  const keywordOnly = settings.searchMode === DatasetSearchModeEnum.fullTextRecall;
  const scoreType = vectorOnly
    ? SearchScoreTypeEnum.embedding
    : keywordOnly
      ? SearchScoreTypeEnum.fullText
      : SearchScoreTypeEnum.weknora;

  // Retrieve each KB separately: embedding models and FAQ indexes are KB-specific.
  for (const datasetId of new Set(settings.datasets.map((dataset) => dataset.datasetId))) {
    const dataset = await client.getKnowledgeBase(datasetId);
    if (!getWeKnoraSearchModes([dataset]).includes(settings.searchMode as DatasetSearchModeEnum)) {
      throw new Error(`知识库“${dataset.name}”不支持当前检索模式`);
    }
    const namespace = createHash('sha256')
      .update(`${connection.apiUrl}\n${dataset.tenant_id}`)
      .digest('hex')
      .slice(0, 24);

    for (const query of queries) {
      const results = await client.search(datasetId, {
        query_text: query,
        vector_threshold: vectorOnly && !settings.usingReRank ? settings.similarity : 0,
        keyword_threshold: 0,
        match_count: settings.weknoraMatchCount,
        disable_keywords_match: vectorOnly,
        disable_vector_match: keywordOnly,
        knowledge_ids: settings.weknoraKnowledgeIds,
        tag_ids: settings.weknoraTagIds
      });

      lists.push(
        results.map((item, index): SearchDataResponseItemType => {
          const sourceUrl = connection.webUrl
            ? new URL(
                `${connection.webUrl}/platform/knowledge-bases/${encodeURIComponent(datasetId)}`
              )
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
            score: [{ type: scoreType, value: item.score, index }]
          };
        })
      );
    }
  }

  let results = datasetSearchResultConcat(lists.map((list) => ({ k: 60, list })));

  if (settings.usingReRank && results.length > 0) {
    const ranked = await requestReRank({
      query: reRankQuery,
      documents: results.map((item) => ({ id: item.id, text: item.q })),
      signal
    });
    const byId = new Map(results.map((item) => [item.id, item]));
    results = ranked
      .filter((item) => item.score >= settings.similarity)
      .map((item, index) => ({
        ...byId.get(item.id)!,
        // Rerank is the final ordering; do not display an earlier RRF rank as primary.
        score: [{ type: SearchScoreTypeEnum.reRank, value: item.score, index }]
      }));
  }

  return filterSearchResultsByMaxChars(results, settings.limit);
};
