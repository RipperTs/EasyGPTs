import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type { ModuleDispatchProps } from '@fastgpt/global/core/workflow/runtime/type';
import { DispatchNodeResultType } from '@fastgpt/global/core/workflow/runtime/type';
import axios from 'axios';
import { formatHttpError } from '../utils';
import { getAIApi } from '../../../ai/config';
import { formatModelChars2Points } from '../../../../support/wallet/usage/utils';
import { getLLMModel, ModelTypeEnum } from '../../../ai/model';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import type {
  ChatCompletionMessageParam,
  SdkChatCompletionMessageParam
} from '@fastgpt/global/core/ai/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemType, UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { addLog } from '../../../../common/system/log';
import {
  fetchCodeInterpreterCapabilities,
  summarizeCodeInterpreterCapabilities
} from './capabilities';
import iconv from 'iconv-lite';
import type { Readable } from 'stream';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.aiModel]: string;
  [NodeInputKeyEnum.aiSystemPrompt]?: string;
  [NodeInputKeyEnum.codeInterpreterMaxRetry]?: number;
  [NodeInputKeyEnum.codeInterpreterTimeout]?: number;
  [NodeInputKeyEnum.fileUrlList]?: string[];
  [NodeInputKeyEnum.userChatInput]?: string;
  [NodeInputKeyEnum.code]?: string;
}>;

type Response = DispatchNodeResultType<{
  [NodeOutputKeyEnum.error]: string;
  [NodeOutputKeyEnum.result]: string;
  [NodeOutputKeyEnum.execution_time]: number;
  [NodeOutputKeyEnum.image_url]: string;
  [NodeOutputKeyEnum.files]: string[];
  [NodeOutputKeyEnum.inputs]: string[];
  [NodeOutputKeyEnum.code]: string;
}>;

type ToolOutput = {
  [NodeOutputKeyEnum.result]: string;
  [NodeOutputKeyEnum.error]: string;
  [NodeOutputKeyEnum.execution_time]: number;
  [NodeOutputKeyEnum.image_url]: string;
  [NodeOutputKeyEnum.files]: string[];
  [NodeOutputKeyEnum.inputs]: string[];
  [NodeOutputKeyEnum.code]: string;
};

// 最大允许的 stdout 输出长度（字符数），超过此长度会触发警告和重试
const MAX_STDOUT_LENGTH = 2000;

const DEFAULT_SYSTEM_PROMPT =
  'You are a senior Python engineer acting as a Code Interpreter Orchestrator.\n' +
  'Your job is to generate and/or fix runnable Python code to solve the given task in a sandbox, then iterate until it succeeds.\n' +
  '\n' +
  'Execution environment:\n' +
  '- The server will download each URL in `files` into the current working directory before running the code.\n' +
  '- Your code can read/write local files in the working directory.\n' +
  '- Network access may be restricted; do not rely on external HTTP calls.\n' +
  '\n' +
  'CRITICAL - Tabular Data Hygiene (Pandas/CSV/Excel):\n' +
  '- NEVER assume column names. Always inspect and use the actual columns present.\n' +
  '- Always normalize column names immediately after loading:\n' +
  '  - df.columns = df.columns.map(str).str.strip()\n' +
  '  - If headers look like "中文名(english_name)", create aliases so BOTH "中文名" and "english_name" work.\n' +
  '  - Many real-world exports include leading/trailing spaces in headers; stripping is mandatory.\n' +
  '- When referencing a column, do NOT hardcode a single name. Use a resolver function that tries:\n' +
  '  - exact match after strip\n' +
  '  - aliases from "X(Y)" patterns (both X and Y)\n' +
  '  - case-insensitive / whitespace-insensitive match\n' +
  '  - contains-match as last resort\n' +
  '  If still not found, fail with a short error that includes available columns (single line).\n' +
  '- If a column is missing (KeyError / Column not found), do NOT guess. Use the available columns and re-map.\n' +
  '\n' +
  'CRITICAL - Token & Output Discipline:\n' +
  '- This tool is used for heavy data/file/compute tasks. Use Python to compute and summarize results.\n' +
  '- NEVER print large datasets, raw file contents, or long lists.\n' +
  '- Prefer producing artifacts (CSV/JSON/PNG) and print only a short conclusion (<= 2000 chars).\n' +
  '- If the best output is a file (cleaned dataset/report), write it to disk and keep stdout minimal.\n' +
  '\n' +
  'CRITICAL - Data Processing Rules:\n' +
  '- ALL data processing, analysis, aggregation, and transformation MUST be done in your Python code.\n' +
  '- DO NOT return raw data, long lists, or full datasets to stdout for "further analysis".\n' +
  '- Compute statistics, summaries, and final results IN CODE, then print only the final answer.\n' +
  '- For large datasets: calculate counts, averages, top-N items, etc. in code; print a concise summary.\n' +
  '- For text analysis: perform all NLP/text processing in code; print only the conclusion.\n' +
  '\n' +
  'Output rules:\n' +
  '- Output ONLY Python code (prefer a fenced ```python code block```). No explanations.\n' +
  '- Make the code self-contained and directly runnable as a script.\n' +
  '- Print CONCISE final text results to stdout (max 2000 chars). If structured, use compact JSON.\n' +
  '- For visualizations/files: save them (e.g. plt.savefig("chart.png"), df.to_csv("data.csv")).\n' +
  '  The Code Interpreter service will AUTOMATICALLY detect and return file URLs in `image_url` and `files` response fields.\n' +
  '  DO NOT print filenames or file paths to stdout. Stdout is ONLY for text results (or can be empty if only generating files).\n' +
  '- NEVER output images as Base64, data URIs, or long binary strings in stdout.\n' +
  '- NEVER return full file contents, raw data dumps, or intermediate processing results to stdout.\n' +
  '- Prefer the standard library. If you use optional libraries (pandas/numpy/matplotlib), handle ImportError and degrade gracefully.\n' +
  '- Be robust with file names: list the working directory and infer the correct local file to open when needed.\n';

const parseRetryTimes = (value: unknown, defaultValue = 3) => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : defaultValue;

  if (!Number.isFinite(num)) return defaultValue;

  const rounded = Math.round(num);
  return Math.min(Math.max(rounded, 1), 10);
};

const parseTimeoutSeconds = (value: unknown, defaultValue = 120) => {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : defaultValue;

  if (!Number.isFinite(num)) return defaultValue;

  const rounded = Math.round(num);
  return Math.min(Math.max(rounded, 5), 600);
};

const extractPythonCodeFromModelOutput = (raw: string) => {
  const text = raw.trim();
  if (!text) return '';

  const fenced = text.match(/```(?:python|py)?\s*([\s\S]*?)\s*```/i)?.[1];
  return (fenced ?? text).trim();
};

const FILE_PROBE_MARKER = '__FILE_PROBE__';

type FileProbeAliasCandidate = {
  source: string;
  base: string;
  alias: string;
};

type FileProbeFile = {
  name: string;
  size: number;
  ext: string;
  tabular: boolean;
  columns?: string[];
  strippedColumns?: string[];
  aliasCandidates?: FileProbeAliasCandidate[];
  dtypes?: Record<string, string>;
  nonNullCounts?: Record<string, number>;
  headText?: string;
  headEncoding?: string;
  isBinary?: boolean;
  headHex?: string;
  error?: string;
};

