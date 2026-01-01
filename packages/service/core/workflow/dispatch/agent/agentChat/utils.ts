import json5 from 'json5';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { AgentPastStep, AgentPlanStep } from './types';

export const nowIso = () => new Date().toISOString();

export const clampInt = (value: unknown, defaultValue: number, min: number, max: number) => {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : defaultValue;

  if (!Number.isFinite(n)) return defaultValue;
  const rounded = Math.round(n);
  return Math.min(Math.max(rounded, min), max);
};

export const truncateText = (text: string, maxChars: number) => {
  const t = (text || '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, Math.max(0, maxChars - 1))}…`;
};

export const normalizeStepText = (step: string) => step.replace(/\s+/g, ' ').trim();

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;

export const normalizeStringArray = (value: unknown, maxLen: number) => {
  if (!Array.isArray(value)) return [];
  const arr = value
    .filter(isNonEmptyString)
    .map((s) => normalizeStepText(s))
    .filter(Boolean);
  return arr.slice(0, maxLen);
};

// Extract first complete JSON value (object/array) while ignoring braces inside strings.
export const extractFirstJsonValue = (text: string): string => {
  const str = text.trim();
  if (!str) return '';

  let start = -1;
  const stack: Array<'{' | '['> = [];
  let inString = false;
  let quote: '"' | "'" | null = null;
  let escape = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i] as string;

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\\\') {
        escape = true;
        continue;
      }
      if (quote && ch === quote) {
        inString = false;
        quote = null;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch as '"' | "'";
      continue;
    }

    if (start === -1) {
      if (ch === '{' || ch === '[') {
        start = i;
        stack.push(ch as '{' | '[');
      }
      continue;
    }

    if (ch === '{' || ch === '[') {
      stack.push(ch as '{' | '[');
      continue;
    }

    if (ch === '}' || ch === ']') {
      const last = stack[stack.length - 1];
      const match = (last === '{' && ch === '}') || (last === '[' && ch === ']');
      if (match) {
        stack.pop();
        if (stack.length === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }

  return '';
};

const isReplyLikeStep = (step: string) => {
  const s = normalizeStepText(step).toLowerCase();
  if (!s) return false;
  const chinesePattern =
    /(回复用户|面向用户|总结以上|汇总以上|整理以上|(?:输出|给出|生成|整理|撰写|形成).*(?:最终)?.*(?:答复|回复|回答|答案|结果|总结|方案|报告|行程|计划)|最终.*(?:答复|回复|回答|答案|结果|总结|输出))/;
  const englishPattern =
    /(summarize|summarise|summary|conclude|conclusion|final\\s*(answer|response|reply)|respond\\s*to\\s*user|present\\s*(findings|results)|compile\\s*results)/i;
  return chinesePattern.test(s) || englishPattern.test(s);
};

const uniqueOrderedSteps = (steps: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const s of steps) {
    const key = normalizeStepText(s);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(key);
  }
  return result;
};

export const normalizePlannerSteps = (steps: string[], maxPlanSteps: number) =>
  uniqueOrderedSteps(steps)
    .filter((s) => !isReplyLikeStep(s))
    .slice(0, maxPlanSteps);

export const parseStepsFromModelText = (text: string, maxSteps: number): string[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonStr = extractFirstJsonValue(trimmed) || trimmed;

  try {
    const parsed = json5.parse(jsonStr) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, maxSteps);
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as { steps?: unknown; plan?: unknown };
      const value = obj.steps ?? obj.plan;
      if (Array.isArray(value)) {
        return value
          .filter((item): item is string => typeof item === 'string')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, maxSteps);
      }
    }
  } catch {}

  return [];
};

export const normalizePlannerPlanSteps = (
  steps: AgentPlanStep[],
  maxPlanSteps: number,
  reservedIds?: Set<string>
) => {
  const seenTitle = new Set<string>();
  const seenId = new Set<string>();
  const result: AgentPlanStep[] = [];

  for (const step of steps) {
    const title = normalizeStepText(step.title);
    if (!title) continue;
    if (isReplyLikeStep(title)) continue;

    const titleKey = normalizeStepText(title);
    if (!titleKey) continue;
    if (seenTitle.has(titleKey)) continue;

    let id = isNonEmptyString(step.id) ? step.id.trim() : '';
    if (!id) id = `S${result.length + 1}`;
    if (reservedIds?.has(id) || seenId.has(id)) {
      let idx = 2;
      while (reservedIds?.has(`${id}_${idx}`) || seenId.has(`${id}_${idx}`)) idx++;
      id = `${id}_${idx}`;
    }

    const toolHints = step.toolHints?.map((s) => s.trim()).filter(Boolean);
    const acceptanceCriteria = step.acceptanceCriteria?.map((s) => s.trim()).filter(Boolean);
    const normalized: AgentPlanStep = {
      ...step,
      id,
      title,
      ...(toolHints?.length ? { toolHints } : {}),
      ...(acceptanceCriteria?.length ? { acceptanceCriteria } : {})
    };

    result.push(normalized);
    seenTitle.add(titleKey);
    seenId.add(id);
    if (result.length >= maxPlanSteps) break;
  }

  return result;
};

export const parsePlanStepsFromModelText = (
  text: string,
  maxPlanSteps: number
): AgentPlanStep[] => {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const jsonStr = extractFirstJsonValue(trimmed) || trimmed;

  const normalizeCriteria = (value: unknown, maxLen: number) => {
    if (isNonEmptyString(value)) return [value.trim()].slice(0, maxLen);
    return normalizeStringArray(value, maxLen);
  };

  const normalizeOne = (value: unknown, index: number): AgentPlanStep | undefined => {
    if (isNonEmptyString(value)) {
      const title = normalizeStepText(value);
      if (!title) return;
      return { id: `S${index + 1}`, title };
    }

    const obj = getRecord(value);
    if (!obj) return;

    const rawTitle =
      (typeof obj.title === 'string' && obj.title) ||
      (typeof obj.step === 'string' && obj.step) ||
      '';
    const title = normalizeStepText(rawTitle);
    if (!title) return;

    const id = isNonEmptyString(obj.id) ? obj.id.trim() : `S${index + 1}`;
    const intent = isNonEmptyString(obj.intent) ? obj.intent.trim() : undefined;
    const toolHints = normalizeStringArray(obj.toolHints ?? obj.tools, 6);
    const expectedOutput = isNonEmptyString(obj.expectedOutput)
      ? obj.expectedOutput.trim()
      : undefined;
    const acceptanceCriteria = normalizeCriteria(obj.acceptanceCriteria, 8);
    const inputs = getRecord(obj.inputs);

    return {
      id,
      title,
      ...(intent ? { intent } : {}),
      ...(toolHints.length ? { toolHints } : {}),
      ...(expectedOutput ? { expectedOutput } : {}),
      ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
      ...(inputs ? { inputs } : {})
    };
  };

  try {
    const parsed = json5.parse(jsonStr) as unknown;

    const rawSteps = (() => {
      if (Array.isArray(parsed)) return parsed;
      const obj = getRecord(parsed);
      if (!obj) return [];
      const steps = obj.steps ?? obj.plan;
      return Array.isArray(steps) ? steps : [];
    })();

    const steps = rawSteps
      .map((item, index) => normalizeOne(item, index))
      .filter((s): s is AgentPlanStep => !!s);

    return normalizePlannerPlanSteps(steps, maxPlanSteps);
  } catch {
    return [];
  }
};

export const parsePlanStepsFromUnknown = (params: {
  value: unknown;
  maxPlanSteps: number;
  reservedIds?: Set<string>;
  defaultIdPrefix: string;
}): AgentPlanStep[] => {
  const { value, maxPlanSteps, reservedIds, defaultIdPrefix } = params;
  if (!Array.isArray(value)) return [];

  const normalizeCriteria = (v: unknown, maxLen: number) => {
    if (isNonEmptyString(v)) return [v.trim()].slice(0, maxLen);
    return normalizeStringArray(v, maxLen);
  };

  const steps = value
    .map((item, index) => {
      if (isNonEmptyString(item)) {
        const title = normalizeStepText(item);
        if (!title) return;
        return { id: `${defaultIdPrefix}${index + 1}`, title };
      }
      const obj = getRecord(item);
      if (!obj) return;
      const rawTitle =
        (typeof obj.title === 'string' && obj.title) ||
        (typeof obj.step === 'string' && obj.step) ||
        '';
      const title = normalizeStepText(rawTitle);
      if (!title) return;

      const id = isNonEmptyString(obj.id) ? obj.id.trim() : `${defaultIdPrefix}${index + 1}`;
      const intent = isNonEmptyString(obj.intent) ? obj.intent.trim() : undefined;
      const toolHints = normalizeStringArray(obj.toolHints ?? obj.tools, 6);
      const expectedOutput = isNonEmptyString(obj.expectedOutput)
        ? obj.expectedOutput.trim()
        : undefined;
      const acceptanceCriteria = normalizeCriteria(obj.acceptanceCriteria, 8);
      const inputs = getRecord(obj.inputs);

      return {
        id,
        title,
        ...(intent ? { intent } : {}),
        ...(toolHints.length ? { toolHints } : {}),
        ...(expectedOutput ? { expectedOutput } : {}),
        ...(acceptanceCriteria.length ? { acceptanceCriteria } : {}),
        ...(inputs ? { inputs } : {})
      } satisfies AgentPlanStep;
    })
    .filter((s): s is AgentPlanStep => !!s);

  return normalizePlannerPlanSteps(steps, maxPlanSteps, reservedIds);
};

export const renderTodoMarkdown = (params: {
  allSteps: AgentPlanStep[];
  pastSteps: AgentPastStep[];
}) => {
  const { allSteps, pastSteps } = params;
  const doneIds = new Set(pastSteps.map((p) => p.step.id));

  const lines: string[] = [];
  allSteps.forEach((s) => {
    const title = normalizeStepText(s.title);
    if (!title) return;
    if (doneIds.has(s.id)) lines.push(`- ☑ ~~${title}~~`);
    else lines.push(`- ☐ ${title}`);
  });

  return `${lines.filter(Boolean).join('\n')}\n`;
};

export const pickToolItems = (items: AIChatItemValueItemType[]) =>
  items.filter((i) => i.type === (ChatItemValueTypeEnum.tool as AIChatItemValueItemType['type']));
