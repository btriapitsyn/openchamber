import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import { createUiAuth } from './lib/ui-auth.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const DEFAULT_PORT = 3000;
const DEFAULT_OPENCODE_PORT = 0; // Let the OS choose an available port
const HEALTH_CHECK_INTERVAL = 30000; // 30 seconds
const SHUTDOWN_TIMEOUT = 10000; // 10 seconds
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000; // Allow long-running Zen completions (4 minutes)
const fsPromises = fs.promises;
const DEFAULT_FILE_SEARCH_LIMIT = 60;
const MAX_FILE_SEARCH_LIMIT = 400;
const FILE_SEARCH_MAX_CONCURRENCY = 5;
const FILE_SEARCH_EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  'tmp',
  'logs'
]);

const normalizeRelativeSearchPath = (rootPath, targetPath) => {
  const relative = path.relative(rootPath, targetPath) || path.basename(targetPath);
  return relative.split(path.sep).join('/') || targetPath;
};

const shouldSkipSearchDirectory = (name) => {
  if (!name) {
    return false;
  }
  if (name.startsWith('.')) {
    return true;
  }
  return FILE_SEARCH_EXCLUDED_DIRS.has(name.toLowerCase());
};

const listDirectoryEntries = async (dirPath) => {
  try {
    return await fsPromises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
};

const searchFilesystemFiles = async (rootPath, options) => {
  const { limit, query } = options;
  const normalizedQuery = query.trim().toLowerCase();
  const matchAll = normalizedQuery.length === 0;
  const queue = [rootPath];
  const visited = new Set([rootPath]);
  const results = [];

  while (queue.length > 0 && results.length < limit) {
    const batch = queue.splice(0, FILE_SEARCH_MAX_CONCURRENCY);
    const dirLists = await Promise.all(batch.map((dir) => listDirectoryEntries(dir)));

    for (let index = 0; index < batch.length; index += 1) {
      const currentDir = batch[index];
      const dirents = dirLists[index];

      for (const dirent of dirents) {
        const entryName = dirent.name;
        if (!entryName || entryName.startsWith('.')) {
          continue;
        }

        const entryPath = path.join(currentDir, entryName);

        if (dirent.isDirectory()) {
          if (shouldSkipSearchDirectory(entryName)) {
            continue;
          }
          if (!visited.has(entryPath)) {
            visited.add(entryPath);
            queue.push(entryPath);
          }
          continue;
        }

        if (!dirent.isFile()) {
          continue;
        }

        const relativePath = normalizeRelativeSearchPath(rootPath, entryPath);
        if (!matchAll) {
          const lowercaseName = entryName.toLowerCase();
          const lowercasePath = relativePath.toLowerCase();
          if (!lowercaseName.includes(normalizedQuery) && !lowercasePath.includes(normalizedQuery)) {
            continue;
          }
        }

        results.push({
          name: entryName,
          path: entryPath,
          relativePath,
          extension: entryName.includes('.') ? entryName.split('.').pop()?.toLowerCase() : undefined
        });

        if (results.length >= limit) {
          queue.length = 0;
          break;
        }
      }

      if (results.length >= limit) {
        break;
      }
    }
  }

  return results;
};

const createTimeoutSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
};

const stripJsonMarkdownWrapper = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  let trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.startsWith('```')) {
    trimmed = trimmed.replace(/^```(?:json)?\s*/i, '');
    const closingFenceIndex = trimmed.lastIndexOf('```');
    if (closingFenceIndex !== -1) {
      trimmed = trimmed.slice(0, closingFenceIndex);
    }
    trimmed = trimmed.trim();
  }
  if (trimmed.endsWith('```')) {
    trimmed = trimmed.slice(0, -3).trim();
  }
  return trimmed;
};

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'openchamber');
const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'settings.json');

const readSettingsFromDisk = async () => {
  try {
    const raw = await fsPromises.readFile(SETTINGS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
    return {};
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return {};
    }
    console.warn('Failed to read settings file:', error);
    return {};
  }
};

const writeSettingsToDisk = async (settings) => {
  try {
    await fsPromises.mkdir(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
    await fsPromises.writeFile(SETTINGS_FILE_PATH, JSON.stringify(settings, null, 2), 'utf8');
  } catch (error) {
    console.warn('Failed to write settings file:', error);
    throw error;
  }
};

const sanitizeTypographySizesPartial = (input) => {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const candidate = input;
  const result = {};
  let populated = false;

  const assign = (key) => {
    if (typeof candidate[key] === 'string' && candidate[key].length > 0) {
      result[key] = candidate[key];
      populated = true;
    }
  };

  assign('markdown');
  assign('code');
  assign('uiHeader');
  assign('uiLabel');
  assign('meta');
  assign('micro');

  return populated ? result : undefined;
};

const normalizeStringArray = (input) => {
  if (!Array.isArray(input)) {
    return [];
  }
  return Array.from(
    new Set(
      input.filter((entry) => typeof entry === 'string' && entry.length > 0)
    )
  );
};

const sanitizeSettingsUpdate = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const candidate = payload;
  const result = {};

  if (typeof candidate.themeId === 'string' && candidate.themeId.length > 0) {
    result.themeId = candidate.themeId;
  }
  if (typeof candidate.themeVariant === 'string' && (candidate.themeVariant === 'light' || candidate.themeVariant === 'dark')) {
    result.themeVariant = candidate.themeVariant;
  }
  if (typeof candidate.useSystemTheme === 'boolean') {
    result.useSystemTheme = candidate.useSystemTheme;
  }
  if (typeof candidate.lightThemeId === 'string' && candidate.lightThemeId.length > 0) {
    result.lightThemeId = candidate.lightThemeId;
  }
  if (typeof candidate.darkThemeId === 'string' && candidate.darkThemeId.length > 0) {
    result.darkThemeId = candidate.darkThemeId;
  }
  if (typeof candidate.lastDirectory === 'string' && candidate.lastDirectory.length > 0) {
    result.lastDirectory = candidate.lastDirectory;
  }
  if (typeof candidate.homeDirectory === 'string' && candidate.homeDirectory.length > 0) {
    result.homeDirectory = candidate.homeDirectory;
  }

  if (Array.isArray(candidate.approvedDirectories)) {
    result.approvedDirectories = normalizeStringArray(candidate.approvedDirectories);
  }
  if (Array.isArray(candidate.securityScopedBookmarks)) {
    result.securityScopedBookmarks = normalizeStringArray(candidate.securityScopedBookmarks);
  }
  if (Array.isArray(candidate.pinnedDirectories)) {
    result.pinnedDirectories = normalizeStringArray(candidate.pinnedDirectories);
  }

  if (typeof candidate.uiFont === 'string' && candidate.uiFont.length > 0) {
    result.uiFont = candidate.uiFont;
  }
  if (typeof candidate.monoFont === 'string' && candidate.monoFont.length > 0) {
    result.monoFont = candidate.monoFont;
  }
  if (typeof candidate.markdownDisplayMode === 'string' && candidate.markdownDisplayMode.length > 0) {
    result.markdownDisplayMode = candidate.markdownDisplayMode;
  }
  if (typeof candidate.showReasoningTraces === 'boolean') {
    result.showReasoningTraces = candidate.showReasoningTraces;
  }

  const typography = sanitizeTypographySizesPartial(candidate.typographySizes);
  if (typography) {
    result.typographySizes = typography;
  }

  return result;
};

const mergePersistedSettings = (current, changes) => {
  const baseApproved = Array.isArray(changes.approvedDirectories)
    ? changes.approvedDirectories
    : Array.isArray(current.approvedDirectories)
      ? current.approvedDirectories
      : [];

  const additionalApproved = [];
  if (typeof changes.lastDirectory === 'string' && changes.lastDirectory.length > 0) {
    additionalApproved.push(changes.lastDirectory);
  }
  if (typeof changes.homeDirectory === 'string' && changes.homeDirectory.length > 0) {
    additionalApproved.push(changes.homeDirectory);
  }
  const approvedSource = [...baseApproved, ...additionalApproved];

  const baseBookmarks = Array.isArray(changes.securityScopedBookmarks)
    ? changes.securityScopedBookmarks
    : Array.isArray(current.securityScopedBookmarks)
      ? current.securityScopedBookmarks
      : [];

  const nextTypographySizes = changes.typographySizes
    ? {
        ...(current.typographySizes || {}),
        ...changes.typographySizes
      }
    : current.typographySizes;

  const next = {
    ...current,
    ...changes,
    approvedDirectories: Array.from(
      new Set(
        approvedSource.filter((entry) => typeof entry === 'string' && entry.length > 0)
      )
    ),
    securityScopedBookmarks: Array.from(
      new Set(
        baseBookmarks.filter((entry) => typeof entry === 'string' && entry.length > 0)
      )
    ),
    typographySizes: nextTypographySizes
  };

  return next;
};

const formatSettingsResponse = (settings) => {
  const sanitized = sanitizeSettingsUpdate(settings);
  const approved = normalizeStringArray(settings.approvedDirectories);
  const bookmarks = normalizeStringArray(settings.securityScopedBookmarks);

  return {
    ...sanitized,
    approvedDirectories: approved,
    securityScopedBookmarks: bookmarks,
    pinnedDirectories: normalizeStringArray(settings.pinnedDirectories),
    typographySizes: sanitizeTypographySizesPartial(settings.typographySizes),
    showReasoningTraces:
      typeof settings.showReasoningTraces === 'boolean'
        ? settings.showReasoningTraces
        : typeof sanitized.showReasoningTraces === 'boolean'
          ? sanitized.showReasoningTraces
          : false
  };
};

const persistSettings = async (changes) => {
  const current = await readSettingsFromDisk();
  const sanitized = sanitizeSettingsUpdate(changes);
  const next = mergePersistedSettings(current, sanitized);
  await writeSettingsToDisk(next);
  return formatSettingsResponse(next);
};