type FileProbePayload = {
  files: FileProbeFile[];
};

type RemoteFileHead = {
  url: string;
  ok: boolean;
  status?: number;
  isBinary?: boolean;
  encoding?: string;
  headText?: string;
  headHex?: string;
  error?: string;
};

const parseFileProbeFromLog = (log: string): FileProbePayload | undefined => {
  const idx = log.indexOf(FILE_PROBE_MARKER);
  if (idx < 0) return;
  const jsonText = log.slice(idx + FILE_PROBE_MARKER.length).trim();
  if (!jsonText) return;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!isRecord(parsed)) return;
    const files = parsed.files;
    if (!Array.isArray(files)) return;

    const normalizedFiles: FileProbeFile[] = files
      .map((f): FileProbeFile | null => {
        const rec = getRecord(f);
        if (!rec) return null;
        const name = typeof rec.name === 'string' ? rec.name : '';
        const ext = typeof rec.ext === 'string' ? rec.ext : '';
        const size = parseNumber(rec.size, 0);
        const tabular = Boolean(rec.tabular);
        const columns = Array.isArray(rec.columns)
          ? rec.columns.filter((c): c is string => typeof c === 'string').slice(0, 200)
          : undefined;
        const strippedColumns = Array.isArray(rec.strippedColumns)
          ? rec.strippedColumns.filter((c): c is string => typeof c === 'string').slice(0, 200)
          : undefined;
        const aliasCandidates = Array.isArray(rec.aliasCandidates)
          ? rec.aliasCandidates
              .map((item): FileProbeAliasCandidate | null => {
                const itemRec = getRecord(item);
                if (!itemRec) return null;
                const source = typeof itemRec.source === 'string' ? itemRec.source : '';
                const base = typeof itemRec.base === 'string' ? itemRec.base : '';
                const alias = typeof itemRec.alias === 'string' ? itemRec.alias : '';
                if (!source || !base || !alias) return null;
                return { source, base, alias };
              })
              .filter((a): a is FileProbeAliasCandidate => a !== null)
              .slice(0, 200)
          : undefined;
        const dtypes = (() => {
          const obj = getRecord(rec.dtypes);
          if (!obj) return undefined;
          const out: Record<string, string> = {};
          Object.keys(obj).forEach((k) => {
            const v = obj[k];
            if (typeof v === 'string') out[k] = v;
          });
          return Object.keys(out).length > 0 ? out : undefined;
        })();
        const nonNullCounts = (() => {
          const obj = getRecord(rec.nonNullCounts);
          if (!obj) return undefined;
          const out: Record<string, number> = {};
          Object.keys(obj).forEach((k) => {
            out[k] = parseNumber(obj[k], 0);
          });
          return Object.keys(out).length > 0 ? out : undefined;
        })();
        const headText = typeof rec.headText === 'string' ? rec.headText : undefined;
        const headEncoding = typeof rec.headEncoding === 'string' ? rec.headEncoding : undefined;
        const isBinary = typeof rec.isBinary === 'boolean' ? rec.isBinary : undefined;
        const headHex = typeof rec.headHex === 'string' ? rec.headHex : undefined;
        const error = typeof rec.error === 'string' ? rec.error : undefined;

        if (!name) return null;
        return {
          name,
          ext,
          size,
          tabular,
          columns,
          strippedColumns,
          aliasCandidates,
          dtypes,
          nonNullCounts,
          headText,
          headEncoding,
          isBinary,
          headHex,
          error
        };
      })
      .filter((f): f is FileProbeFile => f !== null);

    return { files: normalizedFiles };
  } catch {
    return;
  }
};

const buildFileProbePrompt = (payload?: FileProbePayload) => {
  if (!payload || payload.files.length === 0) return '';

  const lines: string[] = [];
  const localFiles = payload.files
    .map((f) => `${f.name}${f.size ? ` (${f.size} bytes)` : ''}`)
    .slice(0, 30);
  lines.push('Auto file probe (local working directory):');
  lines.push(`- Files: ${localFiles.join(', ') || '(none)'}`);

  const withHead = payload.files.filter((f) => Boolean(f.headText) || Boolean(f.headHex));
  if (withHead.length > 0) {
    lines.push('');
    lines.push(
      'File head preview (short excerpt to infer format/encoding; do NOT assume anything beyond this):'
    );
    withHead.slice(0, 3).forEach((f) => {
      if (f.headText) {
        lines.push(
          `- ${f.name}: headText(${f.headEncoding || 'unknown'}) = ${JSON.stringify(f.headText)}`
        );
      } else if (f.headHex) {
        lines.push(`- ${f.name}: binary headHex(first 64 bytes) = ${f.headHex}`);
      }
    });
    if (withHead.length > 3) {
      lines.push(`- (omitted ${withHead.length - 3} more file previews to save tokens)`);
    }
  }

  const tabular = payload.files.filter((f) => f.tabular && (f.strippedColumns?.length || 0) > 0);
  if (tabular.length === 0) return lines.join('\n');

  lines.push('');
  lines.push('Tabular schema hints (use these exact column names; headers may contain spaces):');
  tabular.slice(0, 3).forEach((f) => {
    const cols = (f.strippedColumns?.length ? f.strippedColumns : f.columns) ?? [];
    lines.push(`- ${f.name}: columns(stripped) = ${JSON.stringify(cols.slice(0, 60))}`);
    if (f.aliasCandidates && f.aliasCandidates.length > 0) {
      const shown = f.aliasCandidates
        .slice(0, 20)
        .map((a) => `${a.source} => ${a.base} / ${a.alias}`);
      lines.push(
        `  - alias candidates: ${shown.join('; ')}${f.aliasCandidates.length > 20 ? '; ...' : ''}`
      );
    }
    if (f.dtypes && Object.keys(f.dtypes).length > 0) {
      const entries = Object.entries(f.dtypes).slice(0, 12);
      lines.push(`  - dtypes(sample): ${JSON.stringify(Object.fromEntries(entries))}`);
    }
  });

  lines.push('');
  lines.push(
    'IMPORTANT: after loading any DataFrame, do df.columns = df.columns.map(str).str.strip() and create aliases for "X(Y)".'
  );

  return lines.join('\n');
};

const readStreamHead = async (stream: Readable, maxBytes: number) => {
  const chunks: Buffer[] = [];
  let total = 0;

  return await new Promise<Buffer>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      stream.removeAllListeners('data');
      stream.removeAllListeners('end');
      stream.removeAllListeners('error');
      stream.removeAllListeners('close');
    };

    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    stream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buf);
      total += buf.length;
      if (total >= maxBytes) {
        if (settled) return;
        settled = true;

        // Stop receiving further data ASAP to avoid downloading the whole file.
        // Replace error handler to avoid unhandled 'error' after we resolve.
        stream.off('error', onError);
        stream.on('error', () => {});
        try {
          stream.destroy();
        } catch {
          // ignore
        }
        // Keep listeners minimal; stream is destroyed anyway.
        stream.removeAllListeners('data');
        stream.removeAllListeners('end');
        stream.removeAllListeners('close');

        resolve(Buffer.concat(chunks, Math.min(total, maxBytes)).subarray(0, maxBytes));
      }
    });
    stream.on('end', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, total).subarray(0, maxBytes));
    });
    stream.on('close', () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, total).subarray(0, maxBytes));
    });
    stream.on('error', onError);
  });
};

