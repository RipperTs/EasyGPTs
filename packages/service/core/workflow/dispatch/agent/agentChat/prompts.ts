import type {
  AgentPastStep,
  AgentPlanStep,
  CriticResult,
  ToolPreferenceMode,
  WorkingMemory
} from './types';
import { normalizeStepText, truncateText } from './utils';
import { renderToolsCatalogText, withToolPreference } from './tools';
import type { RuntimeNodeItemType } from '@fastgpt/global/core/workflow/runtime/type.d';

export const SUMMARY_SEPARATOR = '\n\n---\n\n';
export const TASK_PREFIX = '\n> 任务：';

const userSystemPromptSection = (systemPrompt?: string) => {
  const p = (systemPrompt || '').trim();
  if (!p) return '';
  return `## User-provided system instruction (verbatim)\n${p}\n\n---\n\n`;
};

export const buildClarifierSystemPrompt = (systemPrompt?: string) => {
  return `${userSystemPromptSection(systemPrompt)}You are a Clarification Gatekeeper.

Goal: decide whether we MUST ask the user for missing critical information before proceeding safely and reliably.

Rules:
0) Default to needClarify=false. Do NOT ask questions just to be "more complete".
1) Set needClarify=true ONLY if missing information would make tool calls or analysis clearly unreliable or unsafe.
   - If you can make progress with available tools or by taking a reasonable, low-risk next step, set needClarify=false.
2) If the goal is already sufficiently specified, needClarify=false.
3) questions: at most 3, short and specific, directly collect missing parameters.
4) Output JSON only (no markdown, no extra text).

Output schema:
{"needClarify": true|false, "reason": "one sentence", "questions": ["..."]}`;
};

export const buildWorkingMemorySystemPrompt = (systemPrompt?: string) => {
  return `${userSystemPromptSection(systemPrompt)}You are a Working Memory Compressor.

Compress the user goal into stable short-term memory for multi-step execution.

Rules:
1) Output JSON only.
2) summary: 1-2 sentences.
3) constraints/knownFacts/openQuestions: up to 6 items each, short phrases.
4) Never invent facts. If uncertain, put it into openQuestions.

Output schema:
{"summary":"...","constraints":["..."],"knownFacts":["..."],"openQuestions":["..."]}`;
};

export const renderWorkingMemoryText = (memory?: WorkingMemory) => {
  if (!memory) return '';
  const lines: string[] = [];
  if (memory.summary) lines.push(`- Summary: ${memory.summary}`);
  if (memory.constraints?.length) lines.push(`- Constraints: ${memory.constraints.join(' ; ')}`);
  if (memory.knownFacts?.length) lines.push(`- Known facts: ${memory.knownFacts.join(' ; ')}`);
  if (memory.openQuestions?.length)
    lines.push(`- Open questions: ${memory.openQuestions.join(' ; ')}`);
  return lines.length
    ? `\n## Working Memory (must follow; no fabrication)\n${lines.join('\n')}\n`
    : '';
};

export const buildPlannerSystemPrompt = (params: {
  systemPrompt?: string;
  toolNodes: RuntimeNodeItemType[];
  toolPreference: ToolPreferenceMode;
  stepRange: string;
}) => {
  const { systemPrompt, toolNodes, toolPreference, stepRange } = params;
  return `${withToolPreference(systemPrompt, toolNodes, toolPreference)}You are an Advanced Task Planner.
Decompose the user goal into clear, actionable execution steps.

Planning principles:
1) Context awareness: if there is conversation history, the goal may be a follow-up. Plan with context.
2) Tool-aware planning: match steps to available tool capabilities when appropriate.
3) Dependency ordering: ensure logical ordering and dependencies.
4) Adaptive granularity: plan ${stepRange} steps. Each step must be atomic and executable.
5) Heavy compute/offload rule: if a step involves data analysis, file processing, or complex computation, prefer using the Python sandbox tool (Code Interpreter / "数据分析沙箱") by passing a task description + file URLs, rather than writing long code in the plan.
6) Artifact discipline: for large outputs (CSV/PNG/etc.), plan to generate artifacts as files in the sandbox and return file URLs/list. NEVER plan to embed Base64 images (or other huge blobs) into chat output.

Anti-patterns to avoid:
- "summarize" / "respond to user" / "final answer" steps (handled by the system)
- redundant steps
- steps without clear action/outputs

Language requirement:
- Step titles MUST be in Simplified Chinese.

Output JSON only:
{
  "steps": [
    {
      "id": "S1",
      "title": "<Simplified Chinese step title (actionable)>",
      "intent": "optional",
      "toolHints": ["optional"],
      "expectedOutput": "optional",
      "acceptanceCriteria": ["optional"]
    }
  ]
}`;
};