// Global state
let openCodeProcess = null;
let openCodePort = null;
let healthCheckInterval = null;
let server = null;
let isShuttingDown = false;
let cachedModelsMetadata = null;
let cachedModelsMetadataTimestamp = 0;
let expressApp = null;
let currentRestartPromise = null;
let isRestartingOpenCode = false;
let openCodeApiPrefix = '';
let openCodeApiPrefixDetected = false;
let openCodeApiDetectionTimer = null;
let isDetectingApiPrefix = false;
let openCodeApiDetectionPromise = null;
let lastOpenCodeError = null;
let openCodePortWaiters = [];
let isOpenCodeReady = false;
let openCodeNotReadySince = 0;
let exitOnShutdown = true;
let signalsAttached = false;
let openCodeWorkingDirectory = process.cwd();
let uiAuthController = null;

const OPENCODE_BINARY_ENV =
  process.env.OPENCODE_BINARY ||
  process.env.OPENCHAMBER_BINARY ||
  process.env.OPENCODE_PATH ||
  process.env.OPENCHAMBER_OPENCODE_PATH ||
  null;

function buildAugmentedPath() {
  const augmented = new Set();

  const loginShellPath = getLoginShellPath();
  if (loginShellPath) {
    for (const segment of loginShellPath.split(path.delimiter)) {
      if (segment) {
        augmented.add(segment);
      }
    }
  }

  const current = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const segment of current) {
    augmented.add(segment);
  }

  return Array.from(augmented).join(path.delimiter);
}

function getLoginShellPath() {
  if (process.platform === 'win32') {
    return null;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  try {
    const result = spawnSync(shell, ['-lc', 'echo -n "$PATH"'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0 && typeof result.stdout === 'string') {
      const value = result.stdout.trim();
      if (value) {
        return value;
      }
    } else if (result.stderr) {
      console.warn(`Failed to read PATH from login shell (${shell}): ${result.stderr}`);
    }
  } catch (error) {
    console.warn(`Error executing login shell (${shell}) for PATH detection: ${error.message}`);
  }
  return null;
}

function resolveBinaryFromPath(binaryName, searchPath) {
  if (!binaryName) {
    return null;
  }
  if (path.isAbsolute(binaryName)) {
    return fs.existsSync(binaryName) ? binaryName : null;
  }
  const directories = searchPath.split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    try {
      const candidate = path.join(directory, binaryName);
      if (fs.existsSync(candidate)) {
        const stats = fs.statSync(candidate);
        if (stats.isFile()) {
          return candidate;
        }
      }
    } catch {
      // Ignore resolution errors, continue searching
    }
  }
  return null;
}

function getOpencodeSpawnConfig() {
  const envPath = buildAugmentedPath();
  const resolvedEnv = { ...process.env, PATH: envPath };

  if (OPENCODE_BINARY_ENV) {
    const explicit = resolveBinaryFromPath(OPENCODE_BINARY_ENV, envPath);
    if (explicit) {
      console.log(`Using OpenCode binary from OPENCODE_BINARY: ${explicit}`);
      return { command: explicit, env: resolvedEnv };
    }
    console.warn(
      `OPENCODE_BINARY path "${OPENCODE_BINARY_ENV}" not found. Falling back to search.`
    );
  }

  return { command: 'opencode', env: resolvedEnv };
}

const ENV_CONFIGURED_OPENCODE_PORT = (() => {
  const raw =
    process.env.OPENCODE_PORT ||
    process.env.OPENCHAMBER_OPENCODE_PORT ||
    process.env.OPENCHAMBER_INTERNAL_PORT;
  if (!raw) {
    return null;
  }
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
})();

const ENV_CONFIGURED_API_PREFIX = normalizeApiPrefix(
  process.env.OPENCODE_API_PREFIX || process.env.OPENCHAMBER_API_PREFIX || ''
);

if (ENV_CONFIGURED_API_PREFIX) {
  openCodeApiPrefix = ENV_CONFIGURED_API_PREFIX;
  openCodeApiPrefixDetected = true;
  console.log(`Using OpenCode API prefix from environment: ${openCodeApiPrefix}`);
}

function setOpenCodePort(port) {
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }

  const numericPort = Math.trunc(port);
  const portChanged = openCodePort !== numericPort;

  if (portChanged || openCodePort === null) {
    openCodePort = numericPort;
    console.log(`Detected OpenCode port: ${openCodePort}`);

    if (portChanged) {
      isOpenCodeReady = false;
    }
    openCodeNotReadySince = Date.now();
  }

  lastOpenCodeError = null;

  if (openCodePortWaiters.length > 0) {
    const waiters = openCodePortWaiters;
    openCodePortWaiters = [];
    for (const notify of waiters) {
      try {
        notify(numericPort);
      } catch (error) {
        console.warn('Failed to notify OpenCode port waiter:', error);
      }
    }
  }
}

async function waitForOpenCodePort(timeoutMs = 15000) {
  if (openCodePort !== null) {
    return openCodePort;
  }

  return new Promise((resolve, reject) => {
    const onPortDetected = (port) => {
      clearTimeout(timeout);
      resolve(port);
    };

    const timeout = setTimeout(() => {
      openCodePortWaiters = openCodePortWaiters.filter((cb) => cb !== onPortDetected);
      reject(new Error('Timed out waiting for OpenCode port'));
    }, timeoutMs);

    openCodePortWaiters.push(onPortDetected);
  });
}

const API_PREFIX_CANDIDATES = ['', '/api']; // Simplified - only check root and /api