const isProbablyBinaryBuffer = (buf: Buffer) => {
  if (buf.length === 0) return false;
  if (buf.includes(0)) return true;
  let controls = 0;
  const limit = Math.min(buf.length, 1024);
  for (let i = 0; i < limit; i++) {
    const b = buf[i];
    if (b === 9 || b === 10 || b === 13) continue;
    if (b < 32 || b === 127) controls++;
  }
  return controls / Math.max(1, limit) > 0.12;
};

const decodePreviewText = (buf: Buffer) => {
  const tryList: Array<{ enc: string; decode: (b: Buffer) => string }> = [
    { enc: 'utf-8', decode: (b) => b.toString('utf8') },
    { enc: 'gb18030', decode: (b) => iconv.decode(b, 'gb18030') },
    { enc: 'gbk', decode: (b) => iconv.decode(b, 'gbk') },
    { enc: 'latin1', decode: (b) => b.toString('latin1') }
  ];

  for (const item of tryList) {
    try {
      const text = item.decode(buf);
      return { text, encoding: item.enc };
    } catch {
      // try next
    }
  }
  return { text: '', encoding: '' };
};

const fetchRemoteFileHeads = async ({
  urls,
  maxFiles = 3,
  maxBytes = 2048,
  timeoutMs = 8000
}: {
  urls: string[];
  maxFiles?: number;
  maxBytes?: number;
  timeoutMs?: number;
}): Promise<RemoteFileHead[]> => {
  const targets = urls.slice(0, Math.max(0, maxFiles));
  if (targets.length === 0) return [];

  const results: RemoteFileHead[] = [];

  for (const url of targets) {
    try {
      // Best-effort: request range to reduce bandwidth; if server ignores, we still cut after maxBytes.
      const resp = await axios.get(url, {
        responseType: 'stream',
        timeout: timeoutMs,
        headers: {
          Range: `bytes=0-${Math.max(0, maxBytes - 1)}`
        },
        maxRedirects: 3
      });

      const status = typeof resp.status === 'number' ? resp.status : undefined;
      const data = resp.data as unknown;
      const stream =
        data && typeof (data as { pipe?: unknown }).pipe === 'function'
          ? (data as Readable)
          : undefined;
      if (!stream) {
        results.push({ url, ok: false, status, error: 'Invalid stream response' });
        continue;
      }

      const buf = await readStreamHead(stream, maxBytes);
      const isBinary = isProbablyBinaryBuffer(buf);
      if (isBinary) {
        results.push({
          url,
          ok: true,
          status,
          isBinary: true,
          headHex: buf.subarray(0, 64).toString('hex')
        });
        continue;
      }

      const { text, encoding } = decodePreviewText(buf);
      const normalized = text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/[ \t]{6,}/g, '    ');

      results.push({
        url,
        ok: true,
        status,
        isBinary: false,
        encoding,
        headText: normalized.slice(0, 600)
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.push({ url, ok: false, error: message });
    }
  }

  return results;
};

const buildRemoteFileHeadPrompt = (heads: RemoteFileHead[]) => {
  if (heads.length === 0) return '';

  const lines: string[] = [];
  lines.push(
    'Remote file head preview (downloaded only a small first chunk; use it to infer format/encoding/header):'
  );
  heads.forEach((h, idx) => {
    const prefix = `- [${idx + 1}]`;
    if (!h.ok) {
      lines.push(`${prefix} ${h.url}: (failed to fetch head) ${h.error || ''}`.trim());
      return;
    }
    if (h.isBinary) {
      lines.push(`${prefix} ${h.url}: binary headHex(first 64 bytes) = ${h.headHex || ''}`.trim());
      return;
    }
    lines.push(
      `${prefix} ${h.url}: headText(${h.encoding || 'unknown'}) = ${JSON.stringify(h.headText || '')}`.trim()
    );
  });
  lines.push(
    'IMPORTANT: the preview may be truncated; always implement robust sniffing and column resolution in code.'
  );
  return lines.join('\n');
};

const buildColumnMismatchHint = (errorText: string, payload?: FileProbePayload) => {
  if (!payload || payload.files.length === 0) return '';

  const extractMissingColumn = (text: string) => {
    // pandas KeyError: 'xxx'
    const keyErrorMatch = text.match(/KeyError:\s*'([^']+)'/);
    if (keyErrorMatch?.[1]?.trim()) return keyErrorMatch[1].trim();

    // pandas groupby __getitem__: Column not found: xxx
    const notFoundMatch = text.match(/Column not found:\s*([^\n\r]+)/);
    if (notFoundMatch?.[1]?.trim()) return notFoundMatch[1].trim();

    // sometimes wrapped as: KeyError: Column not found: xxx
    const wrappedNotFound = text.match(/KeyError:\s*Column not found:\s*([^\n\r]+)/);
    if (wrappedNotFound?.[1]?.trim()) return wrappedNotFound[1].trim();

    return '';
  };

  const missing = extractMissingColumn(errorText);
  if (!missing) return '';

  const normalize = (s: string) =>
    s
      .trim()
      .replace(/\s+/g, '')
      .replace(/[（）()]/g, '')
      .toLowerCase();
  const missingNorm = normalize(missing);

  const candidates = new Set<string>();
  payload.files.forEach((f) => {
    (f.strippedColumns ?? f.columns ?? []).forEach((c) => candidates.add(c));
    f.aliasCandidates?.forEach((a) => {
      candidates.add(a.base);
      candidates.add(a.alias);
      candidates.add(a.source);
    });
  });

  const possible = Array.from(candidates)
    .filter(Boolean)
    .map((c) => ({ c, n: normalize(c) }))
    .filter(({ c, n }) => {
      if (!n || !missingNorm) return false;
      if (n === missingNorm) return true;
      if (n.includes(missingNorm) || missingNorm.includes(n)) return true;
      // if error had spaces, try raw contains as well
      if (c.includes(missing) || missing.includes(c)) return true;
      return false;
    })
    .map(({ c }) => c)
    .slice(0, 20);

  const hintLines = [
    'Extra hint:',
    `- Missing column from error: ${JSON.stringify(missing)}`,
    possible.length > 0
      ? `- Possible existing columns/aliases: ${JSON.stringify(possible)}`
      : '- No direct match found; inspect df.columns and re-map explicitly.',
    '- Remember: headers often include hidden leading/trailing spaces; strip them and handle "X(Y)" aliases.'
  ];
  return hintLines.join('\n');
};

