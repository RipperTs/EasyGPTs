import { v4 as uuidv4 } from 'uuid';

type Props = {
  apiKey: string;
  query: string;
  count: number;
};

type SearchResult = {
  id?: string | null;
  name: string | null;
  url: string;
  displayUrl: string | null;
  snippet: string | null;
  summary: string | null;
  siteName: string | null;
  siteIcon: string | null;
  refer: string | null;
  dateLastCrawled?: string | null;
};

type QueryContext = {
  originalQuery: string;
};

type WebPage = {
  webSearchUrl?: string;
  totalEstimatedMatches?: number;
  value: SearchResult[];
};

type WebResult = {
  _type: string;
  queryContext: QueryContext;
  webPages: WebPage;
};

// Response type same as HTTP outputs
type Response = Promise<{
  result: WebResult | null;
  error_msg?: string;
}>;

const main = async ({ apiKey, query, count }: Props): Response => {
  // Check the apikey
  if (!apiKey) {
    return {
      result: null,
      error_msg: `API key is required`
    };
  }

  // 设置空查询结果内容
  const emptyResult: WebResult = {
    _type: 'web-search-pro',
    queryContext: {
      originalQuery: query
    },
    webPages: {
      value: []
    }
  };

  const msg = [
    {
      role: 'user',
      content: query
    }
  ];

  try {
    const response = await fetch('https://open.bigmodel.cn/api/paas/v4/tools', {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        request_id: uuidv4(),
        tool: 'web-search-pro',
        stream: false,
        messages: msg
      })
    });
    if (response.status !== 200) {
      return {
        result: emptyResult,
        error_msg: `Get token failed: ${await response.text()}`
      };
    }
    const data = await response.json();
    const toolCalls = data.choices[0].message?.tool_calls || [];
    if (toolCalls.length <= 1) {
      return {
        result: emptyResult,
        error_msg: `No result`
      };
    }

    // 构建搜索结果, 数据结构保持与博查搜索api一致
    const searchResult: SearchResult[] = [];
    toolCalls.forEach((toolCall: any) => {
      if (toolCall.type === 'search_result') {
        // 分割搜索结果, 最大数量为count
        const maxCount = Math.min(count, toolCall.search_result.length);
        toolCall.search_result = toolCall.search_result.slice(0, maxCount);
        // 处理搜索结果
        toolCall.search_result.forEach((result: any) => {
          searchResult.push({
            id: null,
            name: result.title,
            url: result.link,
            displayUrl: result.link,
            snippet: result.content,
            summary: result.content,
            siteName: result.media,
            siteIcon: result.icon,
            refer: result.refer,
            dateLastCrawled: null
          });
        });
      }
    });

    const result: WebResult = {
      _type: 'web-search-pro',
      queryContext: {
        originalQuery: query
      },
      webPages: {
        webSearchUrl: 'https://www.bing.com/search?q=' + encodeURIComponent(query),
        totalEstimatedMatches: 0,
        value: searchResult
      }
    };

    return {
      result
    };
  } catch (e) {
    return {
      result: emptyResult,
      error_msg: `Failed to fetch search result with error: ${e}`
    };
  }
};

export default main;
