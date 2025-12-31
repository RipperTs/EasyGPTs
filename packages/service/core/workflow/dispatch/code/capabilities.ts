import axios from 'axios';

export type CodeInterpreterInstalledPackage = {
  name: string;
  version: string;
};

export type CodeInterpreterCapabilities = {
  pythonVersion?: string;
  installedPackages?: CodeInterpreterInstalledPackage[];
  limits?: {
    maxConcurrency?: number;
    executionTimeoutSeconds?: number;
    container?: {
      memory?: string;
      cpus?: number;
      pidsLimit?: number;
    };
    input?: {
      maxFiles?: number;
      maxFileBytes?: number;
      totalMaxBytes?: number;
    };
    output?: {
      maxFiles?: number;
      maxFileBytes?: number;
      totalMaxBytes?: number;
      allowedExtensions?: string[];
    };
  };
  networkPolicy?: {
    executorNetworkMode?: string;
    internetAccess?: boolean;
    supportsHttpInputFiles?: boolean;
    supportsPipInstall?: boolean;
    introspection?: {
      ok?: boolean;
      error?: string | null;
    };
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';

const getRecord = (value: unknown): Record<string, unknown> | undefined =>
  isRecord(value) ? value : undefined;

const parseString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined;

const parseBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const parseNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const parseStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
};

const trimTrailingSlash = (url: string) => url.replace(/\/+$/, '');

const safeParseInstalledPackages = (value: unknown): CodeInterpreterInstalledPackage[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): CodeInterpreterInstalledPackage | null => {
      const obj = getRecord(item);
      if (!obj) return null;
      const name = parseString(obj.name);
      const version = parseString(obj.version);
      if (!name || !version) return null;
      return { name, version };
    })
    .filter((item): item is CodeInterpreterInstalledPackage => item !== null);
};

export const summarizeCodeInterpreterCapabilities = (
  capabilities: CodeInterpreterCapabilities | null
): string => {
  if (!capabilities) {
    return 'Capabilities: (unavailable)';
  }

  const pythonVersion = capabilities.pythonVersion || 'unknown';
  const limits = capabilities.limits;
  const net = capabilities.networkPolicy;
  const introspectionOk = net?.introspection?.ok;
  const introspectionErr = net?.introspection?.error;

  const packages = capabilities.installedPackages || [];
  const pkgIndex = new Map<string, string>();
  packages.forEach((p) => pkgIndex.set(p.name.toLowerCase(), p.version));

  const pick = (name: string) => {
    const version = pkgIndex.get(name.toLowerCase());
    return version ? `${name}==${version}` : undefined;
  };

  const commonPkgs = [
    pick('pandas'),
    pick('numpy'),
    pick('matplotlib'),
    pick('seaborn'),
    pick('scipy'),
    pick('scikit-learn'),
    pick('statsmodels'),
    pick('sympy'),
    pick('openpyxl'),
    pick('xlrd'),
    pick('lxml'),
    pick('beautifulsoup4'),
    pick('Pillow')
  ].filter((v): v is string => Boolean(v));

  const inputMaxFiles = limits?.input?.maxFiles;
  const inputMaxFileBytes = limits?.input?.maxFileBytes;
  const outputAllowedExt = limits?.output?.allowedExtensions || [];
  const execTimeoutSeconds = limits?.executionTimeoutSeconds;
  const internetAccess = net?.internetAccess;
  const supportsHttpInputFiles = net?.supportsHttpInputFiles;
  const supportsPipInstall = net?.supportsPipInstall;

  const lines = [
    `Capabilities:`,
    `- pythonVersion: ${pythonVersion}`,
    commonPkgs.length > 0 ? `- commonPackages: ${commonPkgs.join(', ')}` : undefined,
    execTimeoutSeconds ? `- limits.executionTimeoutSeconds: ${execTimeoutSeconds}` : undefined,
    typeof inputMaxFiles === 'number' ? `- limits.input.maxFiles: ${inputMaxFiles}` : undefined,
    typeof inputMaxFileBytes === 'number'
      ? `- limits.input.maxFileBytes: ${inputMaxFileBytes}`
      : undefined,
    outputAllowedExt.length > 0
      ? `- limits.output.allowedExtensions: ${outputAllowedExt.join(', ')}`
      : undefined,
    typeof internetAccess === 'boolean' ? `- network.internetAccess: ${internetAccess}` : undefined,
    typeof supportsHttpInputFiles === 'boolean'
      ? `- network.supportsHttpInputFiles: ${supportsHttpInputFiles}`
      : undefined,
    typeof supportsPipInstall === 'boolean'
      ? `- network.supportsPipInstall: ${supportsPipInstall}`
      : undefined,
    introspectionOk === false
      ? `- network.introspection.error: ${introspectionErr || 'unknown'}`
      : undefined
  ].filter((v): v is string => Boolean(v));

  return lines.join('\n');
};

export const fetchCodeInterpreterCapabilities = async ({
  baseUrl,
  timeoutMs
}: {
  baseUrl: string;
  timeoutMs: number;
}): Promise<CodeInterpreterCapabilities | null> => {
  const trimmedBase = trimTrailingSlash(baseUrl);

  try {
    const { data } = await axios.get(`${trimmedBase}/capabilities`, {
      headers: {
        Accept: 'application/json',
        'X-Request-Type': 'CODE_INTERPRETER'
      },
      timeout: timeoutMs
    });

    const raw = getRecord(data);
    if (!raw) return null;

    const limits = getRecord(raw.limits);
    const input = limits ? getRecord(limits.input) : undefined;
    const output = limits ? getRecord(limits.output) : undefined;
    const container = limits ? getRecord(limits.container) : undefined;
    const networkPolicy = getRecord(raw.networkPolicy);
    const introspection = networkPolicy ? getRecord(networkPolicy.introspection) : undefined;

    return {
      pythonVersion: parseString(raw.pythonVersion),
      installedPackages: safeParseInstalledPackages(raw.installedPackages),
      limits: limits
        ? {
            maxConcurrency: parseNumber(limits.maxConcurrency),
            executionTimeoutSeconds: parseNumber(limits.executionTimeoutSeconds),
            container: container
              ? {
                  memory: parseString(container.memory),
                  cpus: parseNumber(container.cpus),
                  pidsLimit: parseNumber(container.pidsLimit)
                }
              : undefined,
            input: input
              ? {
                  maxFiles: parseNumber(input.maxFiles),
                  maxFileBytes: parseNumber(input.maxFileBytes),
                  totalMaxBytes: parseNumber(input.totalMaxBytes)
                }
              : undefined,
            output: output
              ? {
                  maxFiles: parseNumber(output.maxFiles),
                  maxFileBytes: parseNumber(output.maxFileBytes),
                  totalMaxBytes: parseNumber(output.totalMaxBytes),
                  allowedExtensions: parseStringArray(output.allowedExtensions)
                }
              : undefined
          }
        : undefined,
      networkPolicy: networkPolicy
        ? {
            executorNetworkMode: parseString(networkPolicy.executorNetworkMode),
            internetAccess: parseBoolean(networkPolicy.internetAccess),
            supportsHttpInputFiles: parseBoolean(networkPolicy.supportsHttpInputFiles),
            supportsPipInstall: parseBoolean(networkPolicy.supportsPipInstall),
            introspection: introspection
              ? {
                  ok: parseBoolean(introspection.ok),
                  error: introspection.error === null ? null : parseString(introspection.error)
                }
              : undefined
          }
        : undefined
    };
  } catch {
    // try next candidate
  }

  return null;
};