const buildCommonErrorTriageHint = (errorText: string) => {
  const text = errorText || '';
  if (!text.trim()) return '';

  const hints: string[] = [];

  if (/ModuleNotFoundError|ImportError/i.test(text)) {
    hints.push(
      '- Import/module error: prefer stdlib or common libs (pandas/numpy/matplotlib). If a library is missing, implement a fallback without it.'
    );
  }
  if (/FileNotFoundError|No such file or directory/i.test(text)) {
    hints.push(
      '- File not found: list local files via os.listdir(".") and open the downloaded filename (do not assume the original upload name/path).'
    );
  }
  if (/UnicodeDecodeError|codec can\'t decode|invalid start byte/i.test(text)) {
    hints.push(
      '- Encoding error: for CSV try encodings ["utf-8-sig","utf-8","gb18030","gbk","latin1"] and consider sep=None, engine="python".'
    );
  }
  if (/ParserError|Error tokenizing data|Expected \\d+ fields/i.test(text)) {
    hints.push(
      '- CSV parse error: try specifying delimiter (sep=","/"\\t"/";"), quoting, and on_bad_lines="skip" (pandas>=1.3).'
    );
  }
  if (/MemoryError/i.test(text)) {
    hints.push(
      '- Memory error: use chunked processing (read_csv(..., chunksize=...)) and aggregate incrementally; avoid loading full data into memory.'
    );
  }
  if (/to_datetime|datetime|ValueError:.*time/i.test(text)) {
    hints.push(
      '- Datetime parse issues: use pd.to_datetime(..., errors="coerce") and validate the actual column chosen; never assume date column name.'
    );
  }
  if (/to_numeric|could not convert string to float|invalid literal/i.test(text)) {
    hints.push(
      '- Numeric parse issues: use pd.to_numeric(..., errors="coerce") and clean separators (commas, currency symbols) before conversion.'
    );
  }

  if (hints.length === 0) return '';
  return ['Common triage:', ...hints].join('\n');
};

const buildFixCodeMessages = ({
  systemPrompt,
  files,
  currentCode,
  errorText,
  capabilitiesText,
  fileProbeText,
  task,
  chatContext
}: {
  systemPrompt: string;
  files: string[];
  currentCode: string;
  errorText: string;
  capabilitiesText?: string;
  fileProbeText?: string;
  task?: string;
  chatContext?: string;
}): ChatCompletionMessageParam[] => {
  const filesPrompt =
    files.length > 0
      ? `\n\nInput file URLs (files):\n${files.map((url) => `- ${url}`).join('\n')}`
      : '\n\nInput file URLs (files): (none)';
  const capabilitiesPrompt = capabilitiesText ? `\n\n${capabilitiesText}` : '';
  const probePrompt = fileProbeText ? `\n\n${fileProbeText}` : '';
  const taskPrompt = task?.trim() ? `\n\nTask:\n${task.trim()}` : '';
  const contextPrompt = chatContext?.trim()
    ? `\n\nConversation context (recent excerpt):\n${chatContext.trim()}`
    : '';
  const userPrompt = `${filesPrompt}
${capabilitiesPrompt}
${probePrompt}
${taskPrompt}
${contextPrompt}

Failed code:
\`\`\`python
${currentCode}
\`\`\`

Runtime error:
${errorText}

Fix the code so it runs successfully.

CRITICAL Rules:
- Output ONLY code (MUST be a \`\`\`python code block\`\`\`).
- Perform ALL data processing/analysis/aggregation IN YOUR CODE, not after execution.
- Print ONLY final text results to stdout (max ~2000 chars). Use concise summaries, not raw data.
- For large datasets: calculate statistics/summaries in code, print compact results only.
- Be robust with local file names: list the working directory and open the correct downloaded file.
- For visualizations/files: save to local files (e.g. plt.savefig("chart.png"), df.to_csv("output.csv")).
  The Code Interpreter service will automatically detect generated files and return their URLs.
  DO NOT print filenames to stdout - stdout is for text results only (or leave empty if only generating files).
- DO NOT encode images to Base64 (no \`data:image/...;base64,\`, no long Base64 strings).
- DO NOT return full file contents, raw arrays, or intermediate data to stdout.`;

  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: systemPrompt
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: userPrompt
    }
  ];
};

const buildGenerateCodeMessages = ({
  systemPrompt,
  task,
  files,
  capabilitiesText,
  fileProbeText,
  chatContext
}: {
  systemPrompt: string;
  task: string;
  files: string[];
  capabilitiesText?: string;
  fileProbeText?: string;
  chatContext?: string;
}): ChatCompletionMessageParam[] => {
  const filesPrompt =
    files.length > 0
      ? `\n\nInput file URLs (files):\n${files.map((url) => `- ${url}`).join('\n')}`
      : '\n\nInput file URLs (files): (none)';
  const capabilitiesPrompt = capabilitiesText ? `\n\n${capabilitiesText}` : '';
  const probePrompt = fileProbeText ? `\n\n${fileProbeText}` : '';
  const contextPrompt = chatContext?.trim()
    ? `\n\nConversation context (recent excerpt, may help when the task says \"save previous answer\"):\n${chatContext.trim()}`
    : '';

  const userPrompt = `Task:
${task}
${filesPrompt}
${capabilitiesPrompt}
${probePrompt}
${contextPrompt}

You will have these variables available in the runtime (already defined for you):
- FILES: list[str] (input file URLs, may be empty)
- TASK: str (the task text)
- LAST_ASSISTANT_MESSAGE: str (last assistant message from conversation history, may be empty)
- LAST_USER_MESSAGE: str (last user message from conversation history, may be empty)
- CHAT_CONTEXT: str (recent conversation excerpt, may be empty)

Write a runnable Python script to solve the task.

CRITICAL Rules:
- Output ONLY code (MUST be a \`\`\`python code block\`\`\`).
- Perform ALL data processing/analysis/aggregation IN YOUR CODE.
- Print ONLY the final concise result (<= ~2000 chars). Prefer compact JSON.
- NEVER print raw datasets / long lists / file contents.
- For large outputs, write them to files (CSV/JSON/PNG) instead of stdout.
- For charts, save images to local files (e.g. plt.savefig("chart.png")). The executor will return image_url/files.
- Do NOT print filenames to stdout. Stdout is only for final text results (or empty).`;

  return [
    {
      role: ChatCompletionRequestMessageRoleEnum.System,
      content: systemPrompt
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: userPrompt
    }
  ];
};

