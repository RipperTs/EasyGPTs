import type { ToolNodeItemType } from './type.d';

const pickText = (value: unknown) => (typeof value === 'string' ? value : '');

const toTokens = (text: string): string[] => {
  const input = text.toLowerCase();
  const parts = input.match(/[\p{Script=Han}]+|[a-z0-9_]+/gu) || [];

  const tokens: string[] = [];
  for (const part of parts) {
    if (/^[\p{Script=Han}]+$/u.test(part)) {
      if (part.length === 1) {
        tokens.push(part);
      } else {
        // 2-gram for Chinese，提高匹配鲁棒性
        for (let i = 0; i < part.length - 1; i++) {
          tokens.push(part.slice(i, i + 2));
        }
      }
    } else {
      tokens.push(part);
    }
  }

  return tokens;
};

const uniq = (arr: string[]) => Array.from(new Set(arr));

const scoreTool = (params: { tool: ToolNodeItemType; queryTokens: Set<string> }) => {
  const { tool, queryTokens } = params;
  const nameTokens = new Set(toTokens(pickText(tool.name)));
  const introTokens = new Set(toTokens(pickText(tool.intro)));
  const paramsTokens = new Set(
    toTokens(
      (tool.toolParams || [])
        .map((p) => `${pickText(p.label)} ${pickText(p.toolDescription)}`)
        .join(' ')
    )
  );

  let score = 0;
  for (const t of queryTokens) {
    if (nameTokens.has(t)) score += 6;
    else if (introTokens.has(t)) score += 3;
    else if (paramsTokens.has(t)) score += 1;
  }
  return score;
};

export const filterToolNodesByRelevance = (params: {
  toolNodes: ToolNodeItemType[];
  queryText: string;
  maxTools: number;
}) => {
  const { toolNodes, queryText, maxTools } = params;
  if (toolNodes.length <= maxTools) return toolNodes;

  const queryTokens = uniq(toTokens(queryText)).slice(0, 40);
  if (queryTokens.length === 0) return toolNodes.slice(0, maxTools);

  const querySet = new Set(queryTokens);

  const scored = toolNodes
    .map((tool, idx) => {
      const score = scoreTool({ tool, queryTokens: querySet });
      return {
        idx,
        tool,
        score
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // 分数相同则保持相对稳定：优先原顺序
      return a.idx - b.idx;
    });

  const picked = scored.slice(0, maxTools).map((i) => i.tool);

  return picked;
};
