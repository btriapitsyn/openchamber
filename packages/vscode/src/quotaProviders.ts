import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

type AuthEntry = Record<string, unknown> | string;
type AuthFile = Record<string, AuthEntry>;

type UsageWindow = {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
};

type ProviderUsage = {
  windows: Record<string, UsageWindow>;
  models?: Record<string, ProviderUsage>;
};

type OpenAiUsagePayload = {
  rate_limit?: {
    primary_window?: {
      used_percent?: number;
      limit_window_seconds?: number;
      reset_at?: number;
    };
    secondary_window?: {
      used_percent?: number;
      limit_window_seconds?: number;
      reset_at?: number;
    };
  };
};

type GoogleModelsPayload = {
  models?: Record<string, {
    quotaInfo?: {
      remainingFraction?: number;
      resetTime?: string;
    };
  }>;
};

type ZaiLimit = {
  type?: string;
  number?: number;
  unit?: number;
  nextResetTime?: number;
  percentage?: number;
};

type ZaiPayload = {
  data?: {
    limits?: ZaiLimit[];
  };
};

export type ProviderResult = {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage: ProviderUsage | null;
  fetchedAt: number;
  error?: string;
};

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const OPENCODE_DATA_DIR = path.join(os.homedir(), '.local', 'share', 'opencode');
const AUTH_FILE = path.join(OPENCODE_DATA_DIR, 'auth.json');

const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(OPENCODE_CONFIG_DIR, 'antigravity-accounts.json'),
  path.join(OPENCODE_DATA_DIR, 'antigravity-accounts.json'),
];

const GOOGLE_CLIENT_ID =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';
const GOOGLE_WINDOW_SECONDS = 5 * 60 * 60;

const GOOGLE_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com',
];

const GOOGLE_HEADERS = {
  'User-Agent': 'antigravity/1.11.5 windows/amd64',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata':
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

const ZAI_TOKEN_WINDOW_SECONDS: Record<number, number> = { 3: 3600 };

const readAuthFile = (): AuthFile => {
  if (!fs.existsSync(AUTH_FILE)) {
    return {};
  }
  try {
    const content = fs.readFileSync(AUTH_FILE, 'utf8');
    const trimmed = content.trim();
    if (!trimmed) {
      return {};
    }
    return JSON.parse(trimmed) as AuthFile;
  } catch (error) {
    console.error('Failed to read auth file:', error);
    throw new Error('Failed to read OpenCode auth configuration');
  }
};

const readJsonFile = (filePath: string): Record<string, unknown> | null => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as Record<string, unknown>;
  } catch (error) {
    console.warn(`Failed to read JSON file: ${filePath}`, error);
    return null;
  }
};

const getAuthEntry = (auth: AuthFile, aliases: string[]) => {
  for (const alias of aliases) {
    if (auth[alias]) {
      return auth[alias];
    }
  }
  return null;
};

const normalizeAuthEntry = (entry: AuthEntry | null) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { token: entry } as Record<string, unknown>;
  }
  if (typeof entry === 'object') {
    return entry;
  }
  return null;
};

const formatResetTime = (timestamp: number) => {
  try {
    const resetDate = new Date(timestamp);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();

    if (isToday) {
      // Same day: show time only (e.g., "9:56 PM")
      return resetDate.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      });
    }

    // Different day: show date + weekday + time (e.g., "Feb 2, Sun 9:56 PM")
    return resetDate.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
};

const calculateResetAfterSeconds = (resetAt: number | null) => {
  if (!resetAt) return null;
  const delta = Math.floor((resetAt - Date.now()) / 1000);
  return delta < 0 ? 0 : delta;
};

const toUsageWindow = (data: { usedPercent: number | null; windowSeconds: number | null; resetAt: number | null }) => {
  const resetAfterSeconds = calculateResetAfterSeconds(data.resetAt);
  const resetFormatted = data.resetAt ? formatResetTime(data.resetAt) : null;
  return {
    usedPercent: data.usedPercent,
    remainingPercent: data.usedPercent !== null ? Math.max(0, 100 - data.usedPercent) : null,
    windowSeconds: data.windowSeconds ?? null,
    resetAfterSeconds,
    resetAt: data.resetAt,
    resetAtFormatted: resetFormatted,
    resetAfterFormatted: resetFormatted,
  } satisfies UsageWindow;
};