const callModelGetCode = async ({
  model,
  messages,
  aiParams
}: {
  model: string;
  messages: ChatCompletionMessageParam[];
  aiParams: Parameters<typeof getAIApi>[0];
}) => {
  const ai = getAIApi(aiParams);
  const response = await ai.chat.completions.create({
    model,
    temperature: 0.01,
    messages: messages as SdkChatCompletionMessageParam[],
    stream: false
  });

  const answer = response.choices?.[0]?.message?.content || '';
  const tokens = response.usage?.total_tokens ?? (await countGptMessagesTokens(messages));

  const code = extractPythonCodeFromModelOutput(answer);
  return { code, tokens, raw: answer };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const isHttpUrl = (url: string) => /^https?:\/\//i.test(url);

const parseFilesFromHistories = (histories: ChatItemType[]) => {
  return histories
    .filter((item) => {
      if (item.obj === ChatRoleEnum.Human) {
        return item.value.filter((value) => value.type === 'file');
      }
      return false;
    })
    .map((item) => {
      const value = item.value as UserChatItemValueItemType[];
      const files = value
        .map((item) => {
          return item.file?.url;
        })
        .filter(Boolean) as string[];
      return files;
    })
    .flat();
};

const buildChatContextFromHistories = (
  histories: ChatItemType[],
  maxChars = 12000,
  maxItems = 14
) => {
  const items = histories
    .filter((h) => h.obj === ChatRoleEnum.Human || h.obj === ChatRoleEnum.AI)
    .slice(-maxItems)
    .map((h) => {
      const role = h.obj === ChatRoleEnum.Human ? 'Human' : 'Assistant';
      const text = chatValue2RuntimePrompt(h.value).text || '';
      return text ? `${role}: ${text}` : '';
    })
    .filter(Boolean);

  const joined = items.join('\n\n').trim();
  if (!joined) return '';
  if (joined.length <= maxChars) return joined;
  return joined.slice(-maxChars);
};

const getLastRoleMessageText = (histories: ChatItemType[], role: ChatRoleEnum) => {
  for (let i = histories.length - 1; i >= 0; i--) {
    const item = histories[i];
    if (item.obj !== role) continue;
    const text = chatValue2RuntimePrompt(item.value).text || '';
    if (text.trim()) return text.trim();
  }
  return '';
};

const parsePublicFileUrl = ({
  url,
  requestOrigin
}: {
  url: string;
  requestOrigin?: string;
}): string => {
  if (!process.env.FE_DOMAIN) {
    throw new Error('Can not find FE_DOMAIN in env');
  }

  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('blob:') || trimmed.startsWith('data:')) return '';

  const baseOrigin = process.env.FE_DOMAIN.trim();

  // 如果是HTTP URL，替换为FE_DOMAIN的域名（保留路径和查询参数）
  if (isHttpUrl(trimmed)) {
    try {
      const urlObj = new URL(trimmed);
      const baseUrlObj = new URL(baseOrigin);
      // 替换协议、域名和端口，保留路径和查询参数
      urlObj.protocol = baseUrlObj.protocol;
      urlObj.hostname = baseUrlObj.hostname;
      urlObj.port = baseUrlObj.port;
      return urlObj.toString();
    } catch {
      return trimmed;
    }
  }

  if (!baseOrigin) return '';

  try {
    return new URL(trimmed, baseOrigin).toString();
  } catch {
    return '';
  }
};

const parseCodeInterpreterFiles = ({
  fileUrlList,
  histories,
  requestOrigin,
  maxFiles
}: {
  fileUrlList?: string[];
  histories: ChatItemType[];
  requestOrigin?: string;
  maxFiles: number;
}) => {
  const inputUrls = parseStringArray(fileUrlList);
  const historyUrls = parseFilesFromHistories(histories);

  const urlList = [...inputUrls, ...historyUrls]
    .map((url) => parsePublicFileUrl({ url, requestOrigin }))
    .filter(Boolean);

  // 去重 + 限制数量（避免传超大数组给执行器）
  return Array.from(new Set(urlList)).slice(0, maxFiles);
};

