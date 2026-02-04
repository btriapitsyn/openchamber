import fs from "fs";
import path from "path";
import os from "os";
import { readAuthFile } from "./opencode-auth.js";
import { getTtsMetadata } from "./tts-service.js";

const OPENCODE_CONFIG_DIR = path.join(os.homedir(), ".config", "opencode");
const OPENCODE_DATA_DIR = path.join(
  os.homedir(),
  ".local",
  "share",
  "opencode",
);

const ANTIGRAVITY_ACCOUNTS_PATHS = [
  path.join(OPENCODE_CONFIG_DIR, "antigravity-accounts.json"),
  path.join(OPENCODE_DATA_DIR, "antigravity-accounts.json"),
];

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
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
  if (typeof entry === "string") {
    return { token: entry };
  }
  if (typeof entry === "object") {
    return entry;
  }
  return null;
};

const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toTimestamp = (value) => {
  if (!value) return null;
  if (typeof value === "number") {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const formatResetTime = (timestamp) => {
  try {
    const resetDate = new Date(timestamp);
    const now = new Date();
    const isToday = resetDate.toDateString() === now.toDateString();

    if (isToday) {
      // Same day: show time only (e.g., "9:56 PM")
      return resetDate.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    // Different day: show date + weekday + time (e.g., "Feb 2, Sun 9:56 PM")
    return resetDate.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
};

const calculateResetAfterSeconds = (resetAt) => {
  if (!resetAt) return null;
  const delta = Math.floor((resetAt - Date.now()) / 1000);
  return delta < 0 ? 0 : delta;
};

const toUsageWindow = ({ usedPercent, windowSeconds, resetAt, valueLabel }) => {
  const resetAfterSeconds = calculateResetAfterSeconds(resetAt);
  const resetFormatted = resetAt ? formatResetTime(resetAt) : null;
  return {
    usedPercent,
    remainingPercent:
      usedPercent !== null ? Math.max(0, 100 - usedPercent) : null,
    windowSeconds: windowSeconds ?? null,
    resetAfterSeconds,
    resetAt,
    resetAtFormatted: resetFormatted,
    resetAfterFormatted: resetFormatted,
    ...(valueLabel ? { valueLabel } : {}),
  };
};

const buildResult = ({
  providerId,
  providerName,
  ok,
  configured,
  usage,
  error,
}) => ({
  providerId,
  providerName,
  ok,
  configured,
  usage: usage ?? null,
  ...(error ? { error } : {}),
  fetchedAt: Date.now(),
});

const durationToLabel = (duration, unit) => {
  if (!duration || !unit) return "limit";
  if (unit === "TIME_UNIT_MINUTE") return `${duration}m`;
  if (unit === "TIME_UNIT_HOUR") return `${duration}h`;
  if (unit === "TIME_UNIT_DAY") return `${duration}d`;
  return "limit";
};

const durationToSeconds = (duration, unit) => {
  if (!duration || !unit) return null;
  if (unit === "TIME_UNIT_MINUTE") return duration * 60;
  if (unit === "TIME_UNIT_HOUR") return duration * 3600;
  if (unit === "TIME_UNIT_DAY") return duration * 86400;
  return null;
};

export const listConfiguredQuotaProviders = () => {
  const auth = readAuthFile();
  const configured = new Set();

  const anthropicAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["anthropic", "claude"]),
  );
  if (anthropicAuth?.access || anthropicAuth?.token) {
    configured.add("claude");
  }

  const openaiAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["openai", "codex", "chatgpt"]),
  );
  if (openaiAuth?.access || openaiAuth?.token) {
    configured.add("codex");
    configured.add("openai");
  }

  const googleAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["google", "antigravity"]),
  );
  if (googleAuth?.access || googleAuth?.token || googleAuth?.refresh) {
    configured.add("google");
  }

  const zaiAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["zai-coding-plan", "zai", "z.ai"]),
  );
  if (zaiAuth?.key || zaiAuth?.token) {
    configured.add("zai-coding-plan");
  }

  const kimiAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["kimi-for-coding", "kimi"]),
  );
  if (kimiAuth?.key || kimiAuth?.token) {
    configured.add("kimi-for-coding");
  }

  const openrouterAuth = normalizeAuthEntry(getAuthEntry(auth, ["openrouter"]));
  if (openrouterAuth?.key || openrouterAuth?.token) {
    configured.add("openrouter");
  }

  const copilotAuth = normalizeAuthEntry(
    getAuthEntry(auth, ["github-copilot", "copilot"]),
  );
  if (copilotAuth?.access || copilotAuth?.token) {
    configured.add("github-copilot");
    configured.add("github-copilot-addon");
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    if (Array.isArray(data?.accounts) && data.accounts.length > 0) {
      configured.add("google");
      break;
    }
  }

  return Array.from(configured);
};