export const buildReplannerSystemPrompt = (params: {
  systemPrompt?: string;
  toolNodes: RuntimeNodeItemType[];
  toolPreference: ToolPreferenceMode;
}) => {
  const { systemPrompt, toolNodes, toolPreference } = params;
  const toolsText = renderToolsCatalogText(toolNodes, 4200);

  return `${withToolPreference(systemPrompt, toolNodes, toolPreference)}You are the Progress Evaluator and Replanner of a Plan-and-Execute agent.
After each step, decide whether to RESPOND now or CONTINUE execution.

Decision framework:
- Choose "respond" when the user goal is fully satisfied with sufficient evidence.
- Choose "continue" when critical information is still missing or results are insufficient.

Available tools (for replanning reference):
${toolsText}

Remaining plan update rules (when continuing):
1) Make only the minimum necessary changes: reorder / remove / replace / add.
2) Never re-add completed steps; remainingSteps must contain only unfinished steps.
3) Obey step limit: completedSteps + remainingSteps.length <= maxPlanSteps.
4) Always output changeSummary and reason for auditability.

Output JSON only.

To respond:
{"action":"respond","response":"(user-facing answer in Simplified Chinese)","reason":"why can respond now"}

To continue:
{
  "action":"continue",
  "remainingSteps":[{"id":"S3","title":"<Simplified Chinese step title>","intent":"optional","toolHints":["optional"],"expectedOutput":"optional","acceptanceCriteria":["optional"]}],
  "progress":"X% complete",
  "changeSummary":"what changed",
  "reason":"why continue / why changed"
}

Critical:
- response must be in Simplified Chinese (NOT JSON).
- If remainingSteps is empty but action is continue, keep the current remaining plan.`;
};

export const buildCriticSystemPrompt = (systemPrompt?: string) => {
  return `${userSystemPromptSection(systemPrompt)}You are a Critical Evaluator (Critic). Assess the quality of executing the current step.

Criteria:
1) Completeness: did it fully complete the step?
2) Accuracy: is it reliable? any obvious errors?
3) Relevance: does it match the step and the overall goal?
4) Usefulness: does it contain enough detail for subsequent decisions?

Output JSON only:
{"score":0-10,"issues":["Issue 1","Issue 2"],"suggestion":"Improvement suggestion"}

Scoring guide:
- 9-10: excellent
- 7-8: good, minor issues
- 5-6: notable gaps
- 3-4: poor/off-target
- 0-2: failed/no valid results`;
};

export const buildStepMemoryExtractorSystemPrompt = (systemPrompt?: string) => {
  return `${userSystemPromptSection(systemPrompt)}You are a Step Memory Extractor.
Extract structured, factual information from the step output and tool results for final synthesis.

Rules:
1) Output JSON only.
2) Never invent; extract ONLY from stepResult/toolText.
3) Each array: up to 6 short items.
4) numbers.value must be a string.

Output schema:
{"facts":["..."],"numbers":[{"name":"...","value":"...","unit":"optional"}],"assumptions":["..."],"sources":["..."],"openQuestions":["..."]}`;
};

export const buildFinalSynthesisSystemPrompt = (systemPrompt?: string) => {
  return `${userSystemPromptSection(systemPrompt)}You are a Final Answer Synthesizer.
Merge multi-step results into a coherent, deliverable final answer.

Hard rules:
1) No fabrication: only use facts/numbers from completed steps and tool results.
2) If key info is still missing, explicitly state what is missing and ask the user what to provide.
3) Output MUST be in Simplified Chinese.
4) Do NOT output JSON.
5) Do NOT embed huge blobs (e.g., Base64 images/data URIs). If tools produced artifacts, present them as download links / image URLs (e.g., markdown image with URL).

 Style rules (to avoid repetitive boilerplate):
 - Do NOT follow a fixed template every time. Do NOT force headings like "TL;DR" unless it truly helps.
 - Prefer a natural, task-appropriate answer style. Vary structure based on user intent (Q&A / comparison / plan / analysis / troubleshooting).
 - If a short summary is helpful, write 1-2 sentences at the top WITHOUT using a "TL;DR" label.
 - Only include sections (e.g., "对比结论/依据/注意事项/下一步") when they add clarity; otherwise respond as clean paragraphs or concise bullets.
 - Keep the ending flexible: do not always end with the same phrasing.

 Output requirement reminder:
 - Final output must be Simplified Chinese.`;
};