const buildExecuteCode = ({
  task,
  chatContext,
  lastUserMessage,
  lastAssistantMessage,
  pythonCode,
  files
}: {
  task: string;
  chatContext: string;
  lastUserMessage: string;
  lastAssistantMessage: string;
  pythonCode: string;
  files: string[];
}) => `# -*- coding: utf-8 -*-
"""
Input file URLs (downloaded into current working directory before execution):
${files.length > 0 ? files.map((url) => `- ${url}`).join('\n') : '(none)'}
"""

TASK = ${JSON.stringify(task)}
CHAT_CONTEXT = ${JSON.stringify(chatContext)}
LAST_USER_MESSAGE = ${JSON.stringify(lastUserMessage)}
LAST_ASSISTANT_MESSAGE = ${JSON.stringify(lastAssistantMessage)}
FILES = ${JSON.stringify(files)}

# -------------------- Runtime Helpers (auto-fix common tabular pitfalls) --------------------
# These helpers aim to reduce brittle failures (e.g. header spaces, "X(Y)" alias columns)
# without requiring the LLM to remember every edge case.
import json
import os
import re
import sys
from pathlib import Path

def _ci_safe_str(x):
    try:
        return str(x)
    except Exception:
        return ""

def _ci_strip_columns(df):
    try:
        cols = [_ci_safe_str(c) for c in list(df.columns)]
        stripped = [c.strip() for c in cols]
        # Avoid creating duplicate column names when stripping.
        if len(set(stripped)) == len(stripped):
            df.columns = stripped
    except Exception:
        pass

def _ci_add_alias_columns(df):
    # If a header looks like "中文名(english_name)", create df["中文名"] and df["english_name"] aliases.
    try:
        pattern = re.compile(r"^(.*)\\(([^()]+)\\)$")
        cols = [_ci_safe_str(c).strip() for c in list(df.columns)]
        for col in cols:
            m = pattern.match(col)
            if not m:
                continue
            base = (m.group(1) or "").strip()
            alias = (m.group(2) or "").strip()
            if not base or not alias:
                continue
            # create alias columns if missing; keep original source column intact
            if base not in df.columns:
                df[base] = df[col]
            if alias not in df.columns:
                df[alias] = df[col]
    except Exception:
        pass

def _ci_normalize_df(df):
    _ci_strip_columns(df)
    _ci_add_alias_columns(df)

def _ci_patch_pandas():
    try:
        import pandas as pd  # type: ignore
    except Exception:
        return

    def _wrap_reader(fn):
        def _wrapped(*args, **kwargs):
            df = fn(*args, **kwargs)
            try:
                _ci_normalize_df(df)
            except Exception:
                pass
            return df
        return _wrapped

    for _name in ("read_csv", "read_excel", "read_json"):
        try:
            if hasattr(pd, _name):
                setattr(pd, _name, _wrap_reader(getattr(pd, _name)))
        except Exception:
            pass

_ci_patch_pandas()

# -------------------- Auto file-head/schema probe on exception (no extra sandbox runs) --------------------
def _ci_safe_stat(path: Path):
    try:
        st = path.stat()
        return int(getattr(st, "st_size", 0) or 0)
    except Exception:
        return 0

def _ci_is_probably_binary(data: bytes) -> bool:
    if not data:
        return False
    if b"\\x00" in data:
        return True
    controls = 0
    for b in data[:1024]:
        if b in (9, 10, 13):
            continue
        if b < 32 or b == 127:
            controls += 1
    return controls / max(1, min(len(data), 1024)) > 0.12

def _ci_decode_text_preview(data: bytes):
    encodings = ["utf-8-sig", "utf-8", "gb18030", "gbk", "latin1"]
    for enc in encodings:
        try:
            return data.decode(enc, errors="replace"), enc
        except Exception:
            pass
    try:
        return data.decode("utf-8", errors="replace"), "utf-8"
    except Exception:
        return "", ""

def _ci_read_head_bytes(path: Path, max_bytes: int = 2048) -> bytes:
    try:
        with path.open("rb") as f:
            return f.read(max_bytes)
    except Exception:
        return b""

def _ci_safe_preview_text(text: str) -> str:
    t = text.replace("\\r\\n", "\\n").replace("\\r", "\\n")
    t = re.sub(r"[ \\t]{6,}", "    ", t)
    return t[:600]

def _ci_extract_alias_candidates(stripped_cols):
    candidates = []
    pattern = re.compile(r"^(.*)\\(([^()]+)\\)$")
    for col in stripped_cols:
        m = pattern.match(col)
        if not m:
            continue
        base = (m.group(1) or "").strip()
        alias = (m.group(2) or "").strip()
        if not base or not alias:
            continue
        candidates.append({"source": col, "base": base, "alias": alias})
    return candidates

def _ci_read_tabular_quick(pd, path: Path):
    ext = path.suffix.lower()
    try:
        if ext in [".csv", ".tsv", ".txt"]:
            encodings = ["utf-8-sig", "utf-8", "gb18030", "gbk", "latin1"]
            for enc in encodings:
                try:
                    if ext == ".tsv":
                        return pd.read_csv(path, sep="\\t", encoding=enc, nrows=50)
                    return pd.read_csv(path, encoding=enc, nrows=50)
                except Exception:
                    pass
            try:
                return pd.read_csv(path, sep=None, engine="python", nrows=50)
            except Exception:
                return None
        if ext in [".xlsx", ".xls"]:
            try:
                return pd.read_excel(path, nrows=50)
            except Exception:
                return None
        if ext in [".json"]:
            try:
                return pd.read_json(path, lines=True)
            except Exception:
                try:
                    return pd.read_json(path)
                except Exception:
                    return None
        return None
    except Exception:
        return None

def _ci_collect_probe_payload():
    payload_files = []
    try:
        names = []
        for name in os.listdir("."):
            if name.startswith("."):
                continue
            p = Path(name)
            if not p.is_file():
                continue
            if p.suffix.lower() in [".py", ".pyc"]:
                continue
            names.append(p)
        names = sorted(names, key=lambda x: x.name)[:10]
    except Exception:
        names = []

    try:
        import pandas as pd  # type: ignore
    except Exception:
        pd = None

    for p in names:
        info = {
            "name": p.name,
            "size": _ci_safe_stat(p),
            "ext": p.suffix.lower(),
            "tabular": False
        }
        try:
            head_bytes = _ci_read_head_bytes(p, 2048)
            is_bin = _ci_is_probably_binary(head_bytes)
            info["isBinary"] = bool(is_bin)
            if is_bin:
                info["headHex"] = head_bytes[:64].hex()
            else:
                head_text, enc = _ci_decode_text_preview(head_bytes)
                info["headText"] = _ci_safe_preview_text(head_text)
                info["headEncoding"] = enc

            if pd is not None:
                df = _ci_read_tabular_quick(pd, p)
                if df is not None and hasattr(df, "columns"):
                    try:
                        _ci_normalize_df(df)
                    except Exception:
                        pass
                    cols = [_ci_safe_str(c) for c in list(df.columns)]
                    stripped = [c.strip() for c in cols]
                    aliases = _ci_extract_alias_candidates(stripped)
                    info["tabular"] = True
                    info["columns"] = cols[:120]
                    info["strippedColumns"] = stripped[:120]
                    info["aliasCandidates"] = aliases[:60]

                    # lightweight schema stats (based on sampled rows)
                    try:
                        dtypes = {}
                        non_null = {}
                        for c in list(df.columns)[:30]:
                            key = _ci_safe_str(c)
                            try:
                                dtypes[key] = _ci_safe_str(getattr(df[c], "dtype", ""))
                            except Exception:
                                dtypes[key] = ""
                            try:
                                non_null[key] = int(df[c].notna().sum())
                            except Exception:
                                non_null[key] = 0
                        info["dtypes"] = dtypes
                        info["nonNullCounts"] = non_null
                    except Exception:
                        pass
        except Exception as e:
            info["error"] = _ci_safe_str(e)

        payload_files.append(info)

    return {"files": payload_files}

def _ci_emit_probe():
    try:
        sys.stdout.write("${FILE_PROBE_MARKER}" + json.dumps(_ci_collect_probe_payload(), ensure_ascii=False))
    except Exception:
        pass

def _ci_excepthook(exctype, value, tb):
    # Emit probe BEFORE the default traceback, so the caller can parse it from stdout.
    _ci_emit_probe()
    return sys.__excepthook__(exctype, value, tb)

sys.excepthook = _ci_excepthook

${pythonCode.trim()}
`;

const runPythonInCodeInterpreter = async ({
  task,
  chatContext,
  lastUserMessage,
  lastAssistantMessage,
  pythonCode,
  files,
  timeoutSeconds
}: {
  task: string;
  chatContext: string;
  lastUserMessage: string;
  lastAssistantMessage: string;
  pythonCode: string;
  files: string[];
  timeoutSeconds: number;
}): Promise<{ raw: Record<string, unknown>; log: string }> => {
  if (!process.env.CODE_INTERPRETER_URL) {
    throw new Error('Can not find CODE_INTERPRETER_URL in env');
  }

  const apiKey = process.env.CODE_INTERPRETER_API_KEY?.trim();
  const requestUrl = `${trimTrailingSlash(process.env.CODE_INTERPRETER_URL)}/api/v1/execute`;
  const executeCode = buildExecuteCode({
    task,
    chatContext,
    lastUserMessage,
    lastAssistantMessage,
    pythonCode,
    files
  });

  addLog.debug('[CodeInterpreter] request', {
    url: requestUrl,
    files,
    codeLength: executeCode.length,
    codePreview: executeCode.slice(0, 500)
  });

  const { data } = await axios.post(
    requestUrl,
    {
      code: executeCode,
      files
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Type': 'CODE_INTERPRETER',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      timeout: timeoutSeconds * 1000
    }
  );

  const raw = getRecord(data);
  if (!raw) {
    throw new Error('Invalid response from code interpreter');
  }

  const error = raw.error;
  const errorText =
    error === null || error === undefined
      ? ''
      : typeof error === 'string'
        ? error
        : JSON.stringify(error);
  const resultText = typeof raw.result === 'string' ? raw.result : '';

  if (errorText) {
    const err = new Error(errorText) as Error & {
      codeInterpreterRaw?: Record<string, unknown>;
      codeInterpreterLog?: string;
    };
    err.codeInterpreterRaw = raw;
    err.codeInterpreterLog = resultText;
    throw err;
  }

  return { raw, log: resultText };
};

const parseNumber = (value: unknown, defaultValue = 0) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return defaultValue;
};

const parseNullableString = (value: unknown) => {
  if (value === null || value === undefined) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
};

const getCodeInterpreterLogFromError = (error: unknown) => {
  if (!isRecord(error)) return '';
  const log = error.codeInterpreterLog;
  return typeof log === 'string' ? log : '';
};

const stripFileProbeMarkerFromLog = (log: string) => {
  const idx = log.indexOf(FILE_PROBE_MARKER);
  if (idx < 0) return log.trim();
  return log.slice(0, idx).trim();
};