export const fetchOpenaiQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["openai", "codex", "chatgpt"]),
  );
  const accessToken = entry?.access ?? entry?.token;

  if (!accessToken) {
    return buildResult({
      providerId: "openai",
      providerName: "OpenAI",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: "openai",
        providerName: "OpenAI",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const primary = payload?.rate_limit?.primary_window ?? null;
    const secondary = payload?.rate_limit?.secondary_window ?? null;

    const windows = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: primary.used_percent ?? null,
        windowSeconds: primary.limit_window_seconds ?? null,
        resetAt: primary.reset_at ? primary.reset_at * 1000 : null,
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: secondary.used_percent ?? null,
        windowSeconds: secondary.limit_window_seconds ?? null,
        resetAt: secondary.reset_at ? secondary.reset_at * 1000 : null,
      });
    }

    return buildResult({
      providerId: "openai",
      providerName: "OpenAI",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "openai",
      providerName: "OpenAI",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

const GOOGLE_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = "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";
const DEFAULT_PROJECT_ID = "rising-fact-p41fc";
const GOOGLE_WINDOW_SECONDS = 5 * 60 * 60;

const GOOGLE_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  "https://cloudcode-pa.googleapis.com",
];

const GOOGLE_HEADERS = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

const resolveGoogleAuth = () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["google", "antigravity"]),
  );
  if (entry) {
    const accessToken = entry.access ?? entry.token;
    let refreshToken = entry.refresh;
    let projectId = undefined;
    if (refreshToken && refreshToken.includes("|")) {
      const parts = refreshToken.split("|");
      refreshToken = parts[0];
      projectId = parts[1];
    }
    return {
      accessToken,
      refreshToken,
      expires: entry.expires,
      projectId,
    };
  }

  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const index = typeof data.activeIndex === "number" ? data.activeIndex : 0;
      const account = accounts[index] ?? accounts[0];
      if (account?.refreshToken) {
        return {
          refreshToken: account.refreshToken,
          projectId: account.projectId ?? account.managedProjectId,
          email: account.email,
        };
      }
    }
  }

  return null;
};

const refreshGoogleAccessToken = async (refreshToken) => {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return typeof data?.access_token === "string" ? data.access_token : null;
};

const fetchGoogleModels = async (accessToken, projectId) => {
  const body = projectId ? { project: projectId } : {};

  for (const endpoint of GOOGLE_ENDPOINTS) {
    try {
      const response = await fetch(
        `${endpoint}/v1internal:fetchAvailableModels`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...GOOGLE_HEADERS,
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );

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
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  const now = Date.now();
  let accessToken = auth.accessToken;
  if (
    !accessToken ||
    (typeof auth.expires === "number" && auth.expires <= now)
  ) {
    if (!auth.refreshToken) {
      return buildResult({
        providerId: "google",
        providerName: "Google",
        ok: false,
        configured: true,
        error: "Missing refresh token",
      });
    }
    accessToken = await refreshGoogleAccessToken(auth.refreshToken);
  }

  if (!accessToken) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: true,
      error: "Failed to refresh OAuth token",
    });
  }

  const projectId = auth.projectId ?? DEFAULT_PROJECT_ID;
  const payload = await fetchGoogleModels(accessToken, projectId);
  if (!payload) {
    return buildResult({
      providerId: "google",
      providerName: "Google",
      ok: false,
      configured: true,
      error: "Failed to fetch models",
    });
  }

  const models = {};
  for (const [modelName, modelData] of Object.entries(payload.models ?? {})) {
    const remainingFraction = modelData?.quotaInfo?.remainingFraction;
    const remainingPercent =
      typeof remainingFraction === "number"
        ? Math.round(remainingFraction * 100)
        : null;
    const usedPercent =
      remainingPercent !== null ? Math.max(0, 100 - remainingPercent) : null;
    const resetAt = modelData?.quotaInfo?.resetTime
      ? new Date(modelData.quotaInfo.resetTime).getTime()
      : null;
    models[modelName] = {
      windows: {
        "5h": toUsageWindow({
          usedPercent,
          windowSeconds: GOOGLE_WINDOW_SECONDS,
          resetAt,
        }),
      },
    };
  }

  return buildResult({
    providerId: "google",
    providerName: "Google",
    ok: true,
    configured: true,
    usage: {
      windows: {},
      models: Object.keys(models).length ? models : undefined,
    },
  });
};