function normalizeApiPrefix(prefix) {
  if (!prefix) {
    return '';
  }

  if (prefix.includes('://')) {
    try {
      const parsed = new URL(prefix);
      return normalizeApiPrefix(parsed.pathname);
    } catch (error) {
      return '';
    }
  }

  const trimmed = prefix.trim();
  if (!trimmed || trimmed === '/') {
    return '';
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading.slice(0, -1) : withLeading;
}

function setDetectedOpenCodeApiPrefix(prefix) {
  const normalized = normalizeApiPrefix(prefix);
  if (!openCodeApiPrefixDetected || openCodeApiPrefix !== normalized) {
    openCodeApiPrefix = normalized;
    openCodeApiPrefixDetected = true;
    if (openCodeApiDetectionTimer) {
      clearTimeout(openCodeApiDetectionTimer);
      openCodeApiDetectionTimer = null;
    }
    console.log(`Detected OpenCode API prefix: ${normalized || '(root)'}`);
  }
}

function detectPortFromLogMessage(message) {
  if (openCodePort && ENV_CONFIGURED_OPENCODE_PORT) {
    return;
  }

  const regex = /https?:\/\/[^:\s]+:(\d+)/gi;
  let match;
  while ((match = regex.exec(message)) !== null) {
    const port = parseInt(match[1], 10);
    if (Number.isFinite(port) && port > 0) {
      setOpenCodePort(port);
      return;
    }
  }

  const fallbackMatch = /(?:^|\s)(?:127\.0\.0\.1|localhost):(\d+)/i.exec(message);
  if (fallbackMatch) {
    const port = parseInt(fallbackMatch[1], 10);
    if (Number.isFinite(port) && port > 0) {
      setOpenCodePort(port);
    }
  }
}

function detectPrefixFromLogMessage(message) {
  if (!openCodePort) {
    return;
  }

  const urlRegex = /https?:\/\/[^:\s]+:(\d+)(\/[^\s"']*)?/gi;
  let match;

  while ((match = urlRegex.exec(message)) !== null) {
    const portMatch = parseInt(match[1], 10);
    if (portMatch !== openCodePort) {
      continue;
    }

    const path = match[2] || '';
    const normalized = normalizeApiPrefix(path);
    setDetectedOpenCodeApiPrefix(normalized);
    return;
  }
}

function getCandidateApiPrefixes() {
  if (openCodeApiPrefixDetected) {
    return [openCodeApiPrefix];
  }

  const candidates = [];
  if (openCodeApiPrefix && !candidates.includes(openCodeApiPrefix)) {
    candidates.push(openCodeApiPrefix);
  }

  for (const candidate of API_PREFIX_CANDIDATES) {
    if (!candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

function buildOpenCodeUrl(path, prefixOverride) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = normalizeApiPrefix(
    prefixOverride !== undefined ? prefixOverride : openCodeApiPrefixDetected ? openCodeApiPrefix : ''
  );
  const fullPath = `${prefix}${normalizedPath}`;
  return `http://127.0.0.1:${openCodePort}${fullPath}`;
}

function extractApiPrefixFromUrl(urlString, expectedSuffix) {
  if (!urlString) {
    return null;
  }
  try {
    const parsed = new URL(urlString);
    const pathname = parsed.pathname || '';
    if (expectedSuffix && pathname.endsWith(expectedSuffix)) {
      const prefix = pathname.slice(0, pathname.length - expectedSuffix.length);
      return normalizeApiPrefix(prefix);
    }
  } catch (error) {
    console.warn(`Failed to parse OpenCode URL "${urlString}": ${error.message}`);
  }
  return null;
}

async function tryDetectOpenCodeApiPrefix() {
  if (!openCodePort) {
    return false;
  }

  const docPrefix = await detectPrefixFromDocumentation();
  if (docPrefix !== null) {
    setDetectedOpenCodeApiPrefix(docPrefix);
    return true;
  }

  const candidates = getCandidateApiPrefixes();

  for (const candidate of candidates) {
    try {
      const response = await fetch(buildOpenCodeUrl('/config', candidate), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        await response.json().catch(() => null);
        setDetectedOpenCodeApiPrefix(candidate);
        return true;
      }
    } catch (error) {
      // Ignore and try next candidate
    }
  }

  return false;
}

async function detectOpenCodeApiPrefix() {
  if (openCodeApiPrefixDetected) {
    return true;
  }

  if (!openCodePort) {
    return false;
  }

  if (isDetectingApiPrefix) {
    try {
      await openCodeApiDetectionPromise;
    } catch (error) {
      // Ignore; will retry below
    }
    return openCodeApiPrefixDetected;
  }

  isDetectingApiPrefix = true;
  openCodeApiDetectionPromise = (async () => {
    const success = await tryDetectOpenCodeApiPrefix();
    if (!success) {
      console.warn('Failed to detect OpenCode API prefix via documentation or known candidates');
    }
    return success;
  })();

  try {
    const result = await openCodeApiDetectionPromise;
    return result;
  } finally {
    isDetectingApiPrefix = false;
    openCodeApiDetectionPromise = null;
  }
}

async function ensureOpenCodeApiPrefix() {
  if (openCodeApiPrefixDetected) {
    return true;
  }

  const result = await detectOpenCodeApiPrefix();
  if (!result) {
    scheduleOpenCodeApiDetection();
  }
  return result;
}

function scheduleOpenCodeApiDetection(delayMs = 500) {
  if (openCodeApiPrefixDetected) {
    return;
  }

  if (openCodeApiDetectionTimer) {
    clearTimeout(openCodeApiDetectionTimer);
  }

  openCodeApiDetectionTimer = setTimeout(async () => {
    openCodeApiDetectionTimer = null;
    const success = await detectOpenCodeApiPrefix();
    if (!success) {
      const nextDelay = Math.min(delayMs * 2, 8000);
      scheduleOpenCodeApiDetection(nextDelay);
    }
  }, delayMs);
}

const OPENAPI_DOC_PATHS = ['/doc']; // Simplified - only check main doc endpoint

function extractPrefixFromOpenApiDocument(content) {
  // Simple check for API base in HTML content
  const globalMatch = content.match(/__OPENCODE_API_BASE__\s*=\s*['"]([^'"]+)['"]/);
  if (globalMatch && globalMatch[1]) {
    return normalizeApiPrefix(globalMatch[1]);
  }
  return null;
}

async function detectPrefixFromDocumentation() {
  if (!openCodePort) {
    return null;
  }

  const prefixesToTry = [...new Set(['', ...API_PREFIX_CANDIDATES])];

  for (const prefix of prefixesToTry) {
    for (const docPath of OPENAPI_DOC_PATHS) {
      try {
        const response = await fetch(buildOpenCodeUrl(docPath, prefix), {
          method: 'GET',
          headers: { Accept: '*/*' }
        });

        if (!response.ok) {
          continue;
        }

        const text = await response.text();
        const extracted = extractPrefixFromOpenApiDocument(text);
        if (extracted !== null) {
          return extracted;
        }
      } catch (error) {
        // Ignore and continue scanning other combinations
      }
    }
  }

  return null;
}

// Parse command line arguments
function parseArgs(argv = process.argv.slice(2)) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const envPassword =
    process.env.OPENCHAMBER_UI_PASSWORD ||
    process.env.OPENCODE_UI_PASSWORD ||
    null;
  const options = { port: DEFAULT_PORT, uiPassword: envPassword };

  const consumeValue = (currentIndex, inlineValue) => {
    if (typeof inlineValue === 'string') {
      return { value: inlineValue, nextIndex: currentIndex };
    }
    const nextArg = args[currentIndex + 1];
    if (typeof nextArg === 'string' && !nextArg.startsWith('--')) {
      return { value: nextArg, nextIndex: currentIndex + 1 };
    }
    return { value: undefined, nextIndex: currentIndex };
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      continue;
    }

    const eqIndex = arg.indexOf('=');
    const optionName = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const inlineValue = eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined;

    if (optionName === 'port' || optionName === 'p') {
      const { value, nextIndex } = consumeValue(i, inlineValue);
      i = nextIndex;
      const parsedPort = parseInt(value ?? '', 10);
      options.port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
      continue;
    }

    if (optionName === 'ui-password') {
      const { value, nextIndex } = consumeValue(i, inlineValue);
      i = nextIndex;
      options.uiPassword = typeof value === 'string' ? value : '';
      continue;
    }
  }

  return options;
}

// Start OpenCode process
async function startOpenCode() {
  const desiredPort = ENV_CONFIGURED_OPENCODE_PORT ?? DEFAULT_OPENCODE_PORT;
  console.log(
    desiredPort
      ? `Starting OpenCode on requested port ${desiredPort}...`
      : 'Starting OpenCode with dynamic port assignment...'
  );
  console.log(`Starting OpenCode in working directory: ${openCodeWorkingDirectory}`);

  const { command, env } = getOpencodeSpawnConfig();
  const args = ['serve', '--port', desiredPort.toString()];
  console.log(`Launching OpenCode via "${command}" with args ${args.join(' ')}`);

  const child = spawn(command, args, {
    stdio: 'pipe',
    env,
    cwd: openCodeWorkingDirectory
  });
  isOpenCodeReady = false;
  openCodeNotReadySince = Date.now();

  let firstSignalResolver;
  const firstSignalPromise = new Promise((resolve) => {
    firstSignalResolver = resolve;
  });
  let firstSignalSettled = false;
  const settleFirstSignal = () => {
    if (firstSignalSettled) {
      return;
    }
    firstSignalSettled = true;
    clearTimeout(firstSignalTimer);
    child.stdout.off('data', settleFirstSignal);
    child.stderr.off('data', settleFirstSignal);
    child.off('exit', settleFirstSignal);
    if (firstSignalResolver) {
      firstSignalResolver();
    }
  };
  const firstSignalTimer = setTimeout(settleFirstSignal, 750);

  child.stdout.once('data', settleFirstSignal);
  child.stderr.once('data', settleFirstSignal);
  child.once('exit', settleFirstSignal);

  // Handle output
  child.stdout.on('data', (data) => {
    const text = data.toString();
    console.log(`OpenCode: ${text.trim()}`);
    detectPortFromLogMessage(text);
    detectPrefixFromLogMessage(text);
    settleFirstSignal();
  });

  child.stderr.on('data', (data) => {
    const text = data.toString();
    lastOpenCodeError = text.trim();
    console.error(`OpenCode Error: ${lastOpenCodeError}`);
    detectPortFromLogMessage(text);
    detectPrefixFromLogMessage(text);
    settleFirstSignal();
  });

  let startupError = await new Promise((resolve, reject) => {
    const onSpawn = () => {
      setOpenCodePort(desiredPort);
      child.off('error', onError);
      resolve(null);
    };
    const onError = (error) => {
      child.off('spawn', onSpawn);
      reject(error);
    };

    child.once('spawn', onSpawn);
    child.once('error', onError);
  }).catch((error) => {
    lastOpenCodeError = error.message;
    openCodePort = null;
    settleFirstSignal();
    return error;
  });

  if (startupError) {
    if (startupError.code === 'ENOENT') {
      const enhanced = new Error(
        `Failed to start OpenCode – executable "${command}" not found. ` +
        'Set OPENCODE_BINARY to the full path of the opencode CLI or ensure it is on PATH.'
      );
      enhanced.code = startupError.code;
      startupError = enhanced;
    }
    throw startupError;
  }

  child.on('exit', (code, signal) => {
    lastOpenCodeError = `OpenCode exited with code ${code}, signal ${signal ?? 'null'}`;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();

    // Do not auto-restart if we are already in restart process
    if (!isShuttingDown && !isRestartingOpenCode) {
      console.log(`OpenCode process exited with code ${code}, signal ${signal}`);
      // Restart OpenCode if not shutting down
      setTimeout(() => {
        restartOpenCode().catch((err) => {
          console.error('Failed to restart OpenCode after exit:', err);
        });
      }, 5000);
    } else if (isRestartingOpenCode) {
      console.log('OpenCode exit during controlled restart, not triggering auto-restart');
    }
  });

  child.on('error', (error) => {
    lastOpenCodeError = error.message;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.error(`OpenCode process error: ${error.message}`);
    if (!isShuttingDown) {
      // Restart OpenCode if not shutting down
      setTimeout(() => {
        restartOpenCode().catch((err) => {
          console.error('Failed to restart OpenCode after error:', err);
        });
      }, 5000);
    }
  });

  await firstSignalPromise;

  return child;
}

// Restart OpenCode process
async function restartOpenCode() {
  if (isShuttingDown) return;
  if (currentRestartPromise) {
    await currentRestartPromise;
    return;
  }

  currentRestartPromise = (async () => {
    isRestartingOpenCode = true;
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.log('Restarting OpenCode process...');

    if (openCodeProcess) {
      console.log('Waiting for OpenCode process to terminate...');
      const processToTerminate = openCodeProcess;
      let forcedTermination = false;

      if (processToTerminate.exitCode === null && processToTerminate.signalCode === null) {
        processToTerminate.kill('SIGTERM');

        await new Promise((resolve) => {
          let resolved = false;

          const cleanup = () => {
            processToTerminate.off('exit', onExit);
            clearTimeout(forceKillTimer);
            clearTimeout(hardStopTimer);
            if (!resolved) {
              resolved = true;
              resolve();
            }
          };

          const onExit = () => {
            cleanup();
          };

          const forceKillTimer = setTimeout(() => {
            if (resolved) {
              return;
            }
            forcedTermination = true;
            console.warn('OpenCode process did not exit after SIGTERM, sending SIGKILL');
            processToTerminate.kill('SIGKILL');
          }, 3000);

          const hardStopTimer = setTimeout(() => {
            if (resolved) {
              return;
            }
            console.warn('OpenCode process unresponsive after SIGKILL, continuing restart');
            cleanup();
          }, 5000);

          processToTerminate.once('exit', onExit);
        });

        if (forcedTermination) {
          console.log('OpenCode process terminated forcefully during restart');
        }
      } else {
        console.log('OpenCode process already stopped before restart command');
      }

      openCodeProcess = null;

      // Allow the OS a brief window to release any held resources
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    if (ENV_CONFIGURED_OPENCODE_PORT) {
      console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
      setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
    } else {
      openCodePort = null;
    }
    openCodeApiPrefixDetected = false;
    if (openCodeApiDetectionTimer) {
      clearTimeout(openCodeApiDetectionTimer);
      openCodeApiDetectionTimer = null;
    }
    openCodeApiDetectionPromise = null;

    lastOpenCodeError = null;
    openCodeProcess = await startOpenCode();

    if (!ENV_CONFIGURED_OPENCODE_PORT) {
      await waitForOpenCodePort();
    }

    if (expressApp) {
      setupProxy(expressApp);
      scheduleOpenCodeApiDetection();
    }
  })();

  try {
    await currentRestartPromise;
  } catch (error) {
    console.error(`Failed to restart OpenCode: ${error.message}`);
    lastOpenCodeError = error.message;
    if (!ENV_CONFIGURED_OPENCODE_PORT) {
      openCodePort = null;
    }
    openCodeApiPrefixDetected = false;
    throw error;
  } finally {
    currentRestartPromise = null;
    isRestartingOpenCode = false;
  }
}

async function waitForOpenCodeReady(timeoutMs = 20000, intervalMs = 400) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    const prefixes = getCandidateApiPrefixes();

    for (const prefix of prefixes) {
      try {
        const normalizedPrefix = normalizeApiPrefix(prefix);
        const healthPromise = fetch(buildOpenCodeUrl('/health', normalizedPrefix), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        }).catch((error) => error);

        const configPromise = fetch(buildOpenCodeUrl('/config', normalizedPrefix), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        }).catch((error) => error);

        const [healthResult, configResult] = await Promise.all([healthPromise, configPromise]);

        if (healthResult instanceof Error) {
          lastError = healthResult;
        } else if (healthResult.ok) {
          const healthData = await healthResult.json().catch(() => null);
          if (healthData && healthData.isOpenCodeReady === false) {
            lastError = new Error('OpenCode health indicates not ready');
            continue;
          }
        } else {
          lastError = new Error(`OpenCode health endpoint responded with status ${healthResult.status}`);
        }

        if (configResult instanceof Error) {
          lastError = configResult;
          continue;
        }

        if (!configResult.ok) {
          if (configResult.status === 404 && !openCodeApiPrefixDetected && normalizedPrefix === '') {
            lastError = new Error('OpenCode config endpoint returned 404 on root prefix');
          } else {
            lastError = new Error(`OpenCode config endpoint responded with status ${configResult.status}`);
          }
          continue;
        }

        await configResult.json().catch(() => null);
        const detectedPrefix = extractApiPrefixFromUrl(configResult.url, '/config');
        if (detectedPrefix !== null) {
          setDetectedOpenCodeApiPrefix(detectedPrefix);
        } else if (normalizedPrefix) {
          setDetectedOpenCodeApiPrefix(normalizedPrefix);
        }

        const effectivePrefix = detectedPrefix !== null ? detectedPrefix : normalizedPrefix;

        const agentResponse = await fetch(
          buildOpenCodeUrl('/agent', effectivePrefix),
          {
            method: 'GET',
            headers: { Accept: 'application/json' }
          }
        ).catch((error) => error);

        if (agentResponse instanceof Error) {
          lastError = agentResponse;
          continue;
        }

        if (!agentResponse.ok) {
          lastError = new Error(`Agent endpoint responded with status ${agentResponse.status}`);
          continue;
        }

        await agentResponse.json().catch(() => []);

        if (detectedPrefix === null) {
          const agentPrefix = extractApiPrefixFromUrl(agentResponse.url, '/agent');
          if (agentPrefix !== null) {
            setDetectedOpenCodeApiPrefix(agentPrefix);
          } else if (normalizedPrefix) {
            setDetectedOpenCodeApiPrefix(normalizedPrefix);
          }
        }

        isOpenCodeReady = true;
        lastOpenCodeError = null;
        return;
      } catch (error) {
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  if (lastError) {
    lastOpenCodeError = lastError.message || String(lastError);
    throw lastError;
  }

  const timeoutError = new Error('Timed out waiting for OpenCode to become ready');
  lastOpenCodeError = timeoutError.message;
  throw timeoutError;
}

async function waitForAgentPresence(agentName, timeoutMs = 15000, intervalMs = 300) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(buildOpenCodeUrl('/agent'), {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents) && agents.some((agent) => agent?.name === agentName)) {
          return;
        }
      }
    } catch (error) {
      // Ignore and retry
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Agent "${agentName}" not available after OpenCode restart`);
}

async function fetchAgentsSnapshot() {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const response = await fetch(buildOpenCodeUrl('/agent'), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch agents snapshot (status ${response.status})`);
  }

  const agents = await response.json().catch(() => null);
  if (!Array.isArray(agents)) {
    throw new Error('Invalid agents payload from OpenCode');
  }
  return agents;
}

