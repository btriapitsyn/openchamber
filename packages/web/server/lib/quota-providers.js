import fs from 'fs';
import path from 'path';
import os from 'os';
import { readAuthFile } from './opencode-auth.js';

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), '.config', 'opencode');
const OPENCODE_DATA_DIR = path.join(os.homedir(), '.local', 'share', 'opencode');

const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(OPENCODE_CONFIG_DIR, 'antigravity-accounts.json'),
  path.join(OPENCODE_DATA_DIR, 'antigravity-accounts.json')
];

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn(`Failed to read JSON file: ${filePath}`, error);
    return null;
  }
};

const getAuthEntry = (auth, aliases) => {
  for (const alias of aliases) {
    if (auth[alias]) {
      return auth[alias];
    }
  }
  return null;
};

const normalizeAuthEntry = (entry) => {
  if (!entry) return null;
  if (typeof entry === 'string') {
    return { token: entry };
  }
  if (typeof entry === 'object') {
    return entry;
  }
  return null;
};

const formatResetAt = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return null;
  }
};

const formatDuration = (seconds) => {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) {
    return null;
  }
  const clamped = Math.max(0, Math.round(seconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  if (hours === 0 && minutes === 0) {
    return '0m';
  }
  if (hours === 0) {
    return `${minutes}m`;
  }
  if (minutes === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${minutes}m`;
};

const calculateResetAfterSeconds = (resetAt) => {
  if (!resetAt) return null;
  const delta = Math.floor((resetAt - Date.now()) / 1000);
  return delta < 0 ? 0 : delta;
};

const toUsageWindow = ({ usedPercent, windowSeconds, resetAt }) => {
  const resetAfterSeconds = calculateResetAfterSeconds(resetAt);
  return {
    usedPercent,
    remainingPercent: usedPercent !== null ? Math.max(0, 100 - usedPercent) : null,
    windowSeconds: windowSeconds ?? null,
    resetAfterSeconds,
    resetAt,
    resetAtFormatted: resetAt ? formatResetAt(resetAt) : null,
    resetAfterFormatted: resetAfterSeconds !== null ? formatDuration(resetAfterSeconds) : null
  };
};

const buildResult = ({ providerId, providerName, ok, configured, usage, error }) => ({
  providerId,
  providerName,
  ok,
  configured,
  usage: usage ?? null,
  ...(error ? { error } : {}),
  fetchedAt: Date.now()
});

export const listConfiguredQuotaProviders = () => {
  const auth = readAuthFile();
  const configured = new Set();

  const openaiAuth = normalizeAuthEntry(getAuthEntry(auth, ['openai', 'codex', 'chatgpt']));
  if (openaiAuth?.access || openaiAuth?.token) {
    configured.add('openai');
  }

  const googleAuth = normalizeAuthEntry(getAuthEntry(auth, ['google', 'antigravity']));
  if (googleAuth?.access || googleAuth?.token || googleAuth?.refresh) {
    configured.add('google');
  }

  const zaiAuth = normalizeAuthEntry(getAuthEntry(auth, ['zai-coding-plan', 'zai', 'z.ai']));
  if (zaiAuth?.key || zaiAuth?.token) {
    configured.add('zai-coding-plan');
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
      configured.add('google');
      break;
    }
  }

  return Array.from(configured);
};

export const fetchOpenaiQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['openai', 'codex', 'chatgpt']));
  const accessToken = entry?.access ?? entry?.token;

  if (!accessToken) {
    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const response = await fetch('https://chatgpt.com/backend-api/wham/usage', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return buildResult({
        providerId: 'openai',
        providerName: 'OpenAI',
        ok: false,
        configured: true,
        error: `API error: ${response.status}`
      });
    }

    const payload = await response.json();
    const primary = payload?.rate_limit?.primary_window ?? null;
    const secondary = payload?.rate_limit?.secondary_window ?? null;

    const windows = {};
    if (primary) {
      windows['5h'] = toUsageWindow({
        usedPercent: primary.used_percent ?? null,
        windowSeconds: primary.limit_window_seconds ?? null,
        resetAt: primary.reset_at ? primary.reset_at * 1000 : null
      });
    }
    if (secondary) {
      windows['weekly'] = toUsageWindow({
        usedPercent: secondary.used_percent ?? null,
        windowSeconds: secondary.limit_window_seconds ?? null,
        resetAt: secondary.reset_at ? secondary.reset_at * 1000 : null
      });
    }

    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: true,
      configured: true,
      usage: { windows }
    });
  } catch (error) {
    return buildResult({
      providerId: 'openai',
      providerName: 'OpenAI',
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};

const GOOGLE_CLIENT_ID =
  '1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com';
const GOOGLE_CLIENT_SECRET = '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';
const DEFAULT_PROJECT_ID = 'rising-fact-p41fc';
const GOOGLE_WINDOW_SECONDS = 5 * 60 * 60;

const GOOGLE_ENDPOINTS = [
  'https://daily-cloudcode-pa.sandbox.googleapis.com',
  'https://autopush-cloudcode-pa.sandbox.googleapis.com',
  'https://cloudcode-pa.googleapis.com'
];

const GOOGLE_HEADERS = {
  'User-Agent': 'antigravity/1.11.5 windows/amd64',
  'X-Goog-Api-Client': 'google-cloud-sdk vscode_cloudshelleditor/0.1',
  'Client-Metadata':
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}'
};

const resolveGoogleAuth = () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['google', 'antigravity']));
  if (entry) {
    const accessToken = entry.access ?? entry.token;
    let refreshToken = entry.refresh;
    let projectId = undefined;
    if (refreshToken && refreshToken.includes('|')) {
      const parts = refreshToken.split('|');
      refreshToken = parts[0];
      projectId = parts[1];
    }
    return {
      accessToken,
      refreshToken,
      expires: entry.expires,
      projectId
    };
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const index = typeof data.activeIndex === 'number' ? data.activeIndex : 0;
      const account = accounts[index] ?? accounts[0];
      if (account?.refreshToken) {
        return {
          refreshToken: account.refreshToken,
          projectId: account.projectId ?? account.managedProjectId,
          email: account.email
        };
      }
    }
  }

  return null;
};

const refreshGoogleAccessToken = async (refreshToken) => {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return typeof data?.access_token === 'string' ? data.access_token : null;
};

const fetchGoogleModels = async (accessToken, projectId) => {
  const body = projectId ? { project: projectId } : {};

  for (const endpoint of GOOGLE_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...GOOGLE_HEADERS
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000)
      });

      if (response.ok) {
        return await response.json();
      }
    } catch {
      continue;
    }
  }

  return null;
};

export const fetchGoogleQuota = async () => {
  const auth = resolveGoogleAuth();
  if (!auth) {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  const now = Date.now();
  let accessToken = auth.accessToken;
  if (!accessToken || (typeof auth.expires === 'number' && auth.expires <= now)) {
    if (!auth.refreshToken) {
      return buildResult({
        providerId: 'google',
        providerName: 'Google',
        ok: false,
        configured: true,
        error: 'Missing refresh token'
      });
    }
    accessToken = await refreshGoogleAccessToken(auth.refreshToken);
  }

  if (!accessToken) {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: true,
      error: 'Failed to refresh OAuth token'
    });
  }

  const projectId = auth.projectId ?? DEFAULT_PROJECT_ID;
  const payload = await fetchGoogleModels(accessToken, projectId);
  if (!payload) {
    return buildResult({
      providerId: 'google',
      providerName: 'Google',
      ok: false,
      configured: true,
      error: 'Failed to fetch models'
    });
  }

  const models = {};
  for (const [modelName, modelData] of Object.entries(payload.models ?? {})) {
    const remainingFraction = modelData?.quotaInfo?.remainingFraction;
    const remainingPercent = typeof remainingFraction === 'number'
      ? Math.round(remainingFraction * 100)
      : null;
    const usedPercent = remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
    const resetAt = modelData?.quotaInfo?.resetTime
      ? new Date(modelData.quotaInfo.resetTime).getTime()
      : null;
    models[modelName] = {
      windows: {
        '5h': toUsageWindow({
          usedPercent,
          windowSeconds: GOOGLE_WINDOW_SECONDS,
          resetAt
        })
      }
    };
  }

  return buildResult({
    providerId: 'google',
    providerName: 'Google',
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined
    }
  });
};

const normalizeTimestamp = (value) => {
  if (typeof value !== 'number') return null;
  return value < 1_000_000_000_000 ? value * 1000 : value;
};

const ZAI_TOKEN_WINDOW_SECONDS = { 3: 3600 };

const resolveWindowSeconds = (limit) => {
  if (!limit || !limit.number) return null;
  const unitSeconds = ZAI_TOKEN_WINDOW_SECONDS[limit.unit];
  if (!unitSeconds) return null;
  return unitSeconds * limit.number;
};

const resolveWindowLabel = (windowSeconds) => {
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

export const fetchZaiQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ['zai-coding-plan', 'zai', 'z.ai']));
  const apiKey = entry?.key ?? entry?.token;

  if (!apiKey) {
    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: false,
      configured: false,
      error: 'Not configured'
    });
  }

  try {
    const response = await fetch('https://api.z.ai/api/monitor/usage/quota/limit', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return buildResult({
        providerId: 'zai-coding-plan',
        providerName: 'z.ai',
        ok: false,
        configured: true,
        error: `API error: ${response.status}`
      });
    }

    const payload = await response.json();
    const limits = Array.isArray(payload?.data?.limits) ? payload.data.limits : [];
    const tokensLimit = limits.find((limit) => limit?.type === 'TOKENS_LIMIT');
    const windowSeconds = resolveWindowSeconds(tokensLimit);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime ? normalizeTimestamp(tokensLimit.nextResetTime) : null;
    const usedPercent = typeof tokensLimit?.percentage === 'number' ? tokensLimit.percentage : null;

    const windows = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt
      });
    }

    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: true,
      configured: true,
      usage: { windows }
    });
  } catch (error) {
    return buildResult({
      providerId: 'zai-coding-plan',
      providerName: 'z.ai',
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : 'Request failed'
    });
  }
};

export const fetchQuotaForProvider = async (providerId) => {
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
        error: 'Unsupported provider'
      });
  }
};