const formatMoney = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value.toFixed(2);
};

export const fetchClaudeQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ["anthropic", "claude"]));
  const accessToken = entry?.access ?? entry?.token;

  if (!accessToken) {
    return buildResult({
      providerId: "claude",
      providerName: "Claude",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: "claude",
        providerName: "Claude",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const windows = {};
    const fiveHour = payload?.five_hour ?? null;
    const sevenDay = payload?.seven_day ?? null;
    const sevenDaySonnet = payload?.seven_day_sonnet ?? null;
    const sevenDayOpus = payload?.seven_day_opus ?? null;

    if (fiveHour) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(fiveHour.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(fiveHour.resets_at),
      });
    }
    if (sevenDay) {
      windows["7d"] = toUsageWindow({
        usedPercent: toNumber(sevenDay.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDay.resets_at),
      });
    }
    if (sevenDaySonnet) {
      windows["7d-sonnet"] = toUsageWindow({
        usedPercent: toNumber(sevenDaySonnet.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDaySonnet.resets_at),
      });
    }
    if (sevenDayOpus) {
      windows["7d-opus"] = toUsageWindow({
        usedPercent: toNumber(sevenDayOpus.utilization),
        windowSeconds: null,
        resetAt: toTimestamp(sevenDayOpus.resets_at),
      });
    }

    return buildResult({
      providerId: "claude",
      providerName: "Claude",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "claude",
      providerName: "Claude",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const fetchCodexQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["openai", "codex", "chatgpt"]),
  );
  const accessToken = entry?.access ?? entry?.token;
  const accountId = entry?.accountId;

  if (!accessToken) {
    return buildResult({
      providerId: "codex",
      providerName: "Codex",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    };
    const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
      method: "GET",
      headers,
    });

    if (!response.ok) {
      return buildResult({
        providerId: "codex",
        providerName: "Codex",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const primary = payload?.rate_limit?.primary_window ?? null;
    const secondary = payload?.rate_limit?.secondary_window ?? null;
    const credits = payload?.credits ?? null;

    const windows = {};
    if (primary) {
      windows["5h"] = toUsageWindow({
        usedPercent: toNumber(primary.used_percent),
        windowSeconds: toNumber(primary.limit_window_seconds),
        resetAt: toTimestamp(primary.reset_at),
      });
    }
    if (secondary) {
      windows["weekly"] = toUsageWindow({
        usedPercent: toNumber(secondary.used_percent),
        windowSeconds: toNumber(secondary.limit_window_seconds),
        resetAt: toTimestamp(secondary.reset_at),
      });
    }
    if (credits) {
      const balance = toNumber(credits.balance);
      const unlimited = Boolean(credits.unlimited);
      const label = unlimited
        ? "Unlimited"
        : balance !== null
          ? `$${formatMoney(balance)} remaining`
          : null;
      windows.credits = toUsageWindow({
        usedPercent: null,
        windowSeconds: null,
        resetAt: null,
        valueLabel: label,
      });
    }

    return buildResult({
      providerId: "codex",
      providerName: "Codex",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "codex",
      providerName: "Codex",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

const buildCopilotWindows = (payload) => {
  const quota = payload?.quota_snapshots ?? {};
  const resetAt = toTimestamp(payload?.quota_reset_date);
  const windows = {};

  const addWindow = (label, snapshot) => {
    if (!snapshot) return;
    const entitlement = toNumber(snapshot.entitlement);
    const remaining = toNumber(snapshot.remaining);
    const usedPercent =
      entitlement && remaining !== null
        ? Math.max(0, Math.min(100, 100 - (remaining / entitlement) * 100))
        : null;
    const valueLabel =
      entitlement !== null && remaining !== null
        ? `${remaining.toFixed(0)} / ${entitlement.toFixed(0)} left`
        : null;
    windows[label] = toUsageWindow({
      usedPercent,
      windowSeconds: null,
      resetAt,
      valueLabel,
    });
  };

  addWindow("chat", quota.chat);
  addWindow("completions", quota.completions);
  addWindow("premium", quota.premium_interactions);

  return windows;
};

export const fetchCopilotQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["github-copilot", "copilot"]),
  );
  const accessToken = entry?.access ?? entry?.token;

  if (!accessToken) {
    return buildResult({
      providerId: "github-copilot",
      providerName: "GitHub Copilot",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch(
      "https://api.github.com/copilot_internal/user",
      {
        method: "GET",
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/json",
          "Editor-Version": "vscode/1.96.2",
          "X-Github-Api-Version": "2025-04-01",
        },
      },
    );

    if (!response.ok) {
      return buildResult({
        providerId: "github-copilot",
        providerName: "GitHub Copilot",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    return buildResult({
      providerId: "github-copilot",
      providerName: "GitHub Copilot",
      ok: true,
      configured: true,
      usage: { windows: buildCopilotWindows(payload) },
    });
  } catch (error) {
    return buildResult({
      providerId: "github-copilot",
      providerName: "GitHub Copilot",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const fetchCopilotAddonQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["github-copilot", "copilot"]),
  );
  const accessToken = entry?.access ?? entry?.token;

  if (!accessToken) {
    return buildResult({
      providerId: "github-copilot-addon",
      providerName: "GitHub Copilot Add-on",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch(
      "https://api.github.com/copilot_internal/user",
      {
        method: "GET",
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/json",
          "Editor-Version": "vscode/1.96.2",
          "X-Github-Api-Version": "2025-04-01",
        },
      },
    );

    if (!response.ok) {
      return buildResult({
        providerId: "github-copilot-addon",
        providerName: "GitHub Copilot Add-on",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const windows = buildCopilotWindows(payload);
    const premium = windows.premium ? { premium: windows.premium } : windows;

    return buildResult({
      providerId: "github-copilot-addon",
      providerName: "GitHub Copilot Add-on",
      ok: true,
      configured: true,
      usage: { windows: premium },
    });
  } catch (error) {
    return buildResult({
      providerId: "github-copilot-addon",
      providerName: "GitHub Copilot Add-on",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const fetchKimiQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["kimi-for-coding", "kimi"]),
  );
  const apiKey = entry?.key ?? entry?.token;

  if (!apiKey) {
    return buildResult({
      providerId: "kimi-for-coding",
      providerName: "Kimi for Coding",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://api.kimi.com/coding/v1/usages", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: "kimi-for-coding",
        providerName: "Kimi for Coding",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const windows = {};
    const usage = payload?.usage ?? null;
    if (usage) {
      const limit = toNumber(usage.limit);
      const remaining = toNumber(usage.remaining);
      const usedPercent =
        limit && remaining !== null
          ? Math.max(0, Math.min(100, 100 - (remaining / limit) * 100))
          : null;
      windows.weekly = toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: toTimestamp(usage.resetTime),
      });
    }

    const limits = Array.isArray(payload?.limits) ? payload.limits : [];
    for (const limit of limits) {
      const window = limit?.window;
      const detail = limit?.detail;
      const rawLabel = durationToLabel(window?.duration, window?.timeUnit);
      const windowSeconds = durationToSeconds(
        window?.duration,
        window?.timeUnit,
      );
      const label =
        windowSeconds === 5 * 60 * 60 ? `Rate Limit (${rawLabel})` : rawLabel;
      const total = toNumber(detail?.limit);
      const remaining = toNumber(detail?.remaining);
      const usedPercent =
        total && remaining !== null
          ? Math.max(0, Math.min(100, 100 - (remaining / total) * 100))
          : null;
      windows[label] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt: toTimestamp(detail?.resetTime),
      });
    }

    return buildResult({
      providerId: "kimi-for-coding",
      providerName: "Kimi for Coding",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "kimi-for-coding",
      providerName: "Kimi for Coding",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const fetchOpenRouterQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(getAuthEntry(auth, ["openrouter"]));
  const apiKey = entry?.key ?? entry?.token;

  if (!apiKey) {
    return buildResult({
      providerId: "openrouter",
      providerName: "OpenRouter",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/credits", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return buildResult({
        providerId: "openrouter",
        providerName: "OpenRouter",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const credits = payload?.data ?? {};
    const totalCredits = toNumber(credits.total_credits);
    const totalUsage = toNumber(credits.total_usage);
    const remaining =
      totalCredits !== null && totalUsage !== null
        ? Math.max(0, totalCredits - totalUsage)
        : null;
    const usedPercent =
      totalCredits && totalUsage !== null
        ? Math.max(0, Math.min(100, (totalUsage / totalCredits) * 100))
        : null;
    const valueLabel =
      remaining !== null ? `$${formatMoney(remaining)} remaining` : null;

    const windows = {
      credits: toUsageWindow({
        usedPercent,
        windowSeconds: null,
        resetAt: null,
        valueLabel,
      }),
    };

    return buildResult({
      providerId: "openrouter",
      providerName: "OpenRouter",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "openrouter",
      providerName: "OpenRouter",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

const normalizeTimestamp = (value) => {
  if (typeof value !== "number") return null;
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
  if (!windowSeconds) return "tokens";
  if (windowSeconds % 86400 === 0) {
    const days = windowSeconds / 86400;
    return days === 7 ? "weekly" : `${days}d`;
  }
  if (windowSeconds % 3600 === 0) {
    return `${windowSeconds / 3600}h`;
  }
  return `${windowSeconds}s`;
};

export const fetchZaiQuota = async () => {
  const auth = readAuthFile();
  const entry = normalizeAuthEntry(
    getAuthEntry(auth, ["zai-coding-plan", "zai", "z.ai"]),
  );
  const apiKey = entry?.key ?? entry?.token;

  if (!apiKey) {
    return buildResult({
      providerId: "zai-coding-plan",
      providerName: "z.ai",
      ok: false,
      configured: false,
      error: "Not configured",
    });
  }

  try {
    const response = await fetch(
      "https://api.z.ai/api/monitor/usage/quota/limit",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!response.ok) {
      return buildResult({
        providerId: "zai-coding-plan",
        providerName: "z.ai",
        ok: false,
        configured: true,
        error: `API error: ${response.status}`,
      });
    }

    const payload = await response.json();
    const limits = Array.isArray(payload?.data?.limits)
      ? payload.data.limits
      : [];
    const tokensLimit = limits.find((limit) => limit?.type === "TOKENS_LIMIT");
    const windowSeconds = resolveWindowSeconds(tokensLimit);
    const windowLabel = resolveWindowLabel(windowSeconds);
    const resetAt = tokensLimit?.nextResetTime
      ? normalizeTimestamp(tokensLimit.nextResetTime)
      : null;
    const usedPercent =
      typeof tokensLimit?.percentage === "number"
        ? tokensLimit.percentage
        : null;

    const windows = {};
    if (tokensLimit) {
      windows[windowLabel] = toUsageWindow({
        usedPercent,
        windowSeconds,
        resetAt,
      });
    }

    return buildResult({
      providerId: "zai-coding-plan",
      providerName: "z.ai",
      ok: true,
      configured: true,
      usage: { windows },
    });
  } catch (error) {
    return buildResult({
      providerId: "zai-coding-plan",
      providerName: "z.ai",
      ok: false,
      configured: true,
      error: error instanceof Error ? error.message : "Request failed",
    });
  }
};

export const fetchQuotaForProvider = async (providerId) => {
  switch (providerId) {
    case "claude":
      return fetchClaudeQuota();
    case "codex":
      return fetchCodexQuota();
    case "github-copilot":
      return fetchCopilotQuota();
    case "github-copilot-addon":
      return fetchCopilotAddonQuota();
    case "google":
      return fetchGoogleQuota();
    case "kimi-for-coding":
      return fetchKimiQuota();
    case "openrouter":
      return fetchOpenRouterQuota();
    case "zai-coding-plan":
      return fetchZaiQuota();
    case "openai":
      return fetchOpenaiQuota();
    case "openai-tts":
      return getTtsMetadata();
    default:
      return buildResult({
        providerId,
        providerName: providerId,
        ok: false,
        configured: false,
        error: "Unsupported provider",
      });
  }
};