async function fetchProvidersSnapshot() {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const response = await fetch(buildOpenCodeUrl('/provider'), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch providers snapshot (status ${response.status})`);
  }

  const providers = await response.json().catch(() => null);
  if (!Array.isArray(providers)) {
    throw new Error('Invalid providers payload from OpenCode');
  }
  return providers;
}

async function fetchModelsSnapshot() {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }

  const response = await fetch(buildOpenCodeUrl('/model'), {
    method: 'GET',
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch models snapshot (status ${response.status})`);
  }

  const models = await response.json().catch(() => null);
  if (!Array.isArray(models)) {
    throw new Error('Invalid models payload from OpenCode');
  }
  return models;
}


async function refreshOpenCodeAfterConfigChange(reason, options = {}) {
  const { agentName } = options;

  console.log(`Refreshing OpenCode after ${reason}`);
  await restartOpenCode();

  try {
    await waitForOpenCodeReady();
    isOpenCodeReady = true;
    openCodeNotReadySince = 0;

    // Simple agent presence check if needed
    if (agentName) {
      await waitForAgentPresence(agentName);
    }

    isOpenCodeReady = true;
    openCodeNotReadySince = 0;
  } catch (error) {
    // Do not set isOpenCodeReady = true on error!
    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.error(`Failed to refresh OpenCode after ${reason}:`, error.message);
    throw error;
  }
}

// Setup proxy middleware
function setupProxy(app) {
  if (!openCodePort) return;

  if (app.get('opencodeProxyConfigured')) {
    return;
  }

  console.log(`Setting up proxy to OpenCode on port ${openCodePort}`);
  app.set('opencodeProxyConfigured', true);

  app.use('/api', (req, res, next) => {
    if (
      req.path.startsWith('/themes/custom') ||
      req.path.startsWith('/config/agents') ||
      req.path.startsWith('/config/settings') ||
      req.path === '/health'
    ) {
      return next();
    }

    const waitElapsed = openCodeNotReadySince === 0 ? 0 : Date.now() - openCodeNotReadySince;
    const stillWaiting =
      (!isOpenCodeReady && (openCodeNotReadySince === 0 || waitElapsed < OPEN_CODE_READY_GRACE_MS)) ||
      isRestartingOpenCode ||
      !openCodePort;

    if (stillWaiting) {
      return res.status(503).json({
        error: 'OpenCode is restarting',
        restarting: true,
      });
    }

    next();
  });

  app.use('/api', async (req, res, next) => {
    try {
      await ensureOpenCodeApiPrefix();
    } catch (error) {
      console.warn(`OpenCode API prefix detection failed for ${req.method} ${req.path}: ${error.message}`);
    }
    next();
  });

  // Debug middleware for OpenCode API routes (must be before proxy)
  app.use('/api', (req, res, next) => {
    if (
      req.path.startsWith('/themes/custom') ||
      req.path.startsWith('/config/agents') ||
      req.path.startsWith('/config/settings') ||
      req.path === '/health'
    ) {
      return next();
    }
    console.log(`API → OpenCode: ${req.method} ${req.path}`);
    next();
  });

  const proxyMiddleware = createProxyMiddleware({
    target: openCodePort ? `http://localhost:${openCodePort}` : 'http://127.0.0.1:0',
    router: () => {
      if (!openCodePort) {
        return 'http://127.0.0.1:0';
      }
      return `http://localhost:${openCodePort}`;
    },
    changeOrigin: true,
    pathRewrite: (path) => {
      if (!path.startsWith('/api')) {
        return path;
      }

      const suffix = path.slice(4) || '/';

      if (!openCodeApiPrefixDetected || openCodeApiPrefix === '') {
        return suffix;
      }

      return `${openCodeApiPrefix}${suffix}`;
    },
    ws: true,
    onError: (err, req, res) => {
      console.error(`Proxy error: ${err.message}`);
      if (!res.headersSent) {
        res.status(503).json({ error: 'OpenCode service unavailable' });
      }
    },
    onProxyReq: (proxyReq, req, res) => {
      console.log(`Proxying ${req.method} ${req.path} to OpenCode`);
      if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
        proxyReq.setHeader('Accept', 'text/event-stream');
        proxyReq.setHeader('Cache-Control', 'no-cache');
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      if (req.url?.includes('/event')) {
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Cache-Control, Accept';
        proxyRes.headers['Content-Type'] = 'text/event-stream';
        proxyRes.headers['Cache-Control'] = 'no-cache';
        proxyRes.headers['Connection'] = 'keep-alive';
      }

      if (proxyRes.statusCode === 404 && !openCodeApiPrefixDetected) {
        scheduleOpenCodeApiDetection();
      }
    }
  });

  app.use('/api', proxyMiddleware);
}