const hasBase64ImageLikeOutput = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (/data:image\/[a-z0-9.+-]+;base64,/i.test(trimmed)) return true;

  // Common image signatures/prefixes after base64 encoding.
  const hasCommonPrefix = /(iVBORw0KGgo|R0lGODlh|\/9j\/|UklGR)/.test(trimmed);
  if (hasCommonPrefix) return true;
  const hasLongChunk = /[A-Za-z0-9+/]{500,}={0,2}/.test(trimmed);
  const mentionsImageType = /\b(png|jpe?g|gif|webp|svg)\b/i.test(trimmed);

  const hasBase64Word = /base64/i.test(trimmed);
  return hasBase64Word && (hasLongChunk || mentionsImageType);
};

const parseCodeInterpreterToolOutput = (raw: Record<string, unknown>, code = ''): ToolOutput => {
  const resultText = typeof raw.result === 'string' ? raw.result.trim() : '';
  const imageUrl = typeof raw.image_url === 'string' ? raw.image_url.trim() : '';
  const outputFiles = parseStringArray(raw.files);

  const isBase64Output = resultText ? hasBase64ImageLikeOutput(resultText) : false;
  const isTooLong = resultText.length > MAX_STDOUT_LENGTH;

  let unifiedResult: string;

  if (isBase64Output) {
    // 检测到 base64 输出，优先返回文件/图片地址
    unifiedResult =
      imageUrl || outputFiles.length > 0
        ? imageUrl || outputFiles.join('\n')
        : '检测到 Base64 图片输出。请在代码中将图片保存为本地文件（如 plt.savefig("output.png")），由服务端返回图片地址，不要打印 Base64 字符串。';
  } else if (isTooLong) {
    // 输出过长，截断并提示
    unifiedResult = `输出内容过长 (${resultText.length} 字符)。建议在代码中完成数据处理和汇总，只打印最终结果摘要。\n\n输出预览（前 500 字符）:\n${resultText.slice(0, 500)}...\n\n${imageUrl ? `\n图片地址: ${imageUrl}` : ''}${outputFiles.length > 0 ? `\n生成文件: ${outputFiles.join(', ')}` : ''}`;
  } else {
    // 正常输出
    unifiedResult = resultText
      ? resultText
      : imageUrl
        ? imageUrl
        : outputFiles.length > 0
          ? outputFiles.join('\n')
          : '';
  }

  return {
    [NodeOutputKeyEnum.result]: unifiedResult,
    [NodeOutputKeyEnum.error]: parseNullableString(raw.error),
    [NodeOutputKeyEnum.execution_time]: parseNumber(raw.execution_time, 0),
    [NodeOutputKeyEnum.image_url]: parseNullableString(raw.image_url),
    [NodeOutputKeyEnum.files]: outputFiles,
    [NodeOutputKeyEnum.inputs]: parseStringArray(raw.inputs),
    [NodeOutputKeyEnum.code]: code
  };
};