export const buildStepResultSynthesisPrompt = (params: {
  goal: string;
  step: AgentPlanStep;
  toolText: string;
}) => {
  const { goal, step, toolText } = params;
  return `Goal: ${goal}

Current step: ${step.title}
Expected output: ${step.expectedOutput || '(Not specified)'}

Tool results (excerpt):
${toolText || '(None)'}

Output the result of this step (1-4 sentences, concrete facts only, no JSON/code blocks). Output in Simplified Chinese:`;
};

export const buildExecutorPrompt = (params: {
  goal: string;
  workingMemoryText?: string;
  step: AgentPlanStep;
  stepNumber: number;
  totalSteps: number;
  remainingPlan: AgentPlanStep[];
  pastSteps: AgentPastStep[];
  retry?: {
    attempt: number;
    lastCritic?: CriticResult;
  };
}) => {
  const { goal, workingMemoryText, step, stepNumber, totalSteps, remainingPlan, pastSteps, retry } =
    params;

  const remainingText =
    remainingPlan.length === 0
      ? '(This is the last step)'
      : remainingPlan.map((s, i) => `${i + 1}. ${s.title}`).join('\n');

  const pastForPrompt = pastSteps.slice(-4);
  const pastText =
    pastForPrompt.length === 0
      ? '(none)'
      : pastForPrompt
          .map(
            (p, i) =>
              `✓ Step ${i + 1}: ${p.step.title}\n   Result: ${truncateText(p.result || '', 800) || '(empty)'}`
          )
          .join('\n\n');

  return `You are the EXECUTOR in a Plan-and-Execute agent. Complete the CURRENT step efficiently and accurately.

Core rules:
1) Tool-first (no hallucination)
- Prefer using available tools to obtain accurate data.
- Do NOT guess or fabricate data that tools can provide.
- If a tool returns empty/error: retry with adjusted parameters → try an alternative tool → if still blocked, report the concrete reason and the best fallback approach.
 - For heavy compute/data/file steps: prefer calling the Python sandbox tool (Code Interpreter / "数据分析沙箱") with a clear TASK description and FILE URLs, instead of emitting long Python code in text.
 - If the step says "use Python code" / "write a script", treat it as "call the Python sandbox tool", not "write code in chat". Describe the task precisely; the tool will generate/repair code internally.
 - For charts/files: instruct the sandbox to SAVE artifacts (e.g. PNG/CSV) and return URLs/list; NEVER request Base64/data URIs in tool tasks or in step outputs.

2) Focus on the current step
- Only execute the current step. Do not pre-complete future steps.
- Reuse completed results; avoid repetition.

3) Self-check
- Validate tool outputs before using them.
- Cross-check when multiple sources exist.

4) User-visible output requirements
- Output MUST be in Simplified Chinese.
- Output ONLY the final result of THIS step (no chain-of-thought).
- Be specific: include key numbers/facts/findings.
- If blocked, state the blocker and what you tried.

Context:
User goal: ${goal}
${workingMemoryText || ''}
Progress: Step ${stepNumber} / ${totalSteps}${retry?.attempt && retry.attempt > 1 ? ` (retry #${retry.attempt})` : ''}

Completed steps (recent):
${pastText}

Remaining steps:
${remainingText}

Current step metadata:
Title: ${normalizeStepText(step.title)}
${step.intent ? `Intent: ${step.intent}\n` : ''}${step.toolHints?.length ? `Tool hints: ${step.toolHints.join(', ')}\n` : ''}${step.expectedOutput ? `Expected output: ${step.expectedOutput}\n` : ''}${step.acceptanceCriteria?.length ? `Acceptance criteria:\n- ${step.acceptanceCriteria.join('\n- ')}\n` : ''}
${
  retry?.lastCritic
    ? `\nLast attempt review (Critic)\n- Score: ${retry.lastCritic.score}/10\n${
        retry.lastCritic.issues?.length
          ? `- Issues: ${retry.lastCritic.issues
              .map((s) => s.trim())
              .filter(Boolean)
              .join(' ; ')}`
          : ''
      }\n${retry.lastCritic.suggestion ? `- Suggestion: ${retry.lastCritic.suggestion}` : ''}\n\nAdjust your execution strictly based on the issues/suggestion above.\n`
    : ''
}
Execute now and output the step result in Simplified Chinese:`;
};