// Start health monitoring
function startHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    if (!openCodeProcess || isShuttingDown) return;

    try {
      // Check if OpenCode process is still running
      if (openCodeProcess.exitCode !== null) {
        console.log('OpenCode process not running, restarting...');
        await restartOpenCode();
      }
    } catch (error) {
      console.error(`Health check error: ${error.message}`);
    }
  }, HEALTH_CHECK_INTERVAL);
}

// Graceful shutdown
async function gracefulShutdown(options = {}) {
  if (isShuttingDown) return;

  isShuttingDown = true;
  console.log('Starting graceful shutdown...');
  const exitProcess = typeof options.exitProcess === 'boolean' ? options.exitProcess : exitOnShutdown;

  // Stop health monitoring
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  // Stop OpenCode process
  if (openCodeProcess) {
    console.log('Stopping OpenCode process...');
    openCodeProcess.kill('SIGTERM');

    // Wait for graceful shutdown
    await new Promise((resolve) => {
      const timeout = setTimeout(() => {
        openCodeProcess.kill('SIGKILL');
        resolve();
      }, SHUTDOWN_TIMEOUT);

      openCodeProcess.on('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  // Close HTTP server
  if (server) {
    await new Promise((resolve) => {
      server.close(() => {
        console.log('HTTP server closed');
        resolve();
      });
    });
  }

  if (uiAuthController) {
    uiAuthController.dispose();
    uiAuthController = null;
  }

  console.log('Graceful shutdown complete');
  if (exitProcess) {
    process.exit(0);
  }
}

// Main function
async function main(options = {}) {
  const port = Number.isFinite(options.port) && options.port >= 0 ? Math.trunc(options.port) : DEFAULT_PORT;
  const attachSignals = options.attachSignals !== false;
  if (typeof options.exitOnShutdown === 'boolean') {
    exitOnShutdown = options.exitOnShutdown;
  }

  console.log(`Starting OpenChamber on port ${port}`);

  // Create Express app
  const app = express();
  expressApp = app;
  server = http.createServer(app);

  // Health check endpoint - MUST be before any other middleware that might interfere
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      openCodePort: openCodePort,
      openCodeRunning: Boolean(openCodeProcess && openCodeProcess.exitCode === null),
      openCodeApiPrefix,
      openCodeApiPrefixDetected,
      isOpenCodeReady,
      lastOpenCodeError
    });
  });

  // Basic middleware - skip JSON parsing for /api routes (handled by proxy)
  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/config/agents') ||
      req.path.startsWith('/api/config/commands') ||
      req.path.startsWith('/api/config/settings') ||
      req.path.startsWith('/api/fs') ||
      req.path.startsWith('/api/git') ||
      req.path.startsWith('/api/prompts') ||
      req.path.startsWith('/api/terminal') ||
      req.path.startsWith('/api/opencode')
    ) {
      // Parse JSON for OpenChamber endpoints (agent config, command config, file system operations, git, terminal)
      express.json()(req, res, next);
    } else if (req.path.startsWith('/api')) {
      // Skip JSON parsing for OpenCode API routes (let proxy handle it)
      next();
    } else {
      // Parse JSON for other routes
      express.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true }));

  // Request logging
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });

  const uiPassword = typeof options.uiPassword === 'string' ? options.uiPassword : null;
  uiAuthController = createUiAuth({ password: uiPassword });
  if (uiAuthController.enabled) {
    console.log('UI password protection enabled for browser sessions');
  }

  app.get('/auth/session', (req, res) => uiAuthController.handleSessionStatus(req, res));
  app.post('/auth/session', (req, res) => uiAuthController.handleSessionCreate(req, res));

  app.use('/api', (req, res, next) => uiAuthController.requireAuth(req, res, next));

  app.get('/api/openchamber/models-metadata', async (req, res) => {
    const now = Date.now();

    if (cachedModelsMetadata && now - cachedModelsMetadataTimestamp < MODELS_METADATA_CACHE_TTL) {
      res.setHeader('Cache-Control', 'public, max-age=60');
      return res.json(cachedModelsMetadata);
    }

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 8000) : null;

    try {
      const response = await fetch(MODELS_DEV_API_URL, {
        signal: controller?.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`models.dev responded with status ${response.status}`);
      }

      const metadata = await response.json();
      cachedModelsMetadata = metadata;
      cachedModelsMetadataTimestamp = Date.now();

      res.setHeader('Cache-Control', 'public, max-age=300');
      res.json(metadata);
    } catch (error) {
      console.warn('Failed to fetch models.dev metadata via server:', error);

      if (cachedModelsMetadata) {
        res.setHeader('Cache-Control', 'public, max-age=60');
        res.json(cachedModelsMetadata);
      } else {
        const statusCode = error?.name === 'AbortError' ? 504 : 502;
        res.status(statusCode).json({ error: 'Failed to retrieve model metadata' });
      }
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  });

  app.get('/api/config/settings', async (_req, res) => {
    try {
      const settings = await readSettingsFromDisk();
      res.json(formatSettingsResponse(settings));
    } catch (error) {
      console.error('Failed to load settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load settings' });
    }
  });

  app.put('/api/config/settings', async (req, res) => {
    try {
      const updated = await persistSettings(req.body ?? {});
      res.json(updated);
    } catch (error) {
      console.error('Failed to save settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save settings' });
    }
  });




  // Agent configuration endpoints (OpenChamber-specific, direct file manipulation)
  const {
    getAgentSources,
    createAgent,
    updateAgent,
    deleteAgent,
    getCommandSources,
    createCommand,
    updateCommand,
    deleteCommand
  } = await import('./lib/opencode-config.js');

  // GET /api/config/agents/:name - Get agent configuration metadata
  app.get('/api/config/agents/:name', (req, res) => {
    try {
      const agentName = req.params.name;
      const sources = getAgentSources(agentName);

      res.json({
        name: agentName,
        sources: sources,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get agent sources:', error);
      res.status(500).json({ error: 'Failed to get agent configuration metadata' });
    }
  });

  // POST /api/config/agents/:name - Create new agent
  app.post('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const config = req.body;

      createAgent(agentName, config);
      await refreshOpenCodeAfterConfigChange('agent creation', {
        agentName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} created successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to create agent:', error);
      res.status(500).json({ error: error.message || 'Failed to create agent' });
    }
  });

  // PATCH /api/config/agents/:name - Update existing agent
  app.patch('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;

      console.log(`[Server] Updating agent: ${agentName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));

      updateAgent(agentName, updates);
      await refreshOpenCodeAfterConfigChange('agent update');

      console.log(`[Server] Agent ${agentName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} updated successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to update agent:', error);
      console.error('[Server] Error stack:', error.stack);
      res.status(500).json({ error: error.message || 'Failed to update agent' });
    }
  });

  // DELETE /api/config/agents/:name - Delete agent
  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;

      deleteAgent(agentName);
      await refreshOpenCodeAfterConfigChange('agent deletion');

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} deleted successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to delete agent:', error);
      res.status(500).json({ error: error.message || 'Failed to delete agent' });
    }
  });

  // Command configuration endpoints (OpenChamber-specific, direct file manipulation)

  // GET /api/config/commands/:name - Get command configuration metadata
  app.get('/api/config/commands/:name', (req, res) => {
    try {
      const commandName = req.params.name;
      const sources = getCommandSources(commandName);

      res.json({
        name: commandName,
        sources: sources,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get command sources:', error);
      res.status(500).json({ error: 'Failed to get command configuration metadata' });
    }
  });

  // POST /api/config/commands/:name - Create new command
  app.post('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const config = req.body;

      console.log('[Server] Creating command:', commandName);
      console.log('[Server] Config received:', JSON.stringify(config, null, 2));

      createCommand(commandName, config);
      await refreshOpenCodeAfterConfigChange('command creation', {
        commandName
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} created successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to create command:', error);
      res.status(500).json({ error: error.message || 'Failed to create command' });
    }
  });

  // PATCH /api/config/commands/:name - Update existing command
  app.patch('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const updates = req.body;

      console.log(`[Server] Updating command: ${commandName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));

      updateCommand(commandName, updates);
      await refreshOpenCodeAfterConfigChange('command update');

      console.log(`[Server] Command ${commandName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} updated successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to update command:', error);
      console.error('[Server] Error stack:', error.stack);
      res.status(500).json({ error: error.message || 'Failed to update command' });
    }
  });

  // DELETE /api/config/commands/:name - Delete command
  app.delete('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;

      deleteCommand(commandName);
      await refreshOpenCodeAfterConfigChange('command deletion');

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} deleted successfully. Reloading interface…`,
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to delete command:', error);
      res.status(500).json({ error: error.message || 'Failed to delete command' });
    }
  });

  // POST /api/config/reload - Manual configuration reload (restart OpenCode)
  app.post('/api/config/reload', async (req, res) => {
    try {
      console.log('[Server] Manual configuration reload requested');

      await refreshOpenCodeAfterConfigChange('manual configuration reload');

      res.json({
        success: true,
        requiresReload: true,
        message: 'Configuration reloaded successfully. Refreshing interface…',
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('[Server] Failed to reload configuration:', error);
      res.status(500).json({
        error: error.message || 'Failed to reload configuration',
        success: false
      });
    }
  });

  // Git integration endpoints (OpenChamber-specific)
  // Lazy load Git libraries only when needed
  let gitLibraries = null;
  const getGitLibraries = async () => {
    if (!gitLibraries) {
      const [storage, service] = await Promise.all([
        import('./lib/git-identity-storage.js'),
        import('./lib/git-service.js')
      ]);
      gitLibraries = { ...storage, ...service };
    }
    return gitLibraries;
  };

  // GET /api/git/identities - List all identity profiles
  app.get('/api/git/identities', async (req, res) => {
    const { getProfiles } = await getGitLibraries();
    try {
      const profiles = getProfiles();
      res.json(profiles);
    } catch (error) {
      console.error('Failed to list git identity profiles:', error);
      res.status(500).json({ error: 'Failed to list git identity profiles' });
    }
  });

  // POST /api/git/identities - Create new identity profile
  app.post('/api/git/identities', async (req, res) => {
    const { createProfile } = await getGitLibraries();
    try {
      const profile = createProfile(req.body);
      console.log(`Created git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error('Failed to create git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to create git identity profile' });
    }
  });

  // PUT /api/git/identities/:id - Update identity profile
  app.put('/api/git/identities/:id', async (req, res) => {
    const { updateProfile } = await getGitLibraries();
    try {
      const profile = updateProfile(req.params.id, req.body);
      console.log(`Updated git identity profile: ${profile.name} (${profile.id})`);
      res.json(profile);
    } catch (error) {
      console.error('Failed to update git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to update git identity profile' });
    }
  });

  // DELETE /api/git/identities/:id - Delete identity profile
  app.delete('/api/git/identities/:id', async (req, res) => {
    const { deleteProfile } = await getGitLibraries();
    try {
      deleteProfile(req.params.id);
      console.log(`Deleted git identity profile: ${req.params.id}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to delete git identity profile:', error);
      res.status(400).json({ error: error.message || 'Failed to delete git identity profile' });
    }
  });

  // GET /api/git/global-identity - Get global git identity
  app.get('/api/git/global-identity', async (req, res) => {
    const { getGlobalIdentity } = await getGitLibraries();
    try {
      const identity = await getGlobalIdentity();
      res.json(identity);
    } catch (error) {
      console.error('Failed to get global git identity:', error);
      res.status(500).json({ error: 'Failed to get global git identity' });
    }
  });

  // GET /api/git/check - Check if directory is a git repository
  app.get('/api/git/check', async (req, res) => {
    const { isGitRepository } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const isRepo = await isGitRepository(directory);
      res.json({ isGitRepository: isRepo });
    } catch (error) {
      console.error('Failed to check git repository:', error);
      res.status(500).json({ error: 'Failed to check git repository' });
    }
  });

  // GET /api/git/current-identity - Get current git identity for directory
  app.get('/api/git/current-identity', async (req, res) => {
    const { getCurrentIdentity } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const identity = await getCurrentIdentity(directory);
      res.json(identity);
    } catch (error) {
      console.error('Failed to get current git identity:', error);
      res.status(500).json({ error: 'Failed to get current git identity' });
    }
  });

  // POST /api/git/set-identity - Set git identity for directory
  app.post('/api/git/set-identity', async (req, res) => {
    const { getProfile, setLocalIdentity, getGlobalIdentity } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { profileId } = req.body;
      if (!profileId) {
        return res.status(400).json({ error: 'profileId is required' });
      }

      let profile = null;

      if (profileId === 'global') {
        const globalIdentity = await getGlobalIdentity();
        if (!globalIdentity?.userName || !globalIdentity?.userEmail) {
          return res.status(404).json({ error: 'Global identity is not configured' });
        }
        profile = {
          id: 'global',
          name: 'Global Identity',
          userName: globalIdentity.userName,
          userEmail: globalIdentity.userEmail,
          sshKey: globalIdentity.sshCommand
            ? globalIdentity.sshCommand.replace('ssh -i ', '')
            : null,
        };
      } else {
        profile = getProfile(profileId);
        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }
      }

      await setLocalIdentity(directory, profile);
      res.json({ success: true, profile });
    } catch (error) {
      console.error('Failed to set git identity:', error);
      res.status(500).json({ error: error.message || 'Failed to set git identity' });
    }
  });

  // GET /api/git/status - Get git status
  app.get('/api/git/status', async (req, res) => {
    const { getStatus } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const status = await getStatus(directory);
      res.json(status);
    } catch (error) {
      console.error('Failed to get git status:', error);
      res.status(500).json({ error: error.message || 'Failed to get git status' });
    }
  });

  // GET /api/git/diff - Get git diff for a file
  app.get('/api/git/diff', async (req, res) => {
    const { getDiff } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const path = req.query.path;
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: 'path parameter is required' });
      }

      const staged = req.query.staged === 'true';
      const context = req.query.context ? parseInt(String(req.query.context), 10) : undefined;

      const diff = await getDiff(directory, {
        path,
        staged,
        contextLines: Number.isFinite(context) ? context : 3,
      });

      res.json({ diff });
    } catch (error) {
      console.error('Failed to get git diff:', error);
      res.status(500).json({ error: error.message || 'Failed to get git diff' });
    }
  });

  // POST /api/git/revert - Revert changes for a file
  app.post('/api/git/revert', async (req, res) => {
    const { revertFile } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path } = req.body || {};
      if (!path || typeof path !== 'string') {
        return res.status(400).json({ error: 'path parameter is required' });
      }

      await revertFile(directory, path);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to revert git file:', error);
      res.status(500).json({ error: error.message || 'Failed to revert git file' });
    }
  });

  // POST /api/git/commit-message - Generate commit message via AI proxy
  app.post('/api/git/commit-message', async (req, res) => {
    const { collectDiffs } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory || typeof directory !== 'string') {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const files = Array.isArray(req.body?.files) ? req.body.files : [];
      if (files.length === 0) {
        return res.status(400).json({ error: 'At least one file is required' });
      }

      const diffs = await collectDiffs(directory, files);
      if (diffs.length === 0) {
        return res.status(400).json({ error: 'No diffs available for selected files' });
      }

      const MAX_DIFF_LENGTH = 4000;
      const diffSummaries = diffs
        .map(({ path, diff }) => {
          const trimmed = diff.length > MAX_DIFF_LENGTH ? `${diff.slice(0, MAX_DIFF_LENGTH)}\n...` : diff;
          return `FILE: ${path}\n${trimmed}`;
        })
        .join('\n\n');

      const prompt = `You are drafting git commit notes for this codebase. Respond in JSON of the shape {"subject": string, "highlights": string[]} (ONLY the JSON in response, no markdown wrappers or anything except JSON) with these rules:\n- subject follows our convention: type[optional-scope]: summary (examples: "feat: add diff virtualization", "fix(chat): restore enter key handling")\n- allowed types: feat, fix, chore, style, refactor, perf, docs, test, build, ci (choose the best match or fallback to chore)\n- summary must be imperative, concise, <= 70 characters, no trailing punctuation\n- scope is optional; include only when obvious from filenames/folders; do not invent scopes\n- focus on the most impactful user-facing change; if multiple capabilities ship together, align the subject with the dominant theme and use highlights to cover the other major outcomes\n- highlights array should contain 2-3 plain sentences (<= 90 chars each) that describe distinct features or UI changes users will notice (e.g. "Add per-file revert action in Changes list"). Avoid subjective benefit statements, marketing tone, repeating the subject, or referencing helper function names. Highlight additions such as new controls/buttons, new actions (e.g. revert), or stored state changes explicitly. Skip highlights if fewer than two meaningful points exist.\n- text must be plain (no markdown bullets); each highlight should start with an uppercase verb\n\nDiff summary:\n${diffSummaries}`;

      const completionTimeout = createTimeoutSignal(LONG_REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch('https://opencode.ai/zen/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'big-pickle',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 3000,
            stream: false,
            reasoning: {
              effort: 'low'
            }
          }),
          signal: completionTimeout.signal,
        });
      } finally {
        completionTimeout.cleanup();
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        console.error('Commit message generation failed:', errorBody);
        return res.status(502).json({ error: 'Failed to generate commit message' });
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content?.trim();

      if (!raw) {
        return res.status(502).json({ error: 'No commit message returned by generator' });
      }

      const cleanedJson = stripJsonMarkdownWrapper(raw);
      const candidates = [cleanedJson, raw].filter((candidate, index, array) => {
        return candidate && array.indexOf(candidate) === index;
      });

      for (const candidate of candidates) {
        if (!(candidate.startsWith('{') || candidate.startsWith('['))) {
          continue;
        }
        try {
          const parsed = JSON.parse(candidate);
          return res.json({ message: parsed });
        } catch (parseError) {
          console.warn('Commit message generation returned non-JSON body:', parseError);
        }
      }

      res.json({ message: { subject: raw, highlights: [] } });
    } catch (error) {
      console.error('Failed to generate commit message:', error);
      res.status(500).json({ error: error.message || 'Failed to generate commit message' });
    }
  });

  // POST /api/git/pull - Pull from remote
  app.post('/api/git/pull', async (req, res) => {
    const { pull } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await pull(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to pull:', error);
      res.status(500).json({ error: error.message || 'Failed to pull from remote' });
    }
  });

  // POST /api/git/push - Push to remote
  app.post('/api/git/push', async (req, res) => {
    const { push } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await push(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to push:', error);
      res.status(500).json({ error: error.message || 'Failed to push to remote' });
    }
  });

  // POST /api/git/fetch - Fetch from remote
  app.post('/api/git/fetch', async (req, res) => {
    const { fetch: gitFetch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const result = await gitFetch(directory, req.body);
      res.json(result);
    } catch (error) {
      console.error('Failed to fetch:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch from remote' });
    }
  });

  // POST /api/git/commit - Create commit
  app.post('/api/git/commit', async (req, res) => {
    const { commit } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { message, addAll, files } = req.body;
      if (!message) {
        return res.status(400).json({ error: 'message is required' });
      }

      const result = await commit(directory, message, {
        addAll,
        files,
      });
      res.json(result);
    } catch (error) {
      console.error('Failed to commit:', error);
      res.status(500).json({ error: error.message || 'Failed to create commit' });
    }
  });

  // GET /api/git/branches - List branches
  app.get('/api/git/branches', async (req, res) => {
    const { getBranches } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const branches = await getBranches(directory);
      res.json(branches);
    } catch (error) {
      console.error('Failed to get branches:', error);
      res.status(500).json({ error: error.message || 'Failed to get branches' });
    }
  });

  // POST /api/git/branches - Create new branch
  app.post('/api/git/branches', async (req, res) => {
    const { createBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { name, startPoint } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'name is required' });
      }

      const result = await createBranch(directory, name, { startPoint });
      res.json(result);
    } catch (error) {
      console.error('Failed to create branch:', error);
      res.status(500).json({ error: error.message || 'Failed to create branch' });
    }
  });

  // DELETE /api/git/branches - Remove branch
  app.delete('/api/git/branches', async (req, res) => {
    const { deleteBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { branch, force } = req.body;
      if (!branch) {
        return res.status(400).json({ error: 'branch is required' });
      }

      const result = await deleteBranch(directory, branch, { force });
      res.json(result);
    } catch (error) {
      console.error('Failed to delete branch:', error);
      res.status(500).json({ error: error.message || 'Failed to delete branch' });
    }
  });

  // DELETE /api/git/remote-branches - Remove remote branch
  app.delete('/api/git/remote-branches', async (req, res) => {
    const { deleteRemoteBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { branch, remote } = req.body;
      if (!branch) {
        return res.status(400).json({ error: 'branch is required' });
      }

      const result = await deleteRemoteBranch(directory, { branch, remote });
      res.json(result);
    } catch (error) {
      console.error('Failed to delete remote branch:', error);
      res.status(500).json({ error: error.message || 'Failed to delete remote branch' });
    }
  });

  // POST /api/git/checkout - Checkout branch
  app.post('/api/git/checkout', async (req, res) => {
    const { checkoutBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { branch } = req.body;
      if (!branch) {
        return res.status(400).json({ error: 'branch is required' });
      }

      const result = await checkoutBranch(directory, branch);
      res.json(result);
    } catch (error) {
      console.error('Failed to checkout branch:', error);
      res.status(500).json({ error: error.message || 'Failed to checkout branch' });
    }
  });

  // GET /api/git/worktrees - List worktrees
  app.get('/api/git/worktrees', async (req, res) => {
    const { getWorktrees } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const worktrees = await getWorktrees(directory);
      res.json(worktrees);
    } catch (error) {
      console.error('Failed to get worktrees:', error);
      res.status(500).json({ error: error.message || 'Failed to get worktrees' });
    }
  });

  // POST /api/git/worktrees - Add worktree
  app.post('/api/git/worktrees', async (req, res) => {
    const { addWorktree } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path, branch, createBranch } = req.body;
      if (!path || !branch) {
        return res.status(400).json({ error: 'path and branch are required' });
      }

      const result = await addWorktree(directory, path, branch, { createBranch });
      res.json(result);
    } catch (error) {
      console.error('Failed to add worktree:', error);
      res.status(500).json({ error: error.message || 'Failed to add worktree' });
    }
  });

  // DELETE /api/git/worktrees - Remove worktree
  app.delete('/api/git/worktrees', async (req, res) => {
    const { removeWorktree } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path, force } = req.body;
      if (!path) {
        return res.status(400).json({ error: 'path is required' });
      }

      const result = await removeWorktree(directory, path, { force });
      res.json(result);
    } catch (error) {
      console.error('Failed to remove worktree:', error);
      res.status(500).json({ error: error.message || 'Failed to remove worktree' });
    }
  });

  // POST /api/git/ignore-openchamber - Ensure .openchamber/ is ignored
  app.post('/api/git/ignore-openchamber', async (req, res) => {
    const { ensureOpenChamberIgnored } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      await ensureOpenChamberIgnored(directory);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to ignore .openchamber directory:', error);
      res.status(500).json({ error: error.message || 'Failed to update git ignore' });
    }
  });

  app.get('/api/git/worktree-type', async (req, res) => {
    const { isLinkedWorktree } = await getGitLibraries();
    try {
      const { directory } = req.query;
      if (!directory || typeof directory !== 'string') {
        return res.status(400).json({ error: 'directory parameter is required' });
      }
      const linked = await isLinkedWorktree(directory);
      res.json({ linked });
    } catch (error) {
      console.error('Failed to determine worktree type:', error);
      res.status(500).json({ error: error.message || 'Failed to determine worktree type' });
    }
  });

  // GET /api/git/log - Get commit log
  app.get('/api/git/log', async (req, res) => {
    const { getLog } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { maxCount, from, to, file } = req.query;
      const log = await getLog(directory, {
        maxCount: maxCount ? parseInt(maxCount) : undefined,
        from,
        to,
        file
      });
      res.json(log);
    } catch (error) {
      console.error('Failed to get log:', error);
      res.status(500).json({ error: error.message || 'Failed to get commit log' });
    }
  });

  // GET /api/fs/home - Return user home directory
  app.get('/api/fs/home', (req, res) => {
    try {
      const home = os.homedir();
      if (!home || typeof home !== 'string' || home.length === 0) {
        return res.status(500).json({ error: 'Failed to resolve home directory' });
      }
      res.json({ home });
    } catch (error) {
      console.error('Failed to resolve home directory:', error);
      res.status(500).json({ error: (error && error.message) || 'Failed to resolve home directory' });
    }
  });

  // POST /api/fs/mkdir - Create directory
  app.post('/api/fs/mkdir', (req, res) => {
    try {
      const { path: dirPath } = req.body;

      if (!dirPath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      // Security check: prevent path traversal attacks
      const normalizedPath = path.normalize(dirPath);
      if (normalizedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Created directory: ${dirPath}`);

      res.json({ success: true, path: dirPath });
    } catch (error) {
      console.error('Failed to create directory:', error);
      res.status(500).json({ error: error.message || 'Failed to create directory' });
    }
  });

  // POST /api/opencode/directory - Update working directory and restart OpenCode
  app.post('/api/opencode/directory', async (req, res) => {
    try {
      const requestedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      if (!requestedPath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const resolvedPath = path.resolve(requestedPath);
      let stats;
      try {
        stats = await fsPromises.stat(resolvedPath);
      } catch (error) {
        const err = error;
        if (err && typeof err === 'object' && 'code' in err) {
          if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Directory not found' });
          }
          if (err.code === 'EACCES') {
            return res.status(403).json({ error: 'Access to directory denied' });
          }
        }
        throw error;
      }

      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified path is not a directory' });
      }

      if (openCodeWorkingDirectory === resolvedPath && openCodeProcess && openCodeProcess.exitCode === null) {
        return res.json({ success: true, restarted: false, path: resolvedPath });
      }

      openCodeWorkingDirectory = resolvedPath;

      await refreshOpenCodeAfterConfigChange('directory change');

      res.json({
        success: true,
        restarted: true,
        path: resolvedPath
      });
    } catch (error) {
      console.error('Failed to update OpenCode working directory:', error);
      res.status(500).json({ error: error.message || 'Failed to update working directory' });
    }
  });

  // GET /api/fs/list - List directory contents
  app.get('/api/fs/list', async (req, res) => {
    const rawPath = typeof req.query.path === 'string' && req.query.path.trim().length > 0
      ? req.query.path.trim()
      : os.homedir();

    try {
      const resolvedPath = path.resolve(rawPath);

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified path is not a directory' });
      }

      const dirents = await fsPromises.readdir(resolvedPath, { withFileTypes: true });
      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          const entryPath = path.join(resolvedPath, dirent.name);
          let isDirectory = dirent.isDirectory();
          const isSymbolicLink = dirent.isSymbolicLink();

          if (!isDirectory && isSymbolicLink) {
            try {
              const linkStats = await fsPromises.stat(entryPath);
              isDirectory = linkStats.isDirectory();
            } catch {
              isDirectory = false;
            }
          }

          return {
            name: dirent.name,
            path: entryPath,
            isDirectory,
            isFile: dirent.isFile(),
            isSymbolicLink
          };
        })
      );

      res.json({
        path: resolvedPath,
        entries
      });
    } catch (error) {
      console.error('Failed to list directory:', error);
      const err = error;
      if (err && typeof err === 'object' && 'code' in err) {
        const code = err.code;
        if (code === 'ENOENT') {
          return res.status(404).json({ error: 'Directory not found' });
        }
        if (code === 'EACCES') {
          return res.status(403).json({ error: 'Access to directory denied' });
        }
      }
      res.status(500).json({ error: (error && error.message) || 'Failed to list directory' });
    }
  });

  // GET /api/fs/search - Search files within a directory tree
  app.get('/api/fs/search', async (req, res) => {
    const rawRoot = typeof req.query.root === 'string' && req.query.root.trim().length > 0
      ? req.query.root.trim()
      : typeof req.query.directory === 'string' && req.query.directory.trim().length > 0
        ? req.query.directory.trim()
        : os.homedir();
    const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
    const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const parsedLimit = Number.isFinite(limitParam) ? Number(limitParam) : DEFAULT_FILE_SEARCH_LIMIT;
    const limit = Math.max(1, Math.min(parsedLimit, MAX_FILE_SEARCH_LIMIT));

    try {
      const resolvedRoot = path.resolve(rawRoot);
      const stats = await fsPromises.stat(resolvedRoot);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified root is not a directory' });
      }

      const files = await searchFilesystemFiles(resolvedRoot, { limit, query: rawQuery || '' });
      res.json({
        root: resolvedRoot,
        count: files.length,
        files
      });
    } catch (error) {
      console.error('Failed to search filesystem:', error);
      const err = error;
      if (err && typeof err === 'object' && 'code' in err) {
        const code = err.code;
        if (code === 'ENOENT') {
          return res.status(404).json({ error: 'Directory not found' });
        }
        if (code === 'EACCES') {
          return res.status(403).json({ error: 'Access to directory denied' });
        }
      }
      res.status(500).json({ error: (error && error.message) || 'Failed to search files' });
    }
  });

  // Terminal API endpoints (OpenChamber-specific)
  // Lazy load node-pty only when needed
  let ptyLib = null;
  let ptyLoadError = null;
  const getPtyLib = async () => {
    if (ptyLib) return ptyLib;
    if (ptyLoadError) throw ptyLoadError;

    try {
      ptyLib = await import('node-pty');
      console.log('node-pty loaded successfully');
      return ptyLib;
    } catch (error) {
      ptyLoadError = error;
      console.error('Failed to load node-pty:', error.message);
      console.error('Terminal functionality will not be available.');
      console.error('To fix: run "npm rebuild node-pty" or "npm install"');
      throw new Error('node-pty is not available. Run: npm rebuild node-pty');
    }
  };

  // In-memory terminal session storage
  const terminalSessions = new Map();
  const MAX_TERMINAL_SESSIONS = 20; // Limit per server instance
  const TERMINAL_IDLE_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  // Cleanup idle terminal sessions periodically
  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (now - session.lastActivity > TERMINAL_IDLE_TIMEOUT) {
        console.log(`Cleaning up idle terminal session: ${sessionId}`);
        try {
          session.ptyProcess.kill();
        } catch (error) {
          // Ignore errors during cleanup
        }
        terminalSessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000); // Check every 5 minutes

  // POST /api/terminal/create - Create new terminal session
  app.post('/api/terminal/create', async (req, res) => {
    try {
      if (terminalSessions.size >= MAX_TERMINAL_SESSIONS) {
        return res.status(429).json({ error: 'Maximum terminal sessions reached' });
      }

      const { cwd, cols, rows } = req.body;
      if (!cwd) {
        return res.status(400).json({ error: 'cwd is required' });
      }

      // Security: validate working directory exists and is accessible
      if (!fs.existsSync(cwd)) {
        return res.status(400).json({ error: 'Invalid working directory' });
      }

      const pty = await getPtyLib();
      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');

      // Generate unique session ID
      const sessionId = Math.random().toString(36).substring(2, 15) +
                        Math.random().toString(36).substring(2, 15);

      // Build augmented PATH with login shell paths for full user environment
      const envPath = buildAugmentedPath();
      const resolvedEnv = { ...process.env, PATH: envPath };

      // Spawn PTY process with proper environment
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: cols || 80,
        rows: rows || 24,
        cwd: cwd,
        env: {
          ...resolvedEnv,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      // Store session with metadata
      const session = {
        ptyProcess,
        cwd,
        lastActivity: Date.now(),
        clients: new Set(),
      };

      terminalSessions.set(sessionId, session);

      // Handle process exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`Terminal session ${sessionId} exited with code ${exitCode}, signal ${signal}`);
        terminalSessions.delete(sessionId);
      });

      console.log(`Created terminal session: ${sessionId} in ${cwd}`);
      res.json({ sessionId, cols: cols || 80, rows: rows || 24 });
    } catch (error) {
      console.error('Failed to create terminal session:', error);
      res.status(500).json({ error: error.message || 'Failed to create terminal session' });
    }
  });

  // GET /api/terminal/:sessionId/stream - SSE stream for terminal output
  app.get('/api/terminal/:sessionId/stream', (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial connection event
    res.write('data: {"type":"connected"}\n\n');

    // Track this client
    const clientId = Math.random().toString(36).substring(7);
    session.clients.add(clientId);
    session.lastActivity = Date.now();

    // SSE keepalive heartbeat to prevent proxy/browser timeout
    const heartbeatInterval = setInterval(() => {
      try {
        // Send comment line as heartbeat (ignored by EventSource)
        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error(`Heartbeat failed for client ${clientId}:`, error);
        clearInterval(heartbeatInterval);
      }
    }, 15000); // 15 seconds

    // Handle terminal data
    const dataHandler = (data) => {
      try {
        session.lastActivity = Date.now();
        const ok = res.write(`data: ${JSON.stringify({ type: 'data', data })}\n\n`);
        if (!ok && session.ptyProcess && typeof session.ptyProcess.pause === 'function') {
          session.ptyProcess.pause();
          res.once('drain', () => {
            if (session.ptyProcess && typeof session.ptyProcess.resume === 'function') {
              session.ptyProcess.resume();
            }
          });
        }
      } catch (error) {
        console.error(`Error sending data to client ${clientId}:`, error);
        cleanup();
      }
    };

    // Handle terminal exit
    const exitHandler = ({ exitCode, signal }) => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode, signal })}\n\n`);
        res.end();
      } catch (error) {
        // Client may have already disconnected
      }
      cleanup();
    };

    // Store disposables for cleanup
    const dataDisposable = session.ptyProcess.onData(dataHandler);
    const exitDisposable = session.ptyProcess.onExit(exitHandler);

    // Cleanup on client disconnect
    const cleanup = () => {
      clearInterval(heartbeatInterval);
      session.clients.delete(clientId);

      // Remove PTY event listeners to prevent memory leak
      if (dataDisposable && typeof dataDisposable.dispose === 'function') {
        dataDisposable.dispose();
      }
      if (exitDisposable && typeof exitDisposable.dispose === 'function') {
        exitDisposable.dispose();
      }

      try {
        res.end();
      } catch (error) {
        // Ignore - connection may already be closed
      }

      console.log(`Client ${clientId} disconnected from terminal session ${sessionId}`);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    console.log(`Client ${clientId} connected to terminal session ${sessionId}`);
  });

  // POST /api/terminal/:sessionId/input - Send input to terminal
  app.post('/api/terminal/:sessionId/input', express.text({ type: '*/*' }), (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }

    const data = typeof req.body === 'string' ? req.body : '';

    try {
      session.ptyProcess.write(data);
      session.lastActivity = Date.now();
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to write to terminal:', error);
      res.status(500).json({ error: error.message || 'Failed to write to terminal' });
    }
  });

  // POST /api/terminal/:sessionId/resize - Resize terminal
  app.post('/api/terminal/:sessionId/resize', (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }

    const { cols, rows } = req.body;
    if (!cols || !rows) {
      return res.status(400).json({ error: 'cols and rows are required' });
    }

    try {
      session.ptyProcess.resize(cols, rows);
      session.lastActivity = Date.now();
      res.json({ success: true, cols, rows });
    } catch (error) {
      console.error('Failed to resize terminal:', error);
      res.status(500).json({ error: error.message || 'Failed to resize terminal' });
    }
  });

  // DELETE /api/terminal/:sessionId - Close terminal session
  app.delete('/api/terminal/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }

    try {
      session.ptyProcess.kill();
      terminalSessions.delete(sessionId);
      console.log(`Closed terminal session: ${sessionId}`);
      res.json({ success: true });
    } catch (error) {
      console.error('Failed to close terminal:', error);
      res.status(500).json({ error: error.message || 'Failed to close terminal' });
    }
  });


  // Start OpenCode and setup proxy BEFORE static file serving
  try {
    if (ENV_CONFIGURED_OPENCODE_PORT) {
      console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
      setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
    } else {
      openCodePort = null;
    }

    lastOpenCodeError = null;
    openCodeProcess = await startOpenCode();
    await waitForOpenCodePort();
    try {
      await waitForOpenCodeReady();
    } catch (error) {
      console.error(`OpenCode readiness check failed: ${error.message}`);
      scheduleOpenCodeApiDetection();
    }
    setupProxy(app);
    scheduleOpenCodeApiDetection();
    startHealthMonitoring();
  } catch (error) {
    console.error(`Failed to start OpenCode: ${error.message}`);
    console.log('Continuing without OpenCode integration...');
    lastOpenCodeError = error.message;
    setupProxy(app);
    scheduleOpenCodeApiDetection();
  }

  // Static file serving (AFTER proxy setup)
  const distPath = path.join(__dirname, '..', 'dist');
  if (fs.existsSync(distPath)) {
    console.log(`Serving static files from ${distPath}`);
    app.use(express.static(distPath));

    // Fallback to index.html for client-side routing (EXCEPT /api routes and static assets)
    // Excludes: .js, .css, .svg, .png, .jpg, .jpeg, .gif, .ico, .woff, .woff2, .ttf, .eot, .map
    app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.warn(`Warning: ${distPath} not found, static files will not be served`);
    app.get(/^(?!\/api|.*\.(js|css|svg|png|jpg|jpeg|gif|ico|woff|woff2|ttf|eot|map)).*$/, (req, res) => {
      res.status(404).send('Static files not found. Please build the application first.');
    });
  }

  let activePort = port;
  // Start HTTP server
  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, () => {
      server.off('error', onError);
      const addressInfo = server.address();
      activePort = typeof addressInfo === 'object' && addressInfo ? addressInfo.port : port;
      console.log(`OpenChamber server running on port ${activePort}`);
      console.log(`Health check: http://localhost:${activePort}/health`);
      console.log(`Web interface: http://localhost:${activePort}`);
      resolve();
    });
  });

  // Handle signals
  if (attachSignals && !signalsAttached) {
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    process.on('SIGQUIT', gracefulShutdown);
    signalsAttached = true;
  }

  // Handle unhandled rejections
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    gracefulShutdown();
  });

  return {
    expressApp: app,
    httpServer: server,
    getPort: () => activePort,
    getOpenCodePort: () => openCodePort,
    isReady: () => isOpenCodeReady,
    restartOpenCode: () => restartOpenCode(),
    stop: (shutdownOptions = {}) =>
      gracefulShutdown({ exitProcess: shutdownOptions.exitProcess ?? false })
  };
}

const isCliExecution = process.argv[1] === __filename;

if (isCliExecution) {
  const cliOptions = parseArgs();
  exitOnShutdown = true;
  main({
    port: cliOptions.port,
    attachSignals: true,
    exitOnShutdown: true,
    uiPassword: cliOptions.uiPassword
  }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseArgs };
