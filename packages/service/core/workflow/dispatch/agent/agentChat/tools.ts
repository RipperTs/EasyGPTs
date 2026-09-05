import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type {
  RuntimeEdgeItemType,
  RuntimeNodeItemType
} from '@fastgpt/global/core/workflow/runtime/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { ChatItemValueTypeEnum } from '@fastgpt/global/core/chat/constants';
import { truncateText, getRecord } from './utils';
import type { AgentToolAccess, ToolPreferenceMode } from './types';

type ToolCatalogParam = {
  key: string;
  required: boolean;
  description: string;
  valueType?: string;
  enumValues?: string[];
};

type ToolCatalogItem = {
  nodeId: string;
  name: string;
  intro?: string;
  params: ToolCatalogParam[];
};

const valueTypeToText = (valueType: unknown) => {
  if (typeof valueType === 'string' && valueType.trim()) return valueType.trim();
  if (typeof valueType === 'number') return String(valueType);
  return '';
};

const buildToolsCatalog = (toolNodes: RuntimeNodeItemType[]): ToolCatalogItem[] => {
  return toolNodes.map((node) => {
    const params = (node.inputs || [])
      .filter((i) => typeof (i as { toolDescription?: unknown }).toolDescription === 'string')
      .map((input) => {
        const inputRecord = input as unknown as {
          key?: unknown;
          required?: unknown;
          toolDescription?: unknown;
          valueType?: unknown;
          list?: unknown;
        };
        const key = typeof inputRecord.key === 'string' ? inputRecord.key : '';
        const required = !!inputRecord.required;
        const description =
          typeof inputRecord.toolDescription === 'string' ? inputRecord.toolDescription : '';
        const enumValues = Array.isArray(inputRecord.list)
          ? inputRecord.list
              .map((item) =>
                item && typeof item === 'object' ? (item as { value?: unknown }).value : undefined
              )
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
          : undefined;

        const valueType = valueTypeToText(inputRecord.valueType);
        return {
          key,
          required,
          description,
          ...(valueType ? { valueType } : {}),
          ...(enumValues && enumValues.length ? { enumValues } : {})
        };
      })
      .filter((p) => p.key);

    return {
      nodeId: node.nodeId,
      name: node.name || node.nodeId,
      intro: node.intro || '',
      params
    };
  });
};

export const renderToolsCatalogText = (
  toolNodes: RuntimeNodeItemType[],
  maxChars = 5200
): string => {
  const items = buildToolsCatalog(toolNodes);
  if (items.length === 0) return '(No tools available)';

  const lines: string[] = [];
  items.forEach((t, idx) => {
    lines.push(
      `${idx + 1}. ${t.name} (id: ${t.nodeId})${t.intro ? `: ${truncateText(t.intro, 140)}` : ''}`
    );
    if (t.params.length === 0) {
      lines.push('   - params: (no parameters described)');
      return;
    }
    t.params.slice(0, 14).forEach((p) => {
      const meta: string[] = [];
      if (p.required) meta.push('required');
      if (p.valueType) meta.push(`type=${p.valueType}`);
      if (p.enumValues?.length) meta.push(`enum=${truncateText(p.enumValues.join('|'), 80)}`);
      lines.push(
        `   - ${p.key}${meta.length ? ` (${meta.join(', ')})` : ''}${p.description ? `: ${truncateText(p.description, 160)}` : ''}`
      );
    });
    if (t.params.length > 14) lines.push(`   - ... (${t.params.length} params total)`);
  });

  return truncateText(lines.join('\n'), maxChars);
};

export const extractToolPreviewText = (assistant: AIChatItemValueItemType[], maxChars = 2400) => {
  const lines: string[] = [];

  for (const item of assistant) {
    if (item.type !== ChatItemValueTypeEnum.tool || !item.tools) continue;
    for (const tool of item.tools) {
      const toolObj = getRecord(tool);
      const toolName =
        (toolObj && typeof toolObj.toolName === 'string' && toolObj.toolName) ||
        (toolObj && typeof toolObj.name === 'string' && toolObj.name) ||
        (toolObj && typeof toolObj.functionName === 'string' && toolObj.functionName) ||
        'tool';
      const response =
        (toolObj && typeof toolObj.response === 'string' && toolObj.response) ||
        (toolObj && typeof toolObj.result === 'string' && toolObj.result) ||
        '';
      const responseText = truncateText(response, 900);
      lines.push(`- ${toolName}: ${responseText || '(no output)'}`);
    }
  }

  const text = lines.join('\n').trim();
  return truncateText(text, maxChars);
};

// Keep this in English to avoid interfering with user-visible Chinese outputs.
const TOOL_PREFERENCE_PROMPT_STRONG = `## Code Interpreter Tool Usage (Critical)

ONLY use Code Interpreter when the step truly REQUIRES code execution to compute/verify results.

Use when:
- Data analysis with real calculations (statistics, trends, correlations)
- Numerical computation beyond simple arithmetic
- File/data processing (CSV/Excel/PDF-to-table if supported, structured extraction)
- Generating visualizations from data
- Algorithm execution for verification

Do NOT use for:
- Pure text generation, summarization, or writing
- Pure planning/brainstorming
- Simple structured output that doesn't need computation

How to call it effectively:
- Provide a clear TASK description and relevant FILE URLs.
- You do NOT need to write full Python code yourself unless necessary.
- Do NOT pass raw Python code as a tool argument; describe the task and let the sandbox generate/repair code.
- Require concise stdout (short summary/JSON). Save large outputs to files instead.
- For charts/images/tables: ALWAYS ask the tool to save artifacts to files (PNG/CSV) and return file URLs/list.
- NEVER ask it to embed images as Base64/data URIs or print large blobs in stdout.

Decision rule: "Does this need code to RUN and COMPUTE, or can the answer be generated directly?"
When planning steps that genuinely need Code Interpreter, mention it in toolHints with expected inputs/outputs.`;

const TOOL_PREFERENCE_PROMPT_LIGHT = `## Tool Hint
A Code Interpreter tool is available for steps requiring actual computation or file processing.
Prefer providing a task description + file URLs; avoid using it for text-only tasks.
When requesting charts/files, ask it to save artifacts and return URLs (not Base64).`;

// Make tool discovery easier in mixed naming environments.
const CODE_INTERPRETER_NAME_HINT = `Common names in this system: "Python 数据分析沙箱" (preferred), "代码解释器", "Code Interpreter".`;

export const hasCodeInterpreter = (toolNodes: RuntimeNodeItemType[]): boolean => {
  return toolNodes.some(
    (node) =>
      node.flowNodeType === FlowNodeTypeEnum.codeInterpreter ||
      /code.*interpreter|代码解释器/i.test(node.name || '') ||
      /code.*interpreter|代码解释器/i.test(node.intro || '')
  );
};

export const withToolPreference = (
  systemPrompt: string | undefined,
  toolNodes: RuntimeNodeItemType[],
  mode: ToolPreferenceMode
): string => {
  if (mode === 'none' || !hasCodeInterpreter(toolNodes)) {
    return systemPrompt || '';
  }
  const hint = mode === 'light' ? TOOL_PREFERENCE_PROMPT_LIGHT : TOOL_PREFERENCE_PROMPT_STRONG;
  return `${systemPrompt ? `${systemPrompt}\n\n` : ''}${hint}\n\n${CODE_INTERPRETER_NAME_HINT}\n\n`;
};

const READ_ONLY_ALLOWED_TOOL_TYPES = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.datasetSearchNode,
  FlowNodeTypeEnum.weknoraSearch,
  FlowNodeTypeEnum.datasetConcatNode,
  FlowNodeTypeEnum.queryExtension,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.nl2sql,
  FlowNodeTypeEnum.readFiles,
  FlowNodeTypeEnum.codeInterpreter,
  FlowNodeTypeEnum.textEditor
]);

export const applyToolAccessPolicy = (params: {
  toolNodes: RuntimeNodeItemType[];
  toolAccess: AgentToolAccess;
}) => {
  const { toolNodes, toolAccess } = params;

  if (toolAccess !== 'readOnly') {
    return {
      allowedToolNodes: toolNodes,
      allowedToolNodeIds: toolNodes.map((t) => t.nodeId),
      blockedToolNodeIds: [] as string[],
      blockedReason: ''
    };
  }

  const allowedToolNodes = toolNodes.filter((t) =>
    READ_ONLY_ALLOWED_TOOL_TYPES.has(t.flowNodeType)
  );
  const allowedToolNodeIds = allowedToolNodes.map((t) => t.nodeId);
  const allowedSet = new Set(allowedToolNodeIds);
  const blockedToolNodeIds = toolNodes.map((t) => t.nodeId).filter((id) => !allowedSet.has(id));

  return {
    allowedToolNodes,
    allowedToolNodeIds,
    blockedToolNodeIds,
    blockedReason:
      blockedToolNodeIds.length > 0
        ? 'toolAccess=readOnly: blocked non-readonly tool node types'
        : ''
  };
};

export const filterRuntimeEdgesByToolAllowList = (params: {
  nodeId: string;
  runtimeEdges: RuntimeEdgeItemType[];
  allowedToolNodeIds: string[];
}) => {
  const { nodeId, runtimeEdges, allowedToolNodeIds } = params;
  const allowedSet = new Set(allowedToolNodeIds);
  return runtimeEdges.filter((edge) => {
    if (edge.source !== nodeId) return true;
    if (edge.targetHandle !== NodeOutputKeyEnum.selectedTools) return true;
    return allowedSet.has(edge.target);
  });
};