const buildResult = (data: {
  providerId: string;
  providerName: string;
  ok: boolean;
  configured: boolean;
  usage?: ProviderUsage | null;
  error?: string;
}): ProviderResult => ({
  providerId: data.providerId,
  providerName: data.providerName,
  ok: data.ok,
  configured: data.configured,
  usage: data.usage ?? null,
  ...(data.error ? { error: data.error } : {}),
  fetchedAt: Date.now(),
});

export const listConfiguredQuotaProviders = () => {
  const auth = readAuthFile();
  const configured = new Set<string>();

  const openaiAuth = normalizeAuthEntry(getAuthEntry(auth, ['openai', 'codex', 'chatgpt']));
  if (openaiAuth && ((openaiAuth as Record<string, unknown>).access || (openaiAuth as Record<string, unknown>).token)) {
    configured.add('openai');
  }

  const googleAuth = normalizeAuthEntry(getAuthEntry(auth, ['google', 'antigravity']));
  if (googleAuth && ((googleAuth as Record<string, unknown>).access || (googleAuth as Record<string, unknown>).token || (googleAuth as Record<string, unknown>).refresh)) {
    configured.add('google');
  }

  const zaiAuth = normalizeAuthEntry(getAuthEntry(auth, ['zai-coding-plan', 'zai', 'z.ai']));
  if (zaiAuth && ((zaiAuth as Record<string, unknown>).key || (zaiAuth as Record<string, unknown>).token)) {
    configured.add('zai-coding-plan');
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      configured.add('google');
      break;
    }
  }

  return Array.from(configured);
};

export const fetchOpenaiQuota = async (): Promise<ProviderResult> => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['openai', 'codex', 'chatgpt'])) as Record<string, unknown> | null;
  const accessToken = (entry?.access as string | undefined) ?? (entry?.token as string | undefined);

  if (!accessToken) {
    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: false,
      configured: false,
      error: 'Not configured',
    });
  }

  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: 'openai',
        providerName: 'OpenAI',
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json() as OpenAiUsagePayload;
    const primary = payload?.rate_limit?.primary_window ?? null;
    const secondary = payload?.rate_limit?.secondary_window ?? null;

    const windows: Record<string, UsageWindow> = {};
    if (primary) {
      windows['5h'] = toUsageWindow({
        usedPercent: typeof primary.used_percent === 'number' ? primary.used_percent : null,
        windowSeconds: typeof primary.limit_window_seconds === 'number' ? primary.limit_window_seconds : null,
        resetAt: primary.reset_at ? primary.reset_at * 1000 : null,
      });
    }
    if (secondary) {
      windows['weekly'] = toUsageWindow({
        usedPercent: typeof secondary.used_percent === 'number' ? secondary.used_percent : null,
        windowSeconds: typeof secondary.limit_window_seconds === 'number' ? secondary.limit_window_seconds : null,
        resetAt: secondary.reset_at ? secondary.reset_at * 1000 : null,
      });
    }

    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed',
    });
  }
};

const resolveGoogleAuth = () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['google', 'antigravity'])) as Record<string, unknown> | null;
  if (entry) {
    const accessToken = (entry.access as string | undefined) ?? (entry.token as string | undefined);
    let refreshToken = entry.refresh as string | undefined;
    let projectId: string | undefined;
    if (refreshToken && refreshToken.includes('|')) {
      const [first, second] = refreshToken.split('|');
      refreshToken = first;
      projectId = second;
    }
    return {
      accessToken,
      refreshToken,
      expires: entry.expires as number | undefined,
      projectId,
    };
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const index = typeof (data as Record<string, unknown>)?.activeIndex === 'number'
        ? (data as Record<string, unknown>).activeIndex as number
        : 0;
      const account = (accounts[index] as Record<string, unknown> | undefined) ?? (accounts[0] as Record<string, unknown> | undefined);
      if (account?.refreshToken) {
        return {
          refreshToken: account.refreshToken as string,
          projectId: (account.projectId as string | undefined) ?? (account.managedProjectId as string | undefined),
          email: account.email as string | undefined,
        };
      }
    }
  }

  return null;
};

const refreshGoogleAccessToken = async (refreshToken: string) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as Record<string, unknown>;
  return typeof data?.access_token === 'string' ? data.access_token : null;
};

const fetchGoogleModels = async (accessToken: string, projectId?: string) => {
  const body = projectId ? { project: projectId } : {};

  for (const endpoint of GOOGLE_ENDPOINTS) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 15000) : null;
    try {
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...GOOGLE_HEADERS,
        },
        body: JSON.stringify(body),
        signal: controller?.signal,
      });

      if (response.ok) {
        return await response.json() as Record<string, unknown>;
      }
    } catch {
      // fall through
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  return null;
};

