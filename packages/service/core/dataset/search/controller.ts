import {
  DatasetSearchModeEnum,
  DatasetSearchModeMap,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore } from '../../../common/vectorStore/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getVectorModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import {
  DatasetDataSchemaType,
  DatasetDataWithCollectionType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { DatasetColCollectionName, MongoDatasetCollection } from '../collection/schema';
import { reRankRecall } from '../../../core/ai/rerank';
import { countPromptTokens } from '../../../common/string/tiktoken/index';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { jiebaSplit } from '../../../common/string/jieba';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { Types } from '../../../common/mongo';
import json5 from 'json5';
import { MongoDatasetCollectionTags } from '../tag/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { MongoReRankModel } from '../../model/rerankSchema';

type SearchDatasetDataProps = {
  teamId: string;
  model: string;
  similarity?: number; // min distance
  limit: number; // max Token limit
  datasetIds: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
  usingReRank?: boolean;
  reRankQuery: string;
  queries: string[];

  /* 
    {
      tags: {
        $and: ["str1","str2"],
        $or: ["str1","str2",null] null means no tags
      },
      createTime: {
        $gte: 'xx',
        $lte: 'xxx'
      }
    }
  */
  collectionFilterMatch?: string;
};

export async function searchDatasetData(props: SearchDatasetDataProps) {
  console.log(`[SearchDatasetData] 函数开始执行 - 时间戳: ${Date.now()}`);
  const functionStart = Date.now();

  let {
    teamId,
    reRankQuery,
    queries,
    model,
    similarity = 0,
    limit: maxTokens,
    searchMode = DatasetSearchModeEnum.embedding,
    usingReRank = false,
    datasetIds = [],
    collectionFilterMatch
  } = props;

  console.log(`[SearchDatasetData] 参数初始化完成 - 耗时: ${Date.now() - functionStart}ms`);
  console.log(
    `[SearchDatasetData] 参数: teamId=${teamId}, datasetIds=${datasetIds}, searchMode=${searchMode}, queries数量=${queries.length}`
  );

  /* init params */
  searchMode = DatasetSearchModeMap[searchMode] ? searchMode : DatasetSearchModeEnum.embedding;
  // 检查是否有可用的重排模型
  const hasReRankModel = (await MongoReRankModel.countDocuments({ isActive: true })) > 0;
  usingReRank = usingReRank && hasReRankModel;

  // Compatible with topk limit
  let set = new Set<string>();
  let usingSimilarityFilter = false;

  /* function */
  const countRecallLimit = () => {
    if (searchMode === DatasetSearchModeEnum.embedding) {
      return {
        embeddingLimit: 100,
        fullTextLimit: 0
      };
    }
    if (searchMode === DatasetSearchModeEnum.fullTextRecall) {
      return {
        embeddingLimit: 0,
        fullTextLimit: 100
      };
    }
    return {
      embeddingLimit: 80,
      fullTextLimit: 60
    };
  };
  const getForbidData = async () => {
    console.log(`[SearchDatasetData] 获取禁用数据开始 - 时间戳: ${Date.now()}`);
    const forbidStart = Date.now();

    const collections = await MongoDatasetCollection.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        forbid: true
      },
      '_id'
    );

    const result = {
      forbidCollectionIdList: collections.map((item) => String(item._id))
    };

    console.log(
      `[SearchDatasetData] 获取禁用数据完成 - 耗时: ${Date.now() - forbidStart}ms, 禁用数量: ${result.forbidCollectionIdList.length}`
    );
    return result;
  };
  /* 
    Collection metadata filter
    标签过滤：
    1. and 先生效
    2. and 标签和 null 不能共存，否则返回空数组
  */
  const filterCollectionByMetadata = async (): Promise<string[] | undefined> => {
    if (!collectionFilterMatch || !global.feConfigs.isPlus) return;

    let tagCollectionIdList: string[] | undefined = undefined;
    let createTimeCollectionIdList: string[] | undefined = undefined;

    try {
      const jsonMatch = json5.parse(collectionFilterMatch);

      // Tag
      let andTags = jsonMatch?.tags?.$and as (string | null)[] | undefined;
      let orTags = jsonMatch?.tags?.$or as (string | null)[] | undefined;

      // get andTagIds
      if (andTags && andTags.length > 0) {
        // tag 去重
        andTags = Array.from(new Set(andTags));

        if (andTags.includes(null) && andTags.some((tag) => typeof tag === 'string')) {
          return [];
        }

        if (andTags.every((tag) => typeof tag === 'string')) {
          // Get tagId by tag string
          const andTagIdList = await MongoDatasetCollectionTags.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              tag: { $in: andTags }
            },
            '_id',
            {
              ...readFromSecondary
            }
          ).lean();

          // If you enter a tag that does not exist, none will be found
          if (andTagIdList.length !== andTags.length) return [];

          // Get collectionId by tagId
          const collections = await MongoDatasetCollection.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              tags: { $all: andTagIdList.map((item) => String(item._id)) }
            },
            '_id',
            {
              ...readFromSecondary
            }
          ).lean();
          tagCollectionIdList = collections.map((item) => String(item._id));
        } else if (andTags.every((tag) => tag === null)) {
          const collections = await MongoDatasetCollection.find(
            {
              teamId,
              datasetId: { $in: datasetIds },
              $or: [{ tags: { $size: 0 } }, { tags: { $exists: false } }]
            },
            '_id',
            {
              ...readFromSecondary
            }
          ).lean();
          tagCollectionIdList = collections.map((item) => String(item._id));
        }
      } else if (orTags && orTags.length > 0) {
        // Get tagId by tag string
        const orTagArray = await MongoDatasetCollectionTags.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            tag: { $in: orTags.filter((tag) => tag !== null) }
          },
          '_id',
          { ...readFromSecondary }
        ).lean();
        const orTagIds = orTagArray.map((item) => String(item._id));

        // Get collections by tagId
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            $or: [
              { tags: { $in: orTagIds } },
              ...(orTags.includes(null) ? [{ tags: { $size: 0 } }] : [])
            ]
          },
          '_id',
          { ...readFromSecondary }
        ).lean();

        tagCollectionIdList = collections.map((item) => String(item._id));
      }

      // time
      const getCreateTime = jsonMatch?.createTime?.$gte as string | undefined;
      const lteCreateTime = jsonMatch?.createTime?.$lte as string | undefined;
      if (getCreateTime || lteCreateTime) {
        const collections = await MongoDatasetCollection.find(
          {
            teamId,
            datasetId: { $in: datasetIds },
            createTime: {
              ...(getCreateTime && { $gte: new Date(getCreateTime) }),
              ...(lteCreateTime && {
                $lte: new Date(lteCreateTime)
              })
            }
          },
          '_id'
        );
        createTimeCollectionIdList = collections.map((item) => String(item._id));
      }

      // Concat tag and time
      if (tagCollectionIdList && createTimeCollectionIdList) {
        return tagCollectionIdList.filter((id) => createTimeCollectionIdList!.includes(id));
      } else if (tagCollectionIdList) {
        return tagCollectionIdList;
      } else if (createTimeCollectionIdList) {
        return createTimeCollectionIdList;
      }
    } catch (error) {}
  };
  const embeddingRecall = async ({
    query,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  }: {
    query: string;
    limit: number;
    forbidCollectionIdList: string[];
    filterCollectionIdList?: string[];
  }) => {
    console.log(
      `[SearchDatasetData-EmbRecall] 向量召回开始 - query长度: ${query.length}, limit: ${limit}`
    );
    const embRecallStart = Date.now();

    console.log(`[SearchDatasetData-EmbRecall] 开始获取文本向量 - 时间戳: ${Date.now()}`);
    const vectorStart = Date.now();
    const { vectors, tokens } = await getVectorsByText({
      model: getVectorModel(model),
      input: query,
      type: 'query'
    });
    console.log(
      `[SearchDatasetData-EmbRecall] 获取文本向量完成 - 耗时: ${Date.now() - vectorStart}ms`
    );

    console.log(`[SearchDatasetData-EmbRecall] 开始向量存储召回 - 时间戳: ${Date.now()}`);
    const vectorSearchStart = Date.now();
    const { results } = await recallFromVectorStore({
      teamId,
      datasetIds,
      vector: vectors[0],
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    });
    console.log(
      `[SearchDatasetData-EmbRecall] 向量存储召回完成 - 耗时: ${Date.now() - vectorSearchStart}ms, 结果数量: ${results.length}`
    );

    // get q and a
    console.log(`[SearchDatasetData-EmbRecall] 开始MongoDB查询 - 时间戳: ${Date.now()}`);
    const mongoStart = Date.now();
    const dataList = (await MongoDatasetData.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: Array.from(new Set(results.map((item) => item.collectionId))) },
        'indexes.dataId': { $in: results.map((item) => item.id?.trim()) }
      },
      'datasetId collectionId q a chunkIndex indexes'
    )
      .populate('collectionId', 'name fileId rawLink externalFileId externalFileUrl')
      .lean()) as DatasetDataWithCollectionType[];
    console.log(
      `[SearchDatasetData-EmbRecall] MongoDB查询完成 - 耗时: ${Date.now() - mongoStart}ms, 数据条数: ${dataList.length}`
    );

    console.log(`[SearchDatasetData-EmbRecall] 开始数据处理和排序 - 时间戳: ${Date.now()}`);
    const processStart = Date.now();

    // add score to data(It's already sorted. The first one is the one with the most points)
    const concatResults = dataList.map((data) => {
      const dataIdList = data.indexes.map((item) => item.dataId);

      const maxScoreResult = results.find((item) => {
        return dataIdList.includes(item.id);
      });

      return {
        ...data,
        score: maxScoreResult?.score || 0
      };
    });

    concatResults.sort((a, b) => b.score - a.score);

    const formatResult = concatResults.map((data, index) => {
      if (!data.collectionId) {
        console.log('Collection is not found', data);
      }

      const result: SearchDataResponseItemType = {
        id: String(data._id),
        q: data.q,
        a: data.a,
        chunkIndex: data.chunkIndex,
        datasetId: String(data.datasetId),
        collectionId: String(data.collectionId?._id),
        ...getCollectionSourceData(data.collectionId),
        score: [{ type: SearchScoreTypeEnum.embedding, value: data.score, index }]
      };

      return result;
    });

    console.log(
      `[SearchDatasetData-EmbRecall] 数据处理和排序完成 - 耗时: ${Date.now() - processStart}ms`
    );
    console.log(`[SearchDatasetData-EmbRecall] 向量召回总耗时: ${Date.now() - embRecallStart}ms`);

    return {
      embeddingRecallResults: formatResult,
      tokens
    };
  };
  const fullTextRecall = async ({
    query,
    limit,
    filterCollectionIdList
  }: {
    query: string;
    limit: number;
    filterCollectionIdList?: string[];
  }): Promise<{
    fullTextRecallResults: SearchDataResponseItemType[];
    tokenLen: number;
  }> => {
    if (limit === 0) {
      return {
        fullTextRecallResults: [],
        tokenLen: 0
      };
    }

    let searchResults = (
      await Promise.all(
        datasetIds.map(async (id) => {
          return MongoDatasetData.aggregate([
            {
              $match: {
                teamId: new Types.ObjectId(teamId),
                datasetId: new Types.ObjectId(id),
                $text: { $search: jiebaSplit({ text: query }) },
                ...(filterCollectionIdList && filterCollectionIdList.length > 0
                  ? {
                      collectionId: {
                        $in: filterCollectionIdList.map((id) => new Types.ObjectId(id))
                      }
                    }
                  : {})
              }
            },
            {
              $addFields: {
                score: { $meta: 'textScore' }
              }
            },
            {
              $sort: {
                score: { $meta: 'textScore' }
              }
            },
            {
              $limit: limit
            },
            {
              $lookup: {
                from: DatasetColCollectionName,
                let: { collectionId: '$collectionId' },
                pipeline: [
                  {
                    $match: {
                      $expr: { $eq: ['$_id', '$$collectionId'] },
                      forbid: { $eq: true } // 匹配被禁用的数据
                    }
                  },
                  {
                    $project: {
                      _id: 1 // 只需要_id字段来确认匹配
                    }
                  }
                ],
                as: 'collection'
              }
            },
            {
              $match: {
                collection: { $eq: [] } // 没有 forbid=true 的数据
              }
            },
            {
              $project: {
                _id: 1,
                datasetId: 1,
                collectionId: 1,
                q: 1,
                a: 1,
                chunkIndex: 1,
                score: 1
              }
            }
          ]);
        })
      )
    ).flat() as (DatasetDataSchemaType & { score: number })[];

    // resort
    searchResults.sort((a, b) => b.score - a.score);
    searchResults.slice(0, limit);

    const collections = await MongoDatasetCollection.find(
      {
        _id: { $in: searchResults.map((item) => item.collectionId) }
      },
      '_id name fileId rawLink'
    );

    return {
      fullTextRecallResults: searchResults.map((item, index) => {
        const collection = collections.find((col) => String(col._id) === String(item.collectionId));
        return {
          id: String(item._id),
          datasetId: String(item.datasetId),
          collectionId: String(item.collectionId),
          ...getCollectionSourceData(collection),
          q: item.q,
          a: item.a,
          chunkIndex: item.chunkIndex,
          indexes: item.indexes,
          score: [{ type: SearchScoreTypeEnum.fullText, value: item.score, index }]
        };
      }),
      tokenLen: 0
    };
  };
  const reRankSearchResult = async ({
    data,
    query
  }: {
    data: SearchDataResponseItemType[];
    query: string;
  }): Promise<SearchDataResponseItemType[]> => {
    try {
      const results = await reRankRecall({
        query,
        documents: data.map((item) => ({
          id: item.id,
          text: `${item.q}\n${item.a}`
        }))
      });

      if (results.length === 0) {
        usingReRank = false;
        return [];
      }

      // add new score to data
      const mergeResult = results
        .map((item, index) => {
          const target = data.find((dataItem) => dataItem.id === item.id);
          if (!target) return null;
          const score = item.score || 0;

          return {
            ...target,
            score: [{ type: SearchScoreTypeEnum.reRank, value: score, index }]
          };
        })
        .filter(Boolean) as SearchDataResponseItemType[];

      return mergeResult;
    } catch (error) {
      usingReRank = false;
      return [];
    }
  };
  const multiQueryRecall = async ({
    embeddingLimit,
    fullTextLimit
  }: {
    embeddingLimit: number;
    fullTextLimit: number;
  }) => {
    console.log(
      `[SearchDatasetData-MultiQuery] 多查询召回开始 - embeddingLimit: ${embeddingLimit}, fullTextLimit: ${fullTextLimit}`
    );
    const multiQueryStart = Date.now();

    // multi query recall
    const embeddingRecallResList: SearchDataResponseItemType[][] = [];
    const fullTextRecallResList: SearchDataResponseItemType[][] = [];
    let totalTokens = 0;

    console.log(`[SearchDatasetData-MultiQuery] 开始获取元数据过滤 - 时间戳: ${Date.now()}`);
    const metadataStart = Date.now();
    const [{ forbidCollectionIdList }, filterCollectionIdList] = await Promise.all([
      getForbidData(),
      filterCollectionByMetadata()
    ]);
    console.log(
      `[SearchDatasetData-MultiQuery] 元数据过滤完成 - 耗时: ${Date.now() - metadataStart}ms`
    );

    console.log(
      `[SearchDatasetData-MultiQuery] 开始执行多查询并行召回 - queries数量: ${queries.length}`
    );
    const parallelStart = Date.now();
    await Promise.all(
      queries.map(async (query, index) => {
        console.log(
          `[SearchDatasetData-MultiQuery] 开始处理第${index + 1}个查询: "${query.substring(0, 50)}..."`
        );
        const singleQueryStart = Date.now();

        const [{ tokens, embeddingRecallResults }, { fullTextRecallResults }] = await Promise.all([
          embeddingRecall({
            query,
            limit: embeddingLimit,
            forbidCollectionIdList,
            filterCollectionIdList
          }),
          fullTextRecall({
            query,
            limit: fullTextLimit,
            filterCollectionIdList
          })
        ]);
        totalTokens += tokens;

        embeddingRecallResList.push(embeddingRecallResults);
        fullTextRecallResList.push(fullTextRecallResults);

        console.log(
          `[SearchDatasetData-MultiQuery] 第${index + 1}个查询完成 - 耗时: ${Date.now() - singleQueryStart}ms, embedding结果: ${embeddingRecallResults.length}, fullText结果: ${fullTextRecallResults.length}`
        );
      })
    );
    console.log(
      `[SearchDatasetData-MultiQuery] 并行召回完成 - 耗时: ${Date.now() - parallelStart}ms`
    );

    console.log(`[SearchDatasetData-MultiQuery] 开始RRF合并 - 时间戳: ${Date.now()}`);
    const rrfStart = Date.now();
    // rrf concat
    const rrfEmbRecall = datasetSearchResultConcat(
      embeddingRecallResList.map((list) => ({ k: 60, list }))
    ).slice(0, embeddingLimit);
    const rrfFTRecall = datasetSearchResultConcat(
      fullTextRecallResList.map((list) => ({ k: 60, list }))
    ).slice(0, fullTextLimit);
    console.log(`[SearchDatasetData-MultiQuery] RRF合并完成 - 耗时: ${Date.now() - rrfStart}ms`);

    console.log(
      `[SearchDatasetData-MultiQuery] 多查询召回总耗时: ${Date.now() - multiQueryStart}ms`
    );
    return {
      tokens: totalTokens,
      embeddingRecallResults: rrfEmbRecall,
      fullTextRecallResults: rrfFTRecall
    };
  };

  /* main step */
  console.log(`[SearchDatasetData] 开始主要步骤 - 时间戳: ${Date.now()}`);

  // count limit
  const { embeddingLimit, fullTextLimit } = countRecallLimit();
  console.log(
    `[SearchDatasetData] 召回限制计算完成 - embeddingLimit: ${embeddingLimit}, fullTextLimit: ${fullTextLimit}`
  );

  // recall
  console.log(`[SearchDatasetData] 开始多查询召回 - 时间戳: ${Date.now()}`);
  const recallStart = Date.now();
  const { embeddingRecallResults, fullTextRecallResults, tokens } = await multiQueryRecall({
    embeddingLimit,
    fullTextLimit
  });
  console.log(`[SearchDatasetData] 多查询召回完成 - 耗时: ${Date.now() - recallStart}ms`);

  // ReRank results
  console.log(`[SearchDatasetData] 开始ReRank处理 - 时间戳: ${Date.now()}`);
  const reRankStart = Date.now();
  const reRankResults = await (async () => {
    if (!usingReRank) return [];

    set = new Set<string>(embeddingRecallResults.map((item) => item.id));
    const concatRecallResults = embeddingRecallResults.concat(
      fullTextRecallResults.filter((item) => !set.has(item.id))
    );

    // remove same q and a data
    set = new Set<string>();
    const filterSameDataResults = concatRecallResults.filter((item) => {
      // 删除所有的标点符号与空格等，只对文本进行比较
      const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
      if (set.has(str)) return false;
      set.add(str);
      return true;
    });
    return reRankSearchResult({
      query: reRankQuery,
      data: filterSameDataResults
    });
  })();
  console.log(
    `[SearchDatasetData] ReRank处理完成 - 耗时: ${Date.now() - reRankStart}ms, 结果数量: ${reRankResults.length}`
  );

  console.log(`[SearchDatasetData] 开始最终结果处理 - 时间戳: ${Date.now()}`);
  const finalProcessStart = Date.now();

  // embedding recall and fullText recall rrf concat
  const rrfConcatResults = datasetSearchResultConcat([
    { k: 60, list: embeddingRecallResults },
    { k: 60, list: fullTextRecallResults },
    { k: 58, list: reRankResults }
  ]);

  // remove same q and a data
  set = new Set<string>();
  const filterSameDataResults = rrfConcatResults.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });

  // score filter
  const scoreFilter = (() => {
    if (usingReRank) {
      usingSimilarityFilter = true;

      return filterSameDataResults.filter((item) => {
        const reRankScore = item.score.find((item) => item.type === SearchScoreTypeEnum.reRank);
        if (reRankScore && reRankScore.value < similarity) return false;
        return true;
      });
    }
    if (searchMode === DatasetSearchModeEnum.embedding) {
      usingSimilarityFilter = true;
      return filterSameDataResults.filter((item) => {
        const embeddingScore = item.score.find(
          (item) => item.type === SearchScoreTypeEnum.embedding
        );
        if (embeddingScore && embeddingScore.value < similarity) return false;
        return true;
      });
    }
    return filterSameDataResults;
  })();

  // token filter
  const filterMaxTokensResult = await (async () => {
    const tokensScoreFilter = await Promise.all(
      scoreFilter.map(async (item) => ({
        ...item,
        tokens: await countPromptTokens(item.q + item.a)
      }))
    );

    const results: SearchDataResponseItemType[] = [];
    let totalTokens = 0;

    for await (const item of tokensScoreFilter) {
      totalTokens += item.tokens;

      if (totalTokens > maxTokens + 500) {
        break;
      }
      results.push(item);
      if (totalTokens > maxTokens) {
        break;
      }
    }

    return results.length === 0 ? scoreFilter.slice(0, 1) : results;
  })();

  console.log(`[SearchDatasetData] 最终结果处理完成 - 耗时: ${Date.now() - finalProcessStart}ms`);
  console.log(`[SearchDatasetData] 函数执行总耗时: ${Date.now() - functionStart}ms`);

  return {
    searchRes: filterMaxTokensResult,
    tokens,
    searchMode,
    limit: maxTokens,
    similarity,
    usingReRank,
    usingSimilarityFilter
  };
}