export const dispatchCodeInterpreter = async (props: Props): Promise<Response> => {
  const {
    user,
    node,
    histories,
    chatConfig,
    requestOrigin,
    isToolCall,
    params: {
      model,
      systemPrompt,
      codeInterpreterMaxRetry,
      codeInterpreterTimeout,
      fileUrlList,
      userChatInput,
      code
    }
  } = props;

  if (!process.env.CODE_INTERPRETER_URL) {
    const message = 'Can not find CODE_INTERPRETER_URL in env';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: [],
      [NodeOutputKeyEnum.code]: ''
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const task = typeof userChatInput === 'string' ? userChatInput.trim() : '';
  const inputCode = typeof code === 'string' ? code.trim() : '';

  if (isToolCall && inputCode) {
    const message =
      '工具调用模式不允许直接传入 Python 代码，请通过“任务描述 + 文件链接”让系统自动生成并执行。';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: [],
      [NodeOutputKeyEnum.code]: ''
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        nodeInputs: {
          isToolCall: true,
          task,
          files: []
        },
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  if (!task && !inputCode) {
    const message = '任务描述与代码均为空';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: [],
      [NodeOutputKeyEnum.code]: ''
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const llmModel = getLLMModel(model);
  if (!llmModel) {
    const message = 'LLM model not found';
    const pluginOutput = {
      [NodeOutputKeyEnum.result]: '',
      [NodeOutputKeyEnum.error]: message,
      [NodeOutputKeyEnum.execution_time]: 0,
      [NodeOutputKeyEnum.image_url]: '',
      [NodeOutputKeyEnum.files]: [],
      [NodeOutputKeyEnum.inputs]: [],
      [NodeOutputKeyEnum.code]: ''
    };

    return {
      ...pluginOutput,
      [DispatchNodeResponseKeyEnum.toolResponses]: message,
      [DispatchNodeResponseKeyEnum.nodeResponse]: {
        errorText: message,
        pluginOutput,
        textOutput: message
      },
      [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
    };
  }

  const maxRetry = parseRetryTimes(codeInterpreterMaxRetry, 3);
  const timeoutSeconds = parseTimeoutSeconds(codeInterpreterTimeout, 120);
  const maxFiles = chatConfig?.fileSelectConfig?.maxFiles || 20;
  const files = parseCodeInterpreterFiles({
    fileUrlList,
    histories,
    requestOrigin,
    maxFiles
  });
  const chatContext = buildChatContextFromHistories(histories, 12000, 14);
  const lastUserMessage = getLastRoleMessageText(histories, ChatRoleEnum.Human);
  const lastAssistantMessage = getLastRoleMessageText(histories, ChatRoleEnum.AI);

  const capabilities = await fetchCodeInterpreterCapabilities({
    baseUrl: process.env.CODE_INTERPRETER_URL.trim(),
    timeoutMs: 5000
  });
  const capabilitiesText = capabilities
    ? summarizeCodeInterpreterCapabilities(capabilities)
    : undefined;

  let fileProbePayload: FileProbePayload | undefined = undefined;
  const remoteHeads = await fetchRemoteFileHeads({
    urls: files,
    maxFiles: 3,
    maxBytes: 2048,
    timeoutMs: 8000
  });
  const remoteHeadText = buildRemoteFileHeadPrompt(remoteHeads);

  let fileProbeText = remoteHeadText;
  let lastCleanStdout = '';

  const finalSystemPrompt = (
    systemPrompt?.trim()
      ? `${DEFAULT_SYSTEM_PROMPT}\n\n# User Overrides\n${systemPrompt.trim()}`
      : DEFAULT_SYSTEM_PROMPT
  ).trim();
  const aiParams = {
    userKey: user.openaiAccount,
    timeout: 480000
  } as const;

  let currentCode = inputCode;
  let executionLog = '';
  let lastErrorText = '';
  let totalTokens = 0;
  let lastRaw = '';
  let generatedRaw = '';
  let attempt = 0;

  // If user didn't provide code, generate initial code from task first.
  if (!currentCode) {
    const messages = buildGenerateCodeMessages({
      systemPrompt: finalSystemPrompt,
      task,
      files,
      capabilitiesText,
      fileProbeText,
      chatContext
    });
    const {
      code: generatedCode,
      tokens,
      raw
    } = await callModelGetCode({
      model: llmModel.model,
      messages,
      aiParams
    });
    totalTokens += tokens;
    generatedRaw = raw;

    if (!generatedCode) {
      const message = '代码生成失败：模型未返回有效代码';
      const pluginOutput = {
        [NodeOutputKeyEnum.result]: '',
        [NodeOutputKeyEnum.error]: message,
        [NodeOutputKeyEnum.execution_time]: 0,
        [NodeOutputKeyEnum.image_url]: '',
        [NodeOutputKeyEnum.files]: [],
        [NodeOutputKeyEnum.inputs]: files,
        [NodeOutputKeyEnum.code]: ''
      };

      return {
        ...pluginOutput,
        [DispatchNodeResponseKeyEnum.toolResponses]: message,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          errorText: message,
          pluginOutput,
          nodeInputs: {
            systemPrompt: finalSystemPrompt,
            task,
            files,
            capabilities: capabilitiesText
          },
          nodeOutputs: {
            rawResponse: raw
          },
          textOutput: message
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]: []
      };
    }

    currentCode = generatedCode.trim();
  }

  for (attempt = 1; attempt <= maxRetry; attempt++) {
    try {
      // attempt=1: run current code; attempt>1: fix then run
      if (attempt > 1) {
        const enhancedErrorText = [
          lastErrorText,
          buildColumnMismatchHint(lastErrorText, fileProbePayload),
          buildCommonErrorTriageHint(lastErrorText),
          lastCleanStdout ? `Stdout (trimmed):\n${lastCleanStdout.slice(0, 1000)}` : ''
        ]
          .filter((t) => typeof t === 'string' && t.trim())
          .join('\n\n')
          .trim();

        const messages = buildFixCodeMessages({
          systemPrompt: finalSystemPrompt,
          files,
          currentCode,
          errorText: enhancedErrorText,
          capabilitiesText,
          fileProbeText,
          task,
          chatContext
        });

        const {
          code: fixedCode,
          tokens,
          raw
        } = await callModelGetCode({
          model: llmModel.model,
          messages,
          aiParams
        });
        totalTokens += tokens;
        lastRaw = raw;

        if (!fixedCode) {
          lastErrorText = 'Empty code generated by the model';
          continue;
        }

        currentCode = fixedCode;
      }

      const runResult = await runPythonInCodeInterpreter({
        task,
        chatContext,
        lastUserMessage,
        lastAssistantMessage,
        pythonCode: currentCode,
        files,
        timeoutSeconds
      });
      executionLog = runResult.log;

      const rawResultText = typeof runResult.raw.result === 'string' ? runResult.raw.result : '';

      // 检测1: Base64图片输出
      if (hasBase64ImageLikeOutput(rawResultText)) {
        lastErrorText =
          'Output contains Base64 image content. Please save images to local files (e.g. output.png) and do NOT print Base64/data URIs; rely on the Code Interpreter service to return image URLs/files.';
        if (attempt < maxRetry) continue;
      }

      // 检测2: 输出长度过长
      if (rawResultText.length > MAX_STDOUT_LENGTH) {
        lastErrorText = `Output is too long (${rawResultText.length} chars, max recommended: ${MAX_STDOUT_LENGTH}). You must process/summarize data IN YOUR CODE before printing. Do NOT return raw data, full file contents, or long lists. Calculate statistics, counts, summaries, or save results to files instead.`;
        if (attempt < maxRetry) continue;
      }

      const toolOutput = parseCodeInterpreterToolOutput(runResult.raw, currentCode);
      const toolResponse = toolOutput[NodeOutputKeyEnum.result];

      const { totalPoints, modelName } = formatModelChars2Points({
        model: llmModel.model,
        tokens: totalTokens,
        modelType: ModelTypeEnum.llm
      });

      return {
        ...toolOutput,
        [DispatchNodeResponseKeyEnum.toolResponses]: toolResponse,
        [DispatchNodeResponseKeyEnum.nodeResponse]: {
          totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
          model: modelName,
          tokens: totalTokens,
          nodeInputs: {
            systemPrompt: finalSystemPrompt,
            maxRetry,
            timeoutSeconds,
            capabilities: capabilitiesText,
            files,
            task,
            inputCode
          },
          nodeOutputs: {
            attempts: attempt,
            generatedRawResponse: generatedRaw,
            rawResponse: lastRaw
          },
          code: currentCode,
          codeLog: executionLog,
          pluginOutput: toolOutput,
          textOutput: toolResponse
        },
        [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
          totalTokens > 0
            ? [
                {
                  moduleName: node.name,
                  totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
                  model: modelName,
                  tokens: totalTokens
                }
              ]
            : []
      };
    } catch (error) {
      const httpError = formatHttpError(error);
      const httpErrText =
        httpError && typeof httpError.message === 'string' ? httpError.message : '';
      const errText =
        error instanceof Error
          ? error.message
          : String(getErrText(error, 'Code Interpreter error'));

      // Try extract probe payload from stdout (emitted by sys.excepthook) without extra sandbox runs.
      const errorLog = getCodeInterpreterLogFromError(error);
      if (errorLog) {
        const parsedProbe = parseFileProbeFromLog(errorLog);
        if (!fileProbePayload && parsedProbe && parsedProbe.files.length > 0) {
          fileProbePayload = parsedProbe;
          const localProbeText = buildFileProbePrompt(fileProbePayload);
          fileProbeText = [remoteHeadText, localProbeText]
            .filter((t) => t && t.trim())
            .join('\n\n');
        }
        lastCleanStdout = stripFileProbeMarkerFromLog(errorLog);
      } else {
        lastCleanStdout = '';
      }

      lastErrorText = httpErrText || errText;

      if (attempt >= maxRetry) break;
    }
  }

  const { totalPoints, modelName } = formatModelChars2Points({
    model: llmModel.model,
    tokens: totalTokens,
    modelType: ModelTypeEnum.llm
  });

  const finalErrText = lastErrorText || 'Code Interpreter error';
  const pluginOutput = {
    [NodeOutputKeyEnum.result]: '',
    [NodeOutputKeyEnum.error]: finalErrText,
    [NodeOutputKeyEnum.execution_time]: 0,
    [NodeOutputKeyEnum.image_url]: '',
    [NodeOutputKeyEnum.files]: [],
    [NodeOutputKeyEnum.inputs]: [],
    [NodeOutputKeyEnum.code]: currentCode
  };

  return {
    ...pluginOutput,
    [DispatchNodeResponseKeyEnum.toolResponses]: finalErrText,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
      model: modelName,
      tokens: totalTokens,
      errorText: finalErrText,
      error: { message: finalErrText },
      nodeInputs: {
        systemPrompt: finalSystemPrompt,
        maxRetry,
        timeoutSeconds,
        capabilities: capabilitiesText,
        files,
        task,
        inputCode
      },
      nodeOutputs: {
        attempts: attempt || maxRetry,
        generatedRawResponse: generatedRaw,
        rawResponse: lastRaw
      },
      code: currentCode,
      codeLog: executionLog,
      pluginOutput,
      textOutput: finalErrText
    },
    [DispatchNodeResponseKeyEnum.nodeDispatchUsages]:
      totalTokens > 0
        ? [
            {
              moduleName: node.name,
              totalPoints: user.openaiAccount?.key ? 0 : totalPoints,
              model: modelName,
              tokens: totalTokens
            }
          ]
        : []
  };
};