export const fetchGoogleQuota = async (): Promise<ProviderResult> => {
  const auth = resolveGoogleAuth();
  if (!auth) {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: false,
      error: 'Not configured',
    });
  }

  const now = Date.now();
  let accessToken: string | undefined = auth.accessToken;
  if (!accessToken || (typeof auth.expires === 'number' && auth.expires <= now)) {
    if (!auth.refreshToken) {
      return buildResult({
        providerId: 'google',
        providerName: 'Google',
        ok: false,
        configured: true,
        error: 'Missing refresh token',
      });
    }
    accessToken = (await refreshGoogleAccessToken(auth.refreshToken)) ?? undefined;
  }

  if (!accessToken) {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: true,
      error: 'Failed to refresh OAuth token',
    });
  }

  const projectId = auth.projectId ?? DEFAULT_PROJECT_ID;
  const payload = await fetchGoogleModels(accessToken, projectId);
  if (!payload || typeof payload !== 'object') {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: true,
      error: 'Failed to fetch models',
    });
  }

  const models: Record<string, ProviderUsage> = {};
  const payloadModels = (payload as GoogleModelsPayload).models ?? {};
  for (const [modelName, modelData] of Object.entries(payloadModels)) {
    const quotaInfo = modelData?.quotaInfo;
    const remainingFraction = quotaInfo?.remainingFraction;
    const remainingPercent = typeof remainingFraction === 'number'
      ? Math.round(remainingFraction * 100)
      : null;
    const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
    const resetAt = quotaInfo?.resetTime
      ? new Date(quotaInfo.resetTime).getTime()
      : null;
    models[modelName] = {
      windows: {
        '5h': toUsageWindow({
          usedPercent,
          windowSeconds: GOOGLE_WINDOW_SECONDS,
          resetAt,
        }),
      },
    };
  }

  return buildResult({
    providerId: 'google',
    providerName: 'Google',
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined,
    },
  });
};

const normalizeTimestamp = (value: unknown) => {
  if (typeof value !== 'number') return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
};

const resolveWindowSeconds = (limit: Record<string, unknown> | undefined) => {
  if (!limit || typeof limit.number !== 'number') return null;
  const unitSeconds = ZAI_TOKEN_WINDOW_SECONDS[Number(limit.unit)];
  if (!unitSeconds) return null;
  return unitSeconds * limit.number;
};

const resolveWindowLabel = (windowSeconds: number | null) => {
  if (!windowSeconds) return 'tokens';
  if (windowSeconds % 86400 === 0) {
    const days = windowSeconds / 86400;
    return days === 7 ? 'weekly' : `${days}d`;
  }
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600}h`;
  }
  return `${windowSeconds}s`;
};

export const fetchZaiQuota = async (): Promise<ProviderResult> => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['zai-coding-plan', 'zai', 'z.ai'])) as Record<string, unknown> | null;
  const apiKey = (entry?.key as string | undefined) ?? (entry?.token as string | undefined);

  if (!apiKey) {
    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: false,
      configured: false,
      error: 'Not configured',
    });
  }

  try {
    const response = await fetch('https://api.z.ai/api/monitor/usage/quota/limit', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: 'zai-coding-plan',
        providerName: 'z.ai',
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json() as ZaiPayload;
    const limits = Array.isArray(payload?.data?.limits) ? payload.data.limits : [];
    const tokensLimit = limits.find((limit: Record<string, unknown>) => limit?.type === 'TOKENS_LIMIT');
    const windowSeconds = resolveWindowSeconds(tokensLimit as Record<string, unknown> | undefined);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
    const usedPercent = typeof tokensLimit?.percentage === 'number' ? tokensLimit.percentage : null;

    const windows: Record<string, UsageWindow> = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      });
    }

    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed',
    });
  }
};

export const fetchQuotaForProvider = async (providerId: string): Promise<ProviderResult> => {
  switch (providerId) {
    case 'openai':
      return fetchOpenaiQuota();
    case 'google':
      return fetchGoogleQuota();
    case 'zai-coding-plan':
      return fetchZaiQuota();
    default:
      return buildResult({
        providerId,
        providerName: providerId,
        ok: false,
        configured: false,
        error: 'Unsupported provider',
      });
  }
};
