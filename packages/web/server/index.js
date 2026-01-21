import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import http from 'http';
import { fileURLToPath } from 'url';
import os from 'os';
import crypto from 'crypto';
import { createUiAuth } from './lib/ui-auth.js';
import { startCloudflareTunnel, printTunnelWarning, checkCloudflaredAvailable } from './lib/cloudflare-tunnel.js';
import { createOpencodeServer } from '@opencode-ai/sdk/server';
import webPush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3000;
const HEALTH_CHECK_INTERVAL = 15000;
const SHUTDOWN_TIMEOUT = 10000;
const MODELS_DEV_API_URL = 'https://models.dev/api.json';
const MODELS_METADATA_CACHE_TTL = 5 * 60 * 1000;
const CLIENT_RELOAD_DELAY_MS = 800;
const OPEN_CODE_READY_GRACE_MS = 12000;
const LONG_REQUEST_TIMEOUT_MS = 4 * 60 * 1000;
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

// Lock to prevent race conditions in persistSettings
let persistSettingsLock = Promise.resolve();

const normalizeDirectoryPath = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  if (trimmed === '~') {
    return os.homedir();
  }

  if (trimmed.startsWith('~/') || trimmed.startsWith('~\\')) {
    return path.join(os.homedir(), trimmed.slice(2));
  }

  return trimmed;
};

const normalizeRelativeSearchPath = (rootPath, targetPath) => {
  const relative = path.relative(rootPath, targetPath) || path.basename(targetPath);
  return relative.split(path.sep).join('/') || targetPath;
};

const shouldSkipSearchDirectory = (name, includeHidden) => {
  if (!name) {
    return false;
  }
  if (!includeHidden && name.startsWith('.')) {
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

/**
 * Fuzzy match scoring function.
 * Returns a score > 0 if the query fuzzy-matches the candidate, null otherwise.
 * Higher scores indicate better matches.
 */
const fuzzyMatchScoreNormalized = (normalizedQuery, candidate) => {
  if (!normalizedQuery) return 0;

  const q = normalizedQuery;
  const c = candidate.toLowerCase();

  // Fast path: exact substring match gets high score
  if (c.includes(q)) {
    const idx = c.indexOf(q);
    // Bonus for match at start or after word boundary
    let bonus = 0;
    if (idx === 0) {
      bonus = 20;
    } else {
      const prev = c[idx - 1];
      if (prev === '/' || prev === '_' || prev === '-' || prev === '.' || prev === ' ') {
        bonus = 15;
      }
    }
    return 100 + bonus - Math.min(idx, 20) - Math.floor(c.length / 5);
  }

  // Fuzzy match: all query chars must appear in order
  let score = 0;
  let lastIndex = -1;
  let consecutive = 0;

  for (let i = 0; i < q.length; i++) {
    const ch = q[i];
    if (!ch || ch === ' ') continue;

    const idx = c.indexOf(ch, lastIndex + 1);
    if (idx === -1) {
      return null; // No match
    }

    const gap = idx - lastIndex - 1;
    if (gap === 0) {
      consecutive++;
    } else {
      consecutive = 0;
    }

    score += 10;
    score += Math.max(0, 18 - idx); // Prefer matches near start
    score -= Math.min(gap, 10); // Penalize gaps

    // Bonus for word boundary matches
    if (idx === 0) {
      score += 12;
    } else {
      const prev = c[idx - 1];
      if (prev === '/' || prev === '_' || prev === '-' || prev === '.' || prev === ' ') {
        score += 10;
      }
    }

    score += consecutive > 0 ? 12 : 0; // Bonus for consecutive matches
    lastIndex = idx;
  }

  // Prefer shorter paths
  score += Math.max(0, 24 - Math.floor(c.length / 3));

  return score;
};

const searchFilesystemFiles = async (rootPath, options) => {
  const { limit, query, includeHidden, respectGitignore } = options;
  const includeHiddenEntries = Boolean(includeHidden);
  const normalizedQuery = query.trim().toLowerCase();
  const matchAll = normalizedQuery.length === 0;
  const queue = [rootPath];
  const visited = new Set([rootPath]);
  const shouldRespectGitignore = respectGitignore !== false;
  // Collect more candidates for fuzzy matching, then sort and trim
  const collectLimit = matchAll ? limit : Math.max(limit * 3, 200);
  const candidates = [];

  while (queue.length > 0 && candidates.length < collectLimit) {
    const batch = queue.splice(0, FILE_SEARCH_MAX_CONCURRENCY);

    const dirResults = await Promise.all(
      batch.map(async (dir) => {
        if (!shouldRespectGitignore) {
          return { dir, dirents: await listDirectoryEntries(dir), ignoredPaths: new Set() };
        }

        try {
          const dirents = await listDirectoryEntries(dir);
          const pathsToCheck = dirents.map((dirent) => dirent.name).filter(Boolean);
          if (pathsToCheck.length === 0) {
            return { dir, dirents, ignoredPaths: new Set() };
          }

          const result = await new Promise((resolve) => {
            const child = spawn('git', ['check-ignore', '--', ...pathsToCheck], {
              cwd: dir,
              stdio: ['ignore', 'pipe', 'pipe'],
            });

            let stdout = '';
            child.stdout.on('data', (data) => { stdout += data.toString(); });
            child.on('close', () => resolve(stdout));
            child.on('error', () => resolve(''));
          });

          const ignoredNames = new Set(
            String(result)
              .split('\n')
              .map((name) => name.trim())
              .filter(Boolean)
          );

          return { dir, dirents, ignoredPaths: ignoredNames };
        } catch {
          return { dir, dirents: await listDirectoryEntries(dir), ignoredPaths: new Set() };
        }
      })
    );

    for (const { dir: currentDir, dirents, ignoredPaths } of dirResults) {
      for (const dirent of dirents) {
        const entryName = dirent.name;
        if (!entryName || (!includeHiddenEntries && entryName.startsWith('.'))) {
          continue;
        }

        if (shouldRespectGitignore && ignoredPaths.has(entryName)) {
          continue;
        }

        const entryPath = path.join(currentDir, entryName);

        if (dirent.isDirectory()) {
          if (shouldSkipSearchDirectory(entryName, includeHiddenEntries)) {
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
        const extension = entryName.includes('.') ? entryName.split('.').pop()?.toLowerCase() : undefined;

        if (matchAll) {
          candidates.push({
            name: entryName,
            path: entryPath,
            relativePath,
            extension,
            score: 0
          });
        } else {
          // Try fuzzy match against relative path (includes filename)
          const score = fuzzyMatchScoreNormalized(normalizedQuery, relativePath);
          if (score !== null) {
            candidates.push({
              name: entryName,
              path: entryPath,
              relativePath,
              extension,
              score
            });
          }
        }

        if (candidates.length >= collectLimit) {
          queue.length = 0;
          break;
        }
      }

      if (candidates.length >= collectLimit) {
        break;
      }
    }
  }

  // Sort by score descending, then by path length, then alphabetically
  if (!matchAll) {
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.relativePath.length !== b.relativePath.length) {
        return a.relativePath.length - b.relativePath.length;
      }
      return a.relativePath.localeCompare(b.relativePath);
    });
  }

  // Return top results without the score field
  return candidates.slice(0, limit).map(({ name, path: filePath, relativePath, extension }) => ({
    name,
    path: filePath,
    relativePath,
    extension
  }));
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

const extractJsonObject = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const source = value.trim();
  if (!source) {
    return null;
  }
  let start = source.indexOf('{');
  while (start !== -1) {
    let end = source.indexOf('}', start + 1);
    while (end !== -1) {
      const candidate = source.slice(start, end + 1);
      try {
        JSON.parse(candidate);
        return candidate;
      } catch {
        end = source.indexOf('}', end + 1);
      }
    }
    start = source.indexOf('{', start + 1);
  }
  return null;
};

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), '.config', 'openchamber');
const SETTINGS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'settings.json');
const PUSH_SUBSCRIPTIONS_FILE_PATH = path.join(OPENCHAMBER_DATA_DIR, 'push-subscriptions.json');

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

const PUSH_SUBSCRIPTIONS_VERSION = 1;
let persistPushSubscriptionsLock = Promise.resolve();

const readPushSubscriptionsFromDisk = async () => {
  try {
    const raw = await fsPromises.readFile(PUSH_SUBSCRIPTIONS_FILE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
    }
    if (typeof parsed.version !== 'number' || parsed.version !== PUSH_SUBSCRIPTIONS_VERSION) {
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
    }

    const subscriptionsBySession =
      parsed.subscriptionsBySession && typeof parsed.subscriptionsBySession === 'object'
        ? parsed.subscriptionsBySession
        : {};

    return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
    }
    console.warn('Failed to read push subscriptions file:', error);
    return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: {} };
  }
};

const writePushSubscriptionsToDisk = async (data) => {
  await fsPromises.mkdir(path.dirname(PUSH_SUBSCRIPTIONS_FILE_PATH), { recursive: true });
  await fsPromises.writeFile(PUSH_SUBSCRIPTIONS_FILE_PATH, JSON.stringify(data, null, 2), 'utf8');
};

const persistPushSubscriptionUpdate = async (mutate) => {
  persistPushSubscriptionsLock = persistPushSubscriptionsLock.then(async () => {
    await fsPromises.mkdir(path.dirname(PUSH_SUBSCRIPTIONS_FILE_PATH), { recursive: true });
    const current = await readPushSubscriptionsFromDisk();
    const next = mutate({
      version: PUSH_SUBSCRIPTIONS_VERSION,
      subscriptionsBySession: current.subscriptionsBySession || {},
    });
    await writePushSubscriptionsToDisk(next);
    return next;
  });

  return persistPushSubscriptionsLock;
};

const resolveDirectoryCandidate = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = normalizeDirectoryPath(trimmed);
  return path.resolve(normalized);
};

const validateDirectoryPath = async (candidate) => {
  const resolved = resolveDirectoryCandidate(candidate);
  if (!resolved) {
    return { ok: false, error: 'Directory parameter is required' };
  }
  try {
    const stats = await fsPromises.stat(resolved);
    if (!stats.isDirectory()) {
      return { ok: false, error: 'Specified path is not a directory' };
    }
    return { ok: true, directory: resolved };
  } catch (error) {
    const err = error;
    if (err && typeof err === 'object' && err.code === 'ENOENT') {
      return { ok: false, error: 'Directory not found' };
    }
    if (err && typeof err === 'object' && err.code === 'EACCES') {
      return { ok: false, error: 'Access to directory denied' };
    }
    return { ok: false, error: 'Failed to validate directory' };
  }
};

const resolveProjectDirectory = async (req) => {
  const headerDirectory = typeof req.get === 'function' ? req.get('x-opencode-directory') : null;
  const queryDirectory = Array.isArray(req.query?.directory)
    ? req.query.directory[0]
    : req.query?.directory;
  const requested = headerDirectory || queryDirectory || null;

  if (requested) {
    const validated = await validateDirectoryPath(requested);
    if (!validated.ok) {
      return { directory: null, error: validated.error };
    }
    return { directory: validated.directory, error: null };
  }

  const settings = await readSettingsFromDiskMigrated();
  const projects = sanitizeProjects(settings.projects) || [];
  if (projects.length === 0) {
    return { directory: null, error: 'Directory parameter or active project is required' };
  }

  const activeId = typeof settings.activeProjectId === 'string' ? settings.activeProjectId : '';
  const active = projects.find((project) => project.id === activeId) || projects[0];
  if (!active || !active.path) {
    return { directory: null, error: 'Directory parameter or active project is required' };
  }

  const validated = await validateDirectoryPath(active.path);
  if (!validated.ok) {
    return { directory: null, error: validated.error };
  }

  return { directory: validated.directory, error: null };
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

const sanitizeSkillCatalogs = (input) => {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const result = [];
  const seen = new Set();

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;

    const id = typeof entry.id === 'string' ? entry.id.trim() : '';
    const label = typeof entry.label === 'string' ? entry.label.trim() : '';
    const source = typeof entry.source === 'string' ? entry.source.trim() : '';
    const subpath = typeof entry.subpath === 'string' ? entry.subpath.trim() : '';
    const gitIdentityId = typeof entry.gitIdentityId === 'string' ? entry.gitIdentityId.trim() : '';

    if (!id || !label || !source) continue;
    if (seen.has(id)) continue;
    seen.add(id);

    result.push({
      id,
      label,
      source,
      ...(subpath ? { subpath } : {}),
      ...(gitIdentityId ? { gitIdentityId } : {}),
    });
  }

  return result;
};

const sanitizeProjects = (input) => {
  if (!Array.isArray(input)) {
    return undefined;
  }

  const result = [];
  const seenIds = new Set();
  const seenPaths = new Set();

  for (const entry of input) {
    if (!entry || typeof entry !== 'object') continue;

    const candidate = entry;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const rawPath = typeof candidate.path === 'string' ? candidate.path.trim() : '';
    const normalizedPath = rawPath ? path.resolve(normalizeDirectoryPath(rawPath)) : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    const addedAt = Number.isFinite(candidate.addedAt) ? Number(candidate.addedAt) : null;
    const lastOpenedAt = Number.isFinite(candidate.lastOpenedAt)
      ? Number(candidate.lastOpenedAt)
      : null;

    if (!id || !normalizedPath) continue;
    if (seenIds.has(id)) continue;
    if (seenPaths.has(normalizedPath)) continue;

    seenIds.add(id);
    seenPaths.add(normalizedPath);

    const project = {
      id,
      path: normalizedPath,
      ...(label ? { label } : {}),
      ...(Number.isFinite(addedAt) && addedAt >= 0 ? { addedAt } : {}),
      ...(Number.isFinite(lastOpenedAt) && lastOpenedAt >= 0 ? { lastOpenedAt } : {}),
    };

    // Preserve worktreeDefaults
    if (candidate.worktreeDefaults && typeof candidate.worktreeDefaults === 'object') {
      const wt = candidate.worktreeDefaults;
      const defaults = {};
      if (typeof wt.branchPrefix === 'string' && wt.branchPrefix.trim()) {
        defaults.branchPrefix = wt.branchPrefix.trim();
      }
      if (typeof wt.baseBranch === 'string' && wt.baseBranch.trim()) {
        defaults.baseBranch = wt.baseBranch.trim();
      }
      if (typeof wt.autoCreateWorktree === 'boolean') {
        defaults.autoCreateWorktree = wt.autoCreateWorktree;
      }
      if (Object.keys(defaults).length > 0) {
        project.worktreeDefaults = defaults;
      }
    }

    result.push(project);
  }

  return result;
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
  if (Array.isArray(candidate.projects)) {
    const projects = sanitizeProjects(candidate.projects);
    if (projects) {
      result.projects = projects;
    }
  }
  if (typeof candidate.activeProjectId === 'string' && candidate.activeProjectId.length > 0) {
    result.activeProjectId = candidate.activeProjectId;
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
  if (typeof candidate.autoDeleteEnabled === 'boolean') {
    result.autoDeleteEnabled = candidate.autoDeleteEnabled;
  }
  if (typeof candidate.autoDeleteAfterDays === 'number' && Number.isFinite(candidate.autoDeleteAfterDays)) {
    const normalizedDays = Math.max(1, Math.min(365, Math.round(candidate.autoDeleteAfterDays)));
    result.autoDeleteAfterDays = normalizedDays;
  }

  const typography = sanitizeTypographySizesPartial(candidate.typographySizes);
  if (typography) {
    result.typographySizes = typography;
  }

  if (typeof candidate.defaultModel === 'string') {
    const trimmed = candidate.defaultModel.trim();
    result.defaultModel = trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof candidate.defaultVariant === 'string') {
    const trimmed = candidate.defaultVariant.trim();
    result.defaultVariant = trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof candidate.defaultAgent === 'string') {
    const trimmed = candidate.defaultAgent.trim();
    result.defaultAgent = trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof candidate.defaultGitIdentityId === 'string') {
    const trimmed = candidate.defaultGitIdentityId.trim();
    result.defaultGitIdentityId = trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof candidate.queueModeEnabled === 'boolean') {
    result.queueModeEnabled = candidate.queueModeEnabled;
  }
  if (typeof candidate.autoCreateWorktree === 'boolean') {
    result.autoCreateWorktree = candidate.autoCreateWorktree;
  }
  if (typeof candidate.gitmojiEnabled === 'boolean') {
    result.gitmojiEnabled = candidate.gitmojiEnabled;
  }

  // Memory limits for message viewport management
  if (typeof candidate.memoryLimitHistorical === 'number' && Number.isFinite(candidate.memoryLimitHistorical)) {
    result.memoryLimitHistorical = Math.max(10, Math.min(500, Math.round(candidate.memoryLimitHistorical)));
  }
  if (typeof candidate.memoryLimitViewport === 'number' && Number.isFinite(candidate.memoryLimitViewport)) {
    result.memoryLimitViewport = Math.max(20, Math.min(500, Math.round(candidate.memoryLimitViewport)));
  }
  if (typeof candidate.memoryLimitActiveSession === 'number' && Number.isFinite(candidate.memoryLimitActiveSession)) {
    result.memoryLimitActiveSession = Math.max(30, Math.min(1000, Math.round(candidate.memoryLimitActiveSession)));
  }

  const skillCatalogs = sanitizeSkillCatalogs(candidate.skillCatalogs);
  if (skillCatalogs) {
    result.skillCatalogs = skillCatalogs;
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
  const projectEntries = Array.isArray(changes.projects)
    ? changes.projects
    : Array.isArray(current.projects)
      ? current.projects
      : [];
  projectEntries.forEach((project) => {
    if (project && typeof project.path === 'string' && project.path.length > 0) {
      additionalApproved.push(project.path);
    }
  });
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

const validateProjectEntries = async (projects) => {
  console.log(`[validateProjectEntries] Starting validation for ${projects.length} projects`);

  if (!Array.isArray(projects)) {
    console.warn(`[validateProjectEntries] Input is not an array, returning empty`);
    return [];
  }

  const validations = projects.map(async (project) => {
    if (!project || typeof project.path !== 'string' || project.path.length === 0) {
      console.error(`[validateProjectEntries] Invalid project entry: missing or empty path`, project);
      return null;
    }
    try {
      const stats = await fsPromises.stat(project.path);
      if (!stats.isDirectory()) {
        console.error(`[validateProjectEntries] Project path is not a directory: ${project.path}`);
        return null;
      }
      return project;
    } catch (error) {
      const err = error;
      console.error(`[validateProjectEntries] Failed to validate project "${project.path}": ${err.code || err.message || err}`);
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        console.log(`[validateProjectEntries] Removing project with ENOENT: ${project.path}`);
        return null;
      }
      console.log(`[validateProjectEntries] Keeping project despite non-ENOENT error: ${project.path}`);
      return project;
    }
  });

  const results = (await Promise.all(validations)).filter((p) => p !== null);

  console.log(`[validateProjectEntries] Validation complete: ${results.length}/${projects.length} projects valid`);
  return results;
};

const migrateSettingsFromLegacyLastDirectory = async (current) => {
  const settings = current && typeof current === 'object' ? current : {};
  const now = Date.now();

  const sanitizedProjects = sanitizeProjects(settings.projects) || [];
  let nextProjects = sanitizedProjects;
  let nextActiveProjectId =
    typeof settings.activeProjectId === 'string' ? settings.activeProjectId : undefined;

  let changed = false;

  if (nextProjects.length === 0) {
    const legacy = typeof settings.lastDirectory === 'string' ? settings.lastDirectory.trim() : '';
    const candidate = legacy ? resolveDirectoryCandidate(legacy) : null;

    if (candidate) {
      try {
        const stats = await fsPromises.stat(candidate);
        if (stats.isDirectory()) {
          const id = crypto.randomUUID();
          nextProjects = [
            {
              id,
              path: candidate,
              addedAt: now,
              lastOpenedAt: now,
            },
          ];
          nextActiveProjectId = id;
          changed = true;
        }
      } catch {
        // ignore invalid lastDirectory
      }
    }
  }

  if (nextProjects.length > 0) {
    const active = nextProjects.find((project) => project.id === nextActiveProjectId) || null;
    if (!active) {
      nextActiveProjectId = nextProjects[0].id;
      changed = true;
    }
  } else if (nextActiveProjectId) {
    nextActiveProjectId = undefined;
    changed = true;
  }

  if (!changed) {
    return { settings, changed: false };
  }

  const merged = mergePersistedSettings(settings, {
    ...settings,
    projects: nextProjects,
    ...(nextActiveProjectId ? { activeProjectId: nextActiveProjectId } : { activeProjectId: undefined }),
  });

  return { settings: merged, changed: true };
};

const readSettingsFromDiskMigrated = async () => {
  const current = await readSettingsFromDisk();
  const { settings, changed } = await migrateSettingsFromLegacyLastDirectory(current);
  if (changed) {
    await writeSettingsToDisk(settings);
  }
  return settings;
};

const getOrCreateVapidKeys = async () => {
  const settings = await readSettingsFromDiskMigrated();
  const existing = settings?.vapidKeys;
  if (existing && typeof existing.publicKey === 'string' && typeof existing.privateKey === 'string') {
    return { publicKey: existing.publicKey, privateKey: existing.privateKey };
  }

  const generated = webPush.generateVAPIDKeys();
  const next = {
    ...settings,
    vapidKeys: {
      publicKey: generated.publicKey,
      privateKey: generated.privateKey,
    },
  };

  await writeSettingsToDisk(next);
  return { publicKey: generated.publicKey, privateKey: generated.privateKey };
};

const getUiSessionTokenFromRequest = (req) => {
  const cookieHeader = req?.headers?.cookie;
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null;
  }
  const segments = cookieHeader.split(';');
  for (const segment of segments) {
    const [rawName, ...rest] = segment.split('=');
    const name = rawName?.trim();
    if (!name) continue;
    if (name !== 'oc_ui_session') continue;
    const value = rest.join('=').trim();
    try {
      return decodeURIComponent(value || '');
    } catch {
      return value || null;
    }
  }
  return null;
};

const getPushSubscriptionsForUiSession = async (uiSessionToken) => {
  if (!uiSessionToken) return [];
  const store = await readPushSubscriptionsFromDisk();
  const record = store.subscriptionsBySession?.[uiSessionToken];
  if (!Array.isArray(record)) return [];
  return record
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const endpoint = entry.endpoint;
      const p256dh = entry.p256dh;
      const auth = entry.auth;
      if (typeof endpoint !== 'string' || typeof p256dh !== 'string' || typeof auth !== 'string') {
        return null;
      }
      return {
        endpoint,
        p256dh,
        auth,
        createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : null,
      };
    })
    .filter(Boolean);
};

const addOrUpdatePushSubscription = async (uiSessionToken, subscription, userAgent) => {
  if (!uiSessionToken) {
    return;
  }

  await ensurePushInitialized();

  const now = Date.now();

  await persistPushSubscriptionUpdate((current) => {
    const subsBySession = { ...(current.subscriptionsBySession || {}) };
    const existing = Array.isArray(subsBySession[uiSessionToken]) ? subsBySession[uiSessionToken] : [];

    const filtered = existing.filter((entry) => entry && typeof entry.endpoint === 'string' && entry.endpoint !== subscription.endpoint);

    filtered.unshift({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      createdAt: now,
      lastSeenAt: now,
      userAgent: typeof userAgent === 'string' && userAgent.length > 0 ? userAgent : undefined,
    });

    subsBySession[uiSessionToken] = filtered.slice(0, 10);

    return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
  });
};

const removePushSubscription = async (uiSessionToken, endpoint) => {
  if (!uiSessionToken || !endpoint) return;

  await ensurePushInitialized();

  await persistPushSubscriptionUpdate((current) => {
    const subsBySession = { ...(current.subscriptionsBySession || {}) };
    const existing = Array.isArray(subsBySession[uiSessionToken]) ? subsBySession[uiSessionToken] : [];
    const filtered = existing.filter((entry) => entry && typeof entry.endpoint === 'string' && entry.endpoint !== endpoint);
    if (filtered.length === 0) {
      delete subsBySession[uiSessionToken];
    } else {
      subsBySession[uiSessionToken] = filtered;
    }
    return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
  });
};

const removePushSubscriptionFromAllSessions = async (endpoint) => {
  if (!endpoint) return;

  await ensurePushInitialized();

  await persistPushSubscriptionUpdate((current) => {
    const subsBySession = { ...(current.subscriptionsBySession || {}) };
    for (const [token, entries] of Object.entries(subsBySession)) {
      if (!Array.isArray(entries)) continue;
      const filtered = entries.filter((entry) => entry && typeof entry.endpoint === 'string' && entry.endpoint !== endpoint);
      if (filtered.length === 0) {
        delete subsBySession[token];
      } else {
        subsBySession[token] = filtered;
      }
    }
    return { version: PUSH_SUBSCRIPTIONS_VERSION, subscriptionsBySession: subsBySession };
  });
};

const buildSessionDeepLinkUrl = (sessionId) => {
  if (!sessionId || typeof sessionId !== 'string') {
    return '/';
  }
  return `/?session=${encodeURIComponent(sessionId)}`;
};

const sendPushToUiSession = async (uiSessionToken, payload) => {
  await ensurePushInitialized();

  const subscriptions = await getPushSubscriptionsForUiSession(uiSessionToken);
  if (subscriptions.length === 0) {
    return;
  }

  const body = JSON.stringify(payload);

  await Promise.all(subscriptions.map(async (sub) => {
    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      }
    };

    try {
      await webPush.sendNotification(pushSubscription, body);
    } catch (error) {
      const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : null;
      if (statusCode === 410 || statusCode === 404) {
        await removePushSubscriptionFromAllSessions(sub.endpoint);
        return;
      }
      console.warn('[Push] Failed to send notification:', error);
    }
  }));
};

const sendPushToAllUiSessions = async (payload, options = {}) => {
  const requireNoSse = options.requireNoSse === true;
  const store = await readPushSubscriptionsFromDisk();
  const tokens = Object.keys(store.subscriptionsBySession || {});

  await Promise.all(tokens.map(async (token) => {
    if (requireNoSse && isUiVisible(token)) {
      return;
    }
    await sendPushToUiSession(token, payload);
  }));
};

let pushInitialized = false;
const activeUiSseConnections = new Set();



const VISIBILITY_TTL_MS = 30000;
const uiVisibilityByToken = new Map();

const updateUiVisibility = (token, visible) => {
  if (!token) return;
  uiVisibilityByToken.set(token, { visible: Boolean(visible), updatedAt: Date.now() });
};

const isUiVisible = (token) => {
  const entry = uiVisibilityByToken.get(token);
  if (!entry) return false;
  if (Date.now() - entry.updatedAt > VISIBILITY_TTL_MS) return false;
  return entry.visible === true;
};

const resolveVapidSubject = async () => {
  const configured = process.env.OPENCHAMBER_VAPID_SUBJECT;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }

  const originEnv = process.env.OPENCHAMBER_PUBLIC_ORIGIN;
  if (typeof originEnv === 'string' && originEnv.trim().length > 0) {
    return originEnv.trim();
  }

  try {
    const settings = await readSettingsFromDiskMigrated();
    const stored = settings?.publicOrigin;
    if (typeof stored === 'string' && stored.trim().length > 0) {
      return stored.trim();
    }
  } catch {
    // ignore
  }

  return 'mailto:openchamber@localhost';
};

const ensurePushInitialized = async () => {
  if (pushInitialized) return;
  const keys = await getOrCreateVapidKeys();
  const subject = await resolveVapidSubject();

  if (subject === 'mailto:openchamber@localhost') {
    console.warn('[Push] No public origin configured for VAPID; set OPENCHAMBER_VAPID_SUBJECT or enable push once from a real origin.');
  }

  webPush.setVapidDetails(subject, keys.publicKey, keys.privateKey);
  pushInitialized = true;
};

const persistSettings = async (changes) => {
  // Serialize concurrent calls using lock
  persistSettingsLock = persistSettingsLock.then(async () => {
    console.log(`[persistSettings] Called with changes:`, JSON.stringify(changes, null, 2));
    const current = await readSettingsFromDisk();
    console.log(`[persistSettings] Current projects count:`, Array.isArray(current.projects) ? current.projects.length : 'N/A');
    const sanitized = sanitizeSettingsUpdate(changes);
    let next = mergePersistedSettings(current, sanitized);

    if (Array.isArray(next.projects)) {
      console.log(`[persistSettings] Validating ${next.projects.length} projects...`);
      const validated = await validateProjectEntries(next.projects);
      console.log(`[persistSettings] After validation: ${validated.length} projects remain`);
      next = { ...next, projects: validated };
    }

    if (Array.isArray(next.projects) && next.projects.length > 0) {
      const activeId = typeof next.activeProjectId === 'string' ? next.activeProjectId : '';
      const active = next.projects.find((project) => project.id === activeId) || null;
      if (!active) {
        console.log(`[persistSettings] Active project ID ${activeId} not found, switching to ${next.projects[0].id}`);
        next = { ...next, activeProjectId: next.projects[0].id };
      }
    } else if (next.activeProjectId) {
      console.log(`[persistSettings] No projects found, clearing activeProjectId ${next.activeProjectId}`);
      next = { ...next, activeProjectId: undefined };
    }

    await writeSettingsToDisk(next);
    console.log(`[persistSettings] Successfully saved ${next.projects?.length || 0} projects to disk`);
    return formatSettingsResponse(next);
  });

  return persistSettingsLock;
};

// HMR-persistent state via globalThis
// These values survive Vite HMR reloads to prevent zombie OpenCode processes
const HMR_STATE_KEY = '__openchamberHmrState';
const getHmrState = () => {
  if (!globalThis[HMR_STATE_KEY]) {
    globalThis[HMR_STATE_KEY] = {
      openCodeProcess: null,
      openCodePort: null,
      openCodeWorkingDirectory: os.homedir(),
      isShuttingDown: false,
      signalsAttached: false,
    };
  }
  return globalThis[HMR_STATE_KEY];
};
const hmrState = getHmrState();

// Non-HMR state (safe to reset on reload)
let healthCheckInterval = null;
let server = null;
let cachedModelsMetadata = null;
let cachedModelsMetadataTimestamp = 0;
let expressApp = null;
let currentRestartPromise = null;
let isRestartingOpenCode = false;
let openCodeApiPrefix = '';
let openCodeApiPrefixDetected = true;
let openCodeApiDetectionTimer = null;
let lastOpenCodeError = null;
let isOpenCodeReady = false;
let openCodeNotReadySince = 0;
let exitOnShutdown = true;
let uiAuthController = null;
let cloudflareTunnelController = null;

// Sync helper - call after modifying any HMR state variable
const syncToHmrState = () => {
  hmrState.openCodeProcess = openCodeProcess;
  hmrState.openCodePort = openCodePort;
  hmrState.isShuttingDown = isShuttingDown;
  hmrState.signalsAttached = signalsAttached;
  hmrState.openCodeWorkingDirectory = openCodeWorkingDirectory;
};

// Sync helper - call to restore state from HMR (e.g., on module reload)
const syncFromHmrState = () => {
  openCodeProcess = hmrState.openCodeProcess;
  openCodePort = hmrState.openCodePort;
  isShuttingDown = hmrState.isShuttingDown;
  signalsAttached = hmrState.signalsAttached;
  openCodeWorkingDirectory = hmrState.openCodeWorkingDirectory;
};

// Module-level variables that shadow HMR state
// These are synced to/from hmrState to survive HMR reloads
let openCodeProcess = hmrState.openCodeProcess;
let openCodePort = hmrState.openCodePort;
let isShuttingDown = hmrState.isShuttingDown;
let signalsAttached = hmrState.signalsAttached;
let openCodeWorkingDirectory = hmrState.openCodeWorkingDirectory;

/**
 * Check if an existing OpenCode process is still alive and responding
 * Used to reuse process across HMR reloads
 */
async function isOpenCodeProcessHealthy() {
  if (!openCodeProcess || !openCodePort) {
    return false;
  }

  // Health check via HTTP since SDK object doesn't expose exitCode
  try {
    const response = await fetch(`http://127.0.0.1:${openCodePort}/session`, {
      method: 'GET',
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
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

  if (ENV_CONFIGURED_API_PREFIX && ENV_CONFIGURED_API_PREFIX !== '') {
  console.warn('Ignoring configured OpenCode API prefix; API runs at root.');
}

let globalEventWatcherAbortController = null;

const startGlobalEventWatcher = async () => {
  if (globalEventWatcherAbortController) {
    return;
  }

  await waitForOpenCodePort();

  globalEventWatcherAbortController = new AbortController();
  const signal = globalEventWatcherAbortController.signal;

  let attempt = 0;

  const run = async () => {
    while (!signal.aborted) {
      attempt += 1;
      let upstream;
      try {
        const url = buildOpenCodeUrl('/global/event', '');
        upstream = await fetch(url, {
          headers: {
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
          signal,
        });

        if (!upstream.ok || !upstream.body) {
          throw new Error(`bad status ${upstream.status}`);
        }

        console.log('[PushWatcher] connected');

        const decoder = new TextDecoder();
        const reader = upstream.body.getReader();
        let buffer = '';

        while (!signal.aborted) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

          let separatorIndex;
          while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, separatorIndex);
            buffer = buffer.slice(separatorIndex + 2);
            const payload = parseSseDataPayload(block);
            void maybeSendPushForTrigger(payload);
          }
        }
      } catch (error) {
        if (signal.aborted) {
          return;
        }
        console.warn('[PushWatcher] disconnected', error?.message ?? error);
      } finally {
        try {
          upstream?.body?.cancel?.();
        } catch {
          // ignore
        }
      }

      const backoffMs = Math.min(1000 * Math.pow(2, Math.min(attempt, 5)), 30000);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  };

  void run();
};

const stopGlobalEventWatcher = () => {
  if (!globalEventWatcherAbortController) {
    return;
  }
  try {
    globalEventWatcherAbortController.abort();
  } catch {
    // ignore
  }
  globalEventWatcherAbortController = null;
};


function setOpenCodePort(port) {
  if (!Number.isFinite(port) || port <= 0) {
    return;
  }

  const numericPort = Math.trunc(port);
  const portChanged = openCodePort !== numericPort;

  if (portChanged || openCodePort === null) {
    openCodePort = numericPort;
    syncToHmrState();
    console.log(`Detected OpenCode port: ${openCodePort}`);

    if (portChanged) {
      isOpenCodeReady = false;
    }
    openCodeNotReadySince = Date.now();
  }

  lastOpenCodeError = null;
}

async function waitForOpenCodePort(timeoutMs = 15000) {
  if (openCodePort !== null) {
    return openCodePort;
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (openCodePort !== null) {
      return openCodePort;
    }
  }

  throw new Error('Timed out waiting for OpenCode port');
}

let cachedLoginShellPath = undefined;

function getLoginShellPath() {
  if (cachedLoginShellPath !== undefined) {
    return cachedLoginShellPath;
  }

  if (process.platform === 'win32') {
    cachedLoginShellPath = null;
    return null;
  }

  const shell = process.env.SHELL || '/bin/zsh';
  const shellName = path.basename(shell);

  // Nushell requires different flag syntax and PATH access
  const isNushell = shellName === 'nu' || shellName === 'nushell';
  const args = isNushell
    ? ['-l', '-i', '-c', '$env.PATH | str join (char esep)']
    : ['-lic', 'echo -n "$PATH"'];

  try {
    const result = spawnSync(shell, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status === 0 && typeof result.stdout === 'string') {
      const value = result.stdout.trim();
      if (value) {
        cachedLoginShellPath = value;
        return value;
      }
    }
  } catch (error) {
    // ignore
  }

  cachedLoginShellPath = null;
  return null;
}

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

const API_PREFIX_CANDIDATES = [''];

async function waitForReady(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url.replace(/\/+$/, '')}/config`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) return true;
    } catch {
      // ignore
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return false;
}

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

function setDetectedOpenCodeApiPrefix() {
  openCodeApiPrefix = '';
  openCodeApiPrefixDetected = true;
  if (openCodeApiDetectionTimer) {
    clearTimeout(openCodeApiDetectionTimer);
    openCodeApiDetectionTimer = null;
  }
}

function getCandidateApiPrefixes() {
  return API_PREFIX_CANDIDATES;
}

function buildOpenCodeUrl(path, prefixOverride) {
  if (!openCodePort) {
    throw new Error('OpenCode port is not available');
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const prefix = normalizeApiPrefix(prefixOverride !== undefined ? prefixOverride : '');
  const fullPath = `${prefix}${normalizedPath}`;
  return `http://localhost:${openCodePort}${fullPath}`;
}

function parseSseDataPayload(block) {
  if (!block || typeof block !== 'string') {
    return null;
  }
  const dataLines = block
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).replace(/^\s/, ''));

  if (dataLines.length === 0) {
    return null;
  }

  const payloadText = dataLines.join('\n').trim();
  if (!payloadText) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadText);
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.payload === 'object' &&
      parsed.payload !== null
    ) {
      return parsed.payload;
    }
    return parsed;
  } catch {
    return null;
  }
}

function deriveSessionActivity(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  if (payload.type === 'session.status') {
    const status = payload.properties?.status;
    const sessionId = payload.properties?.sessionID ?? payload.properties?.sessionId;
    const statusType = status?.type;

    if (typeof sessionId === 'string' && sessionId.length > 0 && typeof statusType === 'string') {
      const phase = statusType === 'busy' || statusType === 'retry' ? 'busy' : 'idle';
      return { sessionId, phase };
    }
  }

  if (payload.type === 'message.updated') {
    const info = payload.properties?.info;
    const sessionId = info?.sessionID ?? info?.sessionId ?? payload.properties?.sessionID ?? payload.properties?.sessionId;
    const role = info?.role;
    const finish = info?.finish;
    if (typeof sessionId === 'string' && sessionId.length > 0 && role === 'assistant' && finish === 'stop') {
      return { sessionId, phase: 'cooldown' };
    }
  }

  if (payload.type === 'message.part.updated') {
    const info = payload.properties?.info;
    const sessionId = info?.sessionID ?? info?.sessionId ?? payload.properties?.sessionID ?? payload.properties?.sessionId;
    const role = info?.role;
    const finish = info?.finish;
    if (typeof sessionId === 'string' && sessionId.length > 0 && role === 'assistant' && finish === 'stop') {
      return { sessionId, phase: 'cooldown' };
    }
  }

  if (payload.type === 'session.idle') {
    const sessionId = payload.properties?.sessionID ?? payload.properties?.sessionId;
    if (typeof sessionId === 'string' && sessionId.length > 0) {
      return { sessionId, phase: 'idle' };
    }
  }

  return null;
}

const PUSH_READY_COOLDOWN_MS = 5000;
const PUSH_QUESTION_DEBOUNCE_MS = 500;
const PUSH_PERMISSION_DEBOUNCE_MS = 500;
const pushQuestionDebounceTimers = new Map();
const pushPermissionDebounceTimers = new Map();
const notifiedPermissionRequests = new Set();
const lastReadyNotificationAt = new Map();

const extractSessionIdFromPayload = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  const props = payload.properties;
  const info = props?.info;
  const sessionId =
    info?.sessionID ??
    info?.sessionId ??
    props?.sessionID ??
    props?.sessionId ??
    props?.session ??
    null;
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : null;
};

const maybeSendPushForTrigger = async (payload) => {
  if (!payload || typeof payload !== 'object') {
    return;
  }

  const sessionId = extractSessionIdFromPayload(payload);

  const formatMode = (raw) => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    const normalized = value.length > 0 ? value : 'agent';
    return normalized
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
      .join(' ');
  };

  const formatModelId = (raw) => {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      return 'Assistant';
    }

    const tokens = value.split(/[-_]+/).filter(Boolean);
    const result = [];
    for (let i = 0; i < tokens.length; i += 1) {
      const current = tokens[i];
      const next = tokens[i + 1];
      if (/^\d+$/.test(current) && next && /^\d+$/.test(next)) {
        result.push(`${current}.${next}`);
        i += 1;
        continue;
      }
      result.push(current);
    }

    return result
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  };

  if (payload.type === 'message.updated') {
    const info = payload.properties?.info;
    if (info?.role === 'assistant' && info?.finish === 'stop' && sessionId) {
      const now = Date.now();
      const lastAt = lastReadyNotificationAt.get(sessionId) ?? 0;
      if (now - lastAt < PUSH_READY_COOLDOWN_MS) {
        return;
      }
      lastReadyNotificationAt.set(sessionId, now);

      const title = `${formatMode(info?.mode)} agent is ready`;
      const body = `${formatModelId(info?.modelID)} completed the task`;

      await sendPushToAllUiSessions(
        {
          title,
          body,
          tag: `ready-${sessionId}`,
          data: {
            url: buildSessionDeepLinkUrl(sessionId),
            sessionId,
            type: 'ready',
          }
        },
        { requireNoSse: true }
      );
    }

    return;
  }


  if (payload.type === 'question.asked' && sessionId) {
    const existingTimer = pushQuestionDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      pushQuestionDebounceTimers.delete(sessionId);
      void sendPushToAllUiSessions(
        {
          title: 'Input needed',
          body: 'Agent is waiting for your response',
          tag: `question-${sessionId}`,
          data: {
            url: buildSessionDeepLinkUrl(sessionId),
            sessionId,
            type: 'question',
          }
        },
        { requireNoSse: true }
      );
    }, PUSH_QUESTION_DEBOUNCE_MS);

    pushQuestionDebounceTimers.set(sessionId, timer);
    return;
  }

  if (payload.type === 'permission.asked' && sessionId) {
    const requestId = payload.properties?.id;
    const permission = payload.properties?.permission;
    const requestKey = typeof requestId === 'string' ? `${sessionId}:${requestId}` : null;
    if (requestKey && notifiedPermissionRequests.has(requestKey)) {
      return;
    }

    const existingTimer = pushPermissionDebounceTimers.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
      pushPermissionDebounceTimers.delete(sessionId);
      if (requestKey) {
        notifiedPermissionRequests.add(requestKey);
      }

      void sendPushToAllUiSessions(
        {
          title: 'Permission required',
          body: typeof permission === 'string' && permission.length > 0 ? permission : 'Agent requested permission',
          tag: `permission-${sessionId}`,
          data: {
            url: buildSessionDeepLinkUrl(sessionId),
            sessionId,
            type: 'permission',
          }
        },
        { requireNoSse: true }
      );
    }, PUSH_PERMISSION_DEBOUNCE_MS);

    pushPermissionDebounceTimers.set(sessionId, timer);
  }
};

function writeSseEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function extractApiPrefixFromUrl() {
  return '';
}

function detectOpenCodeApiPrefix() {
  openCodeApiPrefixDetected = true;
  openCodeApiPrefix = '';
  return true;
}

function ensureOpenCodeApiPrefix() {
  return detectOpenCodeApiPrefix();
}

function scheduleOpenCodeApiDetection() {
  return;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const envPassword =
    process.env.OPENCHAMBER_UI_PASSWORD ||
    process.env.OPENCODE_UI_PASSWORD ||
    null;
  const envCfTunnel = process.env.OPENCHAMBER_TRY_CF_TUNNEL === 'true';
  const options = { port: DEFAULT_PORT, uiPassword: envPassword, tryCfTunnel: envCfTunnel };

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

    if (optionName === 'try-cf-tunnel') {
      options.tryCfTunnel = true;
      continue;
    }
  }

  return options;
}

function killProcessOnPort(port) {
  if (!port) return;
  try {
    // SDK's proc.kill() only kills the Node wrapper, not the actual opencode binary.
    // Kill any process listening on our port to clean up orphaned children.
    const result = spawnSync('lsof', ['-ti', `:${port}`], { encoding: 'utf8', timeout: 5000 });
    const output = result.stdout || '';
    const myPid = process.pid;
    for (const pidStr of output.split(/\s+/)) {
      const pid = parseInt(pidStr.trim(), 10);
      if (pid && pid !== myPid) {
        try {
          spawnSync('kill', ['-9', String(pid)], { stdio: 'ignore', timeout: 2000 });
        } catch {
          // Ignore
        }
      }
    }
  } catch {
    // Ignore - process may already be dead
  }
}

async function startOpenCode() {
  const desiredPort = ENV_CONFIGURED_OPENCODE_PORT ?? 0;
  console.log(
    desiredPort > 0
      ? `Starting OpenCode on requested port ${desiredPort}...`
      : 'Starting OpenCode with dynamic port assignment...'
  );
  // Note: SDK starts in current process CWD. openCodeWorkingDirectory is tracked but not used for spawn in SDK.

  try {
    const serverInstance = await createOpencodeServer({
      hostname: '127.0.0.1',
      port: desiredPort,
      timeout: 30000,
      env: {
        ...process.env,
        // Pass minimal config to avoid pollution, but inherit PATH etc
      }
    });

    if (!serverInstance || !serverInstance.url) {
      throw new Error('OpenCode server started but URL is missing');
    }

    const url = new URL(serverInstance.url);
    const port = parseInt(url.port, 10);
    const prefix = normalizeApiPrefix(url.pathname);

    if (await waitForReady(serverInstance.url, 10000)) {
      setOpenCodePort(port);
      setDetectedOpenCodeApiPrefix(prefix); // SDK URL typically includes the prefix if any

      isOpenCodeReady = true;
      lastOpenCodeError = null;
      openCodeNotReadySince = 0;

      return serverInstance;
    } else {
      try {
        serverInstance.close();
      } catch {
        // ignore
      }
      throw new Error('Server started but health check failed (timeout)');
    }
  } catch (error) {
    lastOpenCodeError = error.message;
    openCodePort = null;
    syncToHmrState();
    console.error(`Failed to start OpenCode: ${error.message}`);
    throw error;
  }
}

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

    const portToKill = openCodePort;

    if (openCodeProcess) {
      console.log('Stopping existing OpenCode process...');
      try {
        openCodeProcess.close();
      } catch (error) {
        console.warn('Error closing OpenCode process:', error);
      }
      openCodeProcess = null;
      syncToHmrState();
    }

    killProcessOnPort(portToKill);

    // Brief delay to allow port release
    await new Promise((resolve) => setTimeout(resolve, 250));

    if (ENV_CONFIGURED_OPENCODE_PORT) {
      console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
      setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
    } else {
      openCodePort = null;
      syncToHmrState();
    }

    openCodeApiPrefixDetected = true;
    openCodeApiPrefix = '';
    if (openCodeApiDetectionTimer) {
      clearTimeout(openCodeApiDetectionTimer);
      openCodeApiDetectionTimer = null;
    }

    lastOpenCodeError = null;
    openCodeProcess = await startOpenCode();
    syncToHmrState();

    if (expressApp) {
      setupProxy(expressApp);
      // Ensure prefix is set correctly (SDK usually handles this, but just in case)
      ensureOpenCodeApiPrefix();
    }
  })();

  try {
    await currentRestartPromise;
  } catch (error) {
    console.error(`Failed to restart OpenCode: ${error.message}`);
    lastOpenCodeError = error.message;
    if (!ENV_CONFIGURED_OPENCODE_PORT) {
      openCodePort = null;
      syncToHmrState();
    }
    openCodeApiPrefixDetected = true;
    openCodeApiPrefix = '';
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
    try {
      const [configResult, agentResult] = await Promise.all([
        fetch(buildOpenCodeUrl('/config', ''), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        }).catch((error) => error),
        fetch(buildOpenCodeUrl('/agent', ''), {
          method: 'GET',
          headers: { Accept: 'application/json' }
        }).catch((error) => error)
      ]);

      if (configResult instanceof Error) {
        lastError = configResult;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      if (!configResult.ok) {
        lastError = new Error(`OpenCode config endpoint responded with status ${configResult.status}`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      await configResult.json().catch(() => null);

      if (agentResult instanceof Error) {
        lastError = agentResult;
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      if (!agentResult.ok) {
        lastError = new Error(`Agent endpoint responded with status ${agentResult.status}`);
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
        continue;
      }

      await agentResult.json().catch(() => []);

      isOpenCodeReady = true;
      lastOpenCodeError = null;
      return;
    } catch (error) {
      lastError = error;
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

    if (agentName) {
      await waitForAgentPresence(agentName);
    }

    isOpenCodeReady = true;
    openCodeNotReadySince = 0;
  } catch (error) {

    isOpenCodeReady = false;
    openCodeNotReadySince = Date.now();
    console.error(`Failed to refresh OpenCode after ${reason}:`, error.message);
    throw error;
  }
}

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
      req.path.startsWith('/push') ||
      req.path.startsWith('/config/agents') ||
      req.path.startsWith('/config/settings') ||
      req.path === '/config/reload' ||
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

  app.use('/api', (_req, _res, next) => {
    ensureOpenCodeApiPrefix();
    next();
  });

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

      return suffix;
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
        console.log(`[SSE] Setting up SSE proxy for ${req.method} ${req.path}`);
        proxyReq.setHeader('Accept', 'text/event-stream');
        proxyReq.setHeader('Cache-Control', 'no-cache');
        proxyReq.setHeader('Connection', 'keep-alive');
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      if (req.url?.includes('/event')) {
        console.log(`[SSE] Proxy response for ${req.method} ${req.url} - Status: ${proxyRes.statusCode}`);
        proxyRes.headers['Access-Control-Allow-Origin'] = '*';
        proxyRes.headers['Access-Control-Allow-Headers'] = 'Cache-Control, Accept';
        proxyRes.headers['Content-Type'] = 'text/event-stream';
        proxyRes.headers['Cache-Control'] = 'no-cache';
        proxyRes.headers['Connection'] = 'keep-alive';

        proxyRes.headers['X-Accel-Buffering'] = 'no';
        proxyRes.headers['X-Content-Type-Options'] = 'nosniff';
      }


    }
  });

  app.use('/api', proxyMiddleware);
}

function startHealthMonitoring() {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  healthCheckInterval = setInterval(async () => {
    if (!openCodeProcess || isShuttingDown || isRestartingOpenCode) return;

    try {
      const healthy = await isOpenCodeProcessHealthy();
      if (!healthy) {
        console.log('OpenCode process not running, restarting...');
        await restartOpenCode();
      }
    } catch (error) {
      console.error(`Health check error: ${error.message}`);
    }
  }, HEALTH_CHECK_INTERVAL);
}

async function gracefulShutdown(options = {}) {
  if (isShuttingDown) return;

  isShuttingDown = true;
  syncToHmrState();
  console.log('Starting graceful shutdown...');
  const exitProcess = typeof options.exitProcess === 'boolean' ? options.exitProcess : exitOnShutdown;

  stopGlobalEventWatcher();

  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
  }

  const portToKill = openCodePort;

  if (openCodeProcess) {
    console.log('Stopping OpenCode process...');
    try {
      openCodeProcess.close();
    } catch (error) {
      console.warn('Error closing OpenCode process:', error);
    }
    openCodeProcess = null;
  }

  killProcessOnPort(portToKill);

  if (server) {
    await Promise.race([
      new Promise((resolve) => {
        server.close(() => {
          console.log('HTTP server closed');
          resolve();
        });
      }),
      new Promise((resolve) => {
        setTimeout(() => {
          console.warn('Server close timeout reached, forcing shutdown');
          resolve();
        }, SHUTDOWN_TIMEOUT);
      })
    ]);
  }

  if (uiAuthController) {
    uiAuthController.dispose();
    uiAuthController = null;
  }

  if (cloudflareTunnelController) {
    console.log('Stopping Cloudflare tunnel...');
    cloudflareTunnelController.stop();
    cloudflareTunnelController = null;
  }

  console.log('Graceful shutdown complete');
  if (exitProcess) {
    process.exit(0);
  }
}

async function main(options = {}) {
  const port = Number.isFinite(options.port) && options.port >= 0 ? Math.trunc(options.port) : DEFAULT_PORT;
  const tryCfTunnel = options.tryCfTunnel === true;
  const attachSignals = options.attachSignals !== false;
  const onTunnelReady = typeof options.onTunnelReady === 'function' ? options.onTunnelReady : null;
  if (typeof options.exitOnShutdown === 'boolean') {
    exitOnShutdown = options.exitOnShutdown;
  }

  console.log(`Starting OpenChamber on port ${port === 0 ? 'auto' : port}`);

  const app = express();
  expressApp = app;
  server = http.createServer(app);

  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      openCodePort: openCodePort,
      openCodeRunning: Boolean(openCodePort && isOpenCodeReady && !isRestartingOpenCode),
      openCodeApiPrefix: '',
      openCodeApiPrefixDetected: true,
      isOpenCodeReady,
      lastOpenCodeError
    });
  });

  app.use((req, res, next) => {
    if (
      req.path.startsWith('/api/config/agents') ||
      req.path.startsWith('/api/config/commands') ||
      req.path.startsWith('/api/config/settings') ||
      req.path.startsWith('/api/config/skills') ||
      req.path.startsWith('/api/fs') ||
      req.path.startsWith('/api/git') ||
      req.path.startsWith('/api/prompts') ||
      req.path.startsWith('/api/terminal') ||
      req.path.startsWith('/api/opencode') ||
      req.path.startsWith('/api/push')
    ) {

      express.json({ limit: '50mb' })(req, res, next);
    } else if (req.path.startsWith('/api')) {

      next();
    } else {

      express.json({ limit: '50mb' })(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

  const parsePushSubscribeBody = (body) => {
    if (!body || typeof body !== 'object') return null;
    const endpoint = body.endpoint;
    const keys = body.keys;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) return null;
    if (typeof p256dh !== 'string' || p256dh.trim().length === 0) return null;
    if (typeof auth !== 'string' || auth.trim().length === 0) return null;

    return {
      endpoint: endpoint.trim(),
      keys: { p256dh: p256dh.trim(), auth: auth.trim() },
    };
  };

  const parsePushUnsubscribeBody = (body) => {
    if (!body || typeof body !== 'object') return null;
    const endpoint = body.endpoint;
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) return null;
    return { endpoint: endpoint.trim() };
  };

  app.get('/api/push/vapid-public-key', async (req, res) => {
    try {
      await ensurePushInitialized();
      const keys = await getOrCreateVapidKeys();
      res.json({ publicKey: keys.publicKey });
    } catch (error) {
      console.warn('[Push] Failed to load VAPID key:', error);
      res.status(500).json({ error: 'Failed to load push key' });
    }
  });

  app.post('/api/push/subscribe', async (req, res) => {
    await ensurePushInitialized();

    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const parsed = parsePushSubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    const { endpoint, keys } = parsed;

    const origin = typeof req.body?.origin === 'string' ? req.body.origin.trim() : '';
    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      try {
        const settings = await readSettingsFromDiskMigrated();
        if (typeof settings?.publicOrigin !== 'string' || settings.publicOrigin.trim().length === 0) {
          await writeSettingsToDisk({
            ...settings,
            publicOrigin: origin,
          });
          // allow next sends to pick it up
          pushInitialized = false;
        }
      } catch {
        // ignore
      }
    }

    await addOrUpdatePushSubscription(
      uiToken,
      {
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
      req.headers['user-agent']
    );

    res.json({ ok: true });
  });


  app.delete('/api/push/subscribe', async (req, res) => {
    await ensurePushInitialized();

    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const parsed = parsePushUnsubscribeBody(req.body);
    if (!parsed) {
      return res.status(400).json({ error: 'Invalid body' });
    }

    await removePushSubscription(uiToken, parsed.endpoint);
    res.json({ ok: true });
  });

  app.post('/api/push/visibility', (req, res) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    const visible = req.body && typeof req.body === 'object' ? req.body.visible : null;
    updateUiVisibility(uiToken, visible === true);
    res.json({ ok: true });
  });

  app.get('/api/push/visibility', (req, res) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (!uiToken) {
      return res.status(401).json({ error: 'UI session missing' });
    }

    res.json({
      ok: true,
      visible: isUiVisible(uiToken),
    });
  });

  app.get('/api/openchamber/update-check', async (_req, res) => {
    try {
      const { checkForUpdates } = await import('./lib/package-manager.js');
      const updateInfo = await checkForUpdates();
      res.json(updateInfo);
    } catch (error) {
      console.error('Failed to check for updates:', error);
      res.status(500).json({
        available: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      });
    }
  });

  app.post('/api/openchamber/update-install', async (_req, res) => {
    try {
      const { spawn: spawnChild } = await import('child_process');
      const {
        checkForUpdates,
        getUpdateCommand,
        detectPackageManager,
      } = await import('./lib/package-manager.js');

      // Verify update is available
      const updateInfo = await checkForUpdates();
      if (!updateInfo.available) {
        return res.status(400).json({ error: 'No update available' });
      }

      const pm = detectPackageManager();
      const updateCmd = getUpdateCommand(pm);

      // Get current server port for restart
      const currentPort = server.address()?.port || 3000;

      // Try to read stored instance options for restart
      const tmpDir = os.tmpdir();
      const instanceFilePath = path.join(tmpDir, `openchamber-${currentPort}.json`);
      let storedOptions = { port: currentPort, daemon: true };
      try {
        const content = await fs.promises.readFile(instanceFilePath, 'utf8');
        storedOptions = JSON.parse(content);
      } catch {
        // Use defaults
      }

      // Build restart command with stored options
      let restartCmd = `openchamber serve --port ${storedOptions.port} --daemon`;
      if (storedOptions.uiPassword) {
        // Escape password for shell
        const escapedPw = storedOptions.uiPassword.replace(/'/g, "'\\''");
        restartCmd += ` --ui-password '${escapedPw}'`;
      }

      // Respond immediately - update will happen after response
      res.json({
        success: true,
        message: 'Update starting, server will restart shortly',
        version: updateInfo.version,
        packageManager: pm,
      });

      // Give time for response to be sent
      setTimeout(() => {
        console.log(`\nInstalling update using ${pm}...`);
        console.log(`Running: ${updateCmd}`);

        // Create a script that will:
        // 1. Wait for current process to exit
        // 2. Run the update
        // 3. Restart the server with original options
        const script = `
          sleep 2
          ${updateCmd}
          if [ $? -eq 0 ]; then
            echo "Update successful, restarting OpenChamber..."
            ${restartCmd}
          else
            echo "Update failed"
            exit 1
          fi
        `;

        // Spawn detached shell to run update after we exit
        const child = spawnChild('sh', ['-c', script], {
          detached: true,
          stdio: 'ignore',
          env: process.env,
        });
        child.unref();

        console.log('Update process spawned, shutting down server...');

        // Give child process time to start, then exit
        setTimeout(() => {
          process.exit(0);
        }, 500);
      }, 500);
    } catch (error) {
      console.error('Failed to install update:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to install update',
      });
    }
  });

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

  app.get('/api/global/event', async (req, res) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (uiToken) {
      activeUiSseConnections.add(uiToken);
      const cleanupUiToken = () => {
        activeUiSseConnections.delete(uiToken);
      };
      req.on('close', cleanupUiToken);
      req.on('error', cleanupUiToken);
    }
    let targetUrl;
    try {
      targetUrl = new URL(buildOpenCodeUrl('/global/event', ''));
    } catch (error) {
      return res.status(503).json({ error: 'OpenCode service unavailable' });
    }

    const headers = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    };

    const lastEventId = req.header('Last-Event-ID');
    if (typeof lastEventId === 'string' && lastEventId.length > 0) {
      headers['Last-Event-ID'] = lastEventId;
    }

    const controller = new AbortController();
    const cleanup = () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      return res.status(502).json({ error: 'Failed to connect to OpenCode event stream' });
    }

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `OpenCode event stream unavailable (${upstream.status})` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const heartbeatInterval = setInterval(() => {
      writeSseEvent(res, { type: 'openchamber:heartbeat', timestamp: Date.now() });
    }, 15000);

    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    let buffer = '';

    const forwardBlock = (block) => {
      if (!block) return;
      res.write(`${block}

`);
      const payload = parseSseDataPayload(block);
      void maybeSendPushForTrigger(payload);
      const activity = deriveSessionActivity(payload);
      if (activity) {
        writeSseEvent(res, {
          type: 'openchamber:session-activity',
          properties: {
            sessionId: activity.sessionId,
            phase: activity.phase,
          }
        });
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          forwardBlock(block);
        }
      }

      if (buffer.trim().length > 0) {
        forwardBlock(buffer.trim());
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('SSE proxy stream error:', error);
      }
    } finally {
      clearInterval(heartbeatInterval);
      cleanup();
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  });

  app.get('/api/event', async (req, res) => {
    const uiToken = getUiSessionTokenFromRequest(req);
    if (uiToken) {
      activeUiSseConnections.add(uiToken);
      const cleanupUiToken = () => {
        activeUiSseConnections.delete(uiToken);
      };
      req.on('close', cleanupUiToken);
      req.on('error', cleanupUiToken);
    }
    let targetUrl;
    try {
      targetUrl = new URL(buildOpenCodeUrl('/event', ''));
    } catch (error) {
      return res.status(503).json({ error: 'OpenCode service unavailable' });
    }

    const headerDirectory = typeof req.get === 'function' ? req.get('x-opencode-directory') : null;
    const directoryParam = Array.isArray(req.query.directory)
      ? req.query.directory[0]
      : req.query.directory;
    const resolvedDirectory = headerDirectory || directoryParam || null;
    if (typeof resolvedDirectory === 'string' && resolvedDirectory.trim().length > 0) {
      targetUrl.searchParams.set('directory', resolvedDirectory.trim());
    }

    const headers = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    };

    const lastEventId = req.header('Last-Event-ID');
    if (typeof lastEventId === 'string' && lastEventId.length > 0) {
      headers['Last-Event-ID'] = lastEventId;
    }

    const controller = new AbortController();
    const cleanup = () => {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    let upstream;
    try {
      upstream = await fetch(targetUrl.toString(), {
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      return res.status(502).json({ error: 'Failed to connect to OpenCode event stream' });
    }

    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: `OpenCode event stream unavailable (${upstream.status})` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const heartbeatInterval = setInterval(() => {
      writeSseEvent(res, { type: 'openchamber:heartbeat', timestamp: Date.now() });
    }, 15000);

    const decoder = new TextDecoder();
    const reader = upstream.body.getReader();
    let buffer = '';

    const forwardBlock = (block) => {
      if (!block) return;
      res.write(`${block}

`);
      const payload = parseSseDataPayload(block);
      void maybeSendPushForTrigger(payload);
      const activity = deriveSessionActivity(payload);
      if (activity) {
        writeSseEvent(res, {
          type: 'openchamber:session-activity',
          properties: {
            sessionId: activity.sessionId,
            phase: activity.phase,
          }
        });
      }
    };

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        let separatorIndex;
        while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, separatorIndex);
          buffer = buffer.slice(separatorIndex + 2);
          forwardBlock(block);
        }
      }

      if (buffer.trim().length > 0) {
        forwardBlock(buffer.trim());
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        console.warn('SSE proxy stream error:', error);
      }
    } finally {
      clearInterval(heartbeatInterval);
      cleanup();
      try {
        res.end();
      } catch {
        // ignore
      }
    }
  });

  app.get('/api/config/settings', async (_req, res) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      res.json(formatSettingsResponse(settings));
    } catch (error) {
      console.error('Failed to load settings:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to load settings' });
    }
  });

  app.put('/api/config/settings', async (req, res) => {
    console.log(`[API:PUT /api/config/settings] Received request`);
    console.log(`[API:PUT /api/config/settings] Request body:`, JSON.stringify(req.body, null, 2));
    try {
      const updated = await persistSettings(req.body ?? {});
      console.log(`[API:PUT /api/config/settings] Success, returning ${updated.projects?.length || 0} projects`);
      res.json(updated);
    } catch (error) {
      console.error(`[API:PUT /api/config/settings] Failed to save settings:`, error);
      console.error(`[API:PUT /api/config/settings] Error stack:`, error.stack);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to save settings' });
    }
  });

  const {
    getAgentSources,
    getAgentScope,
    getAgentConfig,
    createAgent,
    updateAgent,
    deleteAgent,
    getCommandSources,
    getCommandScope,
    createCommand,
    updateCommand,
    deleteCommand,
    AGENT_SCOPE,
    COMMAND_SCOPE
  } = await import('./lib/opencode-config.js');

  app.get('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }
      const sources = getAgentSources(agentName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : (sources.json.exists ? sources.json.scope : null);

      res.json({
        name: agentName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get agent sources:', error);
      res.status(500).json({ error: 'Failed to get agent configuration metadata' });
    }
  });

  app.get('/api/config/agents/:name/config', async (req, res) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      const configInfo = getAgentConfig(agentName, directory);
      res.json(configInfo);
    } catch (error) {
      console.error('Failed to get agent config:', error);
      res.status(500).json({ error: 'Failed to get agent configuration' });
    }
  });

  app.post('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const { scope, ...config } = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log('[Server] Creating agent:', agentName);
      console.log('[Server] Config received:', JSON.stringify(config, null, 2));
      console.log('[Server] Scope:', scope, 'Working directory:', directory);

      createAgent(agentName, config, directory, scope);
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

  app.patch('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log(`[Server] Updating agent: ${agentName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));
      console.log('[Server] Working directory:', directory);

      updateAgent(agentName, updates, directory);
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

  app.delete('/api/config/agents/:name', async (req, res) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      deleteAgent(agentName, directory);
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

  app.get('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }
      const sources = getCommandSources(commandName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : (sources.json.exists ? sources.json.scope : null);

      res.json({
        name: commandName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists
      });
    } catch (error) {
      console.error('Failed to get command sources:', error);
      res.status(500).json({ error: 'Failed to get command configuration metadata' });
    }
  });

  app.post('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const { scope, ...config } = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log('[Server] Creating command:', commandName);
      console.log('[Server] Config received:', JSON.stringify(config, null, 2));
      console.log('[Server] Scope:', scope, 'Working directory:', directory);

      createCommand(commandName, config, directory, scope);
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

  app.patch('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log(`[Server] Updating command: ${commandName}`);
      console.log('[Server] Updates:', JSON.stringify(updates, null, 2));
      console.log('[Server] Working directory:', directory);

      updateCommand(commandName, updates, directory);
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

  app.delete('/api/config/commands/:name', async (req, res) => {
    try {
      const commandName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      deleteCommand(commandName, directory);
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

  // ============== SKILL ENDPOINTS ==============

  const {
    getSkillSources,
    discoverSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    readSkillSupportingFile,
    writeSkillSupportingFile,
    deleteSkillSupportingFile,
    SKILL_SCOPE,
    SKILL_DIR,
  } = await import('./lib/opencode-config.js');

  // List all discovered skills
  app.get('/api/config/skills', async (req, res) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }
      const skills = discoverSkills(directory);

      // Enrich with full sources info
      const enrichedSkills = skills.map(skill => {
        const sources = getSkillSources(skill.name, directory);
        return {
          ...skill,
          sources
        };
      });

      res.json({ skills: enrichedSkills });
    } catch (error) {
      console.error('Failed to list skills:', error);
      res.status(500).json({ error: 'Failed to list skills' });
    }
  });

  // ============== SKILLS CATALOG + INSTALL ENDPOINTS ==============

  const { getCuratedSkillsSources } = await import('./lib/skills-catalog/curated-sources.js');
  const { getCacheKey, getCachedScan, setCachedScan } = await import('./lib/skills-catalog/cache.js');
  const { parseSkillRepoSource } = await import('./lib/skills-catalog/source.js');
  const { scanSkillsRepository } = await import('./lib/skills-catalog/scan.js');
  const { installSkillsFromRepository } = await import('./lib/skills-catalog/install.js');
  const { scanClawdHub, installSkillsFromClawdHub, isClawdHubSource } = await import('./lib/skills-catalog/clawdhub/index.js');
  const { getProfiles, getProfile } = await import('./lib/git-identity-storage.js');

  const listGitIdentitiesForResponse = () => {
    try {
      const profiles = getProfiles();
      return profiles.map((p) => ({ id: p.id, name: p.name }));
    } catch {
      return [];
    }
  };

  const resolveGitIdentity = (profileId) => {
    if (!profileId) {
      return null;
    }
    try {
      const profile = getProfile(profileId);
      const sshKey = profile?.sshKey;
      if (typeof sshKey === 'string' && sshKey.trim()) {
        return { sshKey: sshKey.trim() };
      }
    } catch {
      // ignore
    }
    return null;
  };

  app.get('/api/config/skills/catalog', async (req, res) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }
      const refresh = String(req.query.refresh || '').toLowerCase() === 'true';

      const curatedSources = getCuratedSkillsSources();
      const settings = await readSettingsFromDisk();
      const customSourcesRaw = sanitizeSkillCatalogs(settings.skillCatalogs) || [];

      const customSources = customSourcesRaw.map((entry) => ({
        id: entry.id,
        label: entry.label,
        description: entry.source,
        source: entry.source,
        defaultSubpath: entry.subpath,
        gitIdentityId: entry.gitIdentityId,
      }));

      const sources = [...curatedSources, ...customSources];

      const discovered = discoverSkills(directory);
      const installedByName = new Map(discovered.map((s) => [s.name, s]));

      const itemsBySource = {};

      for (const src of sources) {
        // Handle ClawdHub sources separately (API-based, not git-based)
        if (src.sourceType === 'clawdhub' || isClawdHubSource(src.source)) {
          const cacheKey = 'clawdhub:registry';
          let scanResult = !refresh ? getCachedScan(cacheKey) : null;

          if (!scanResult) {
            const scanned = await scanClawdHub();
            if (!scanned.ok) {
              itemsBySource[src.id] = [];
              continue;
            }
            scanResult = scanned;
            setCachedScan(cacheKey, scanResult);
          }

          const items = (scanResult.items || []).map((item) => {
            const installed = installedByName.get(item.skillName);
            return {
              ...item,
              sourceId: src.id,
              installed: installed
                ? { isInstalled: true, scope: installed.scope }
                : { isInstalled: false },
            };
          });

          itemsBySource[src.id] = items;
          continue;
        }

        // Handle GitHub sources (git clone based)
        const parsed = parseSkillRepoSource(src.source);
        if (!parsed.ok) {
          itemsBySource[src.id] = [];
          continue;
        }

        const effectiveSubpath = src.defaultSubpath || parsed.effectiveSubpath || null;
        const cacheKey = getCacheKey({
          normalizedRepo: parsed.normalizedRepo,
          subpath: effectiveSubpath || '',
          identityId: src.gitIdentityId || '',
        });

        let scanResult = !refresh ? getCachedScan(cacheKey) : null;
        if (!scanResult) {
          const scanned = await scanSkillsRepository({
            source: src.source,
            subpath: src.defaultSubpath,
            defaultSubpath: src.defaultSubpath,
            identity: resolveGitIdentity(src.gitIdentityId),
          });

          if (!scanned.ok) {
            itemsBySource[src.id] = [];
            continue;
          }

          scanResult = scanned;
          setCachedScan(cacheKey, scanResult);
        }

        const items = (scanResult.items || []).map((item) => {
          const installed = installedByName.get(item.skillName);
          return {
            sourceId: src.id,
            ...item,
            gitIdentityId: src.gitIdentityId,
            installed: installed
              ? { isInstalled: true, scope: installed.scope }
              : { isInstalled: false },
          };
        });

        itemsBySource[src.id] = items;
      }

      const sourcesForUi = sources.map(({ gitIdentityId, ...rest }) => rest);
      res.json({ ok: true, sources: sourcesForUi, itemsBySource });
    } catch (error) {
      console.error('Failed to load skills catalog:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to load catalog' } });
    }
  });

  app.post('/api/config/skills/scan', async (req, res) => {
    try {
      const { source, subpath, gitIdentityId } = req.body || {};
      const identity = resolveGitIdentity(gitIdentityId);

      const result = await scanSkillsRepository({
        source,
        subpath,
        identity,
      });

      if (!result.ok) {
        if (result.error?.kind === 'authRequired') {
          return res.status(401).json({
            ok: false,
            error: {
              ...result.error,
              identities: listGitIdentitiesForResponse(),
            },
          });
        }

        return res.status(400).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, items: result.items });
    } catch (error) {
      console.error('Failed to scan skills repository:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to scan repository' } });
    }
  });

  app.post('/api/config/skills/install', async (req, res) => {
    try {
      const {
        source,
        subpath,
        gitIdentityId,
        scope,
        selections,
        conflictPolicy,
        conflictDecisions,
      } = req.body || {};

      let workingDirectory = null;
      if (scope === 'project') {
        const resolved = await resolveProjectDirectory(req);
        if (!resolved.directory) {
          return res.status(400).json({
            ok: false,
            error: { kind: 'invalidSource', message: resolved.error || 'Project installs require a directory parameter' },
          });
        }
        workingDirectory = resolved.directory;
      }

      // Handle ClawdHub sources (ZIP download based)
      if (isClawdHubSource(source)) {
        const result = await installSkillsFromClawdHub({
          scope,
          workingDirectory,
          userSkillDir: SKILL_DIR,
          selections,
          conflictPolicy,
          conflictDecisions,
        });

        if (!result.ok) {
          if (result.error?.kind === 'conflicts') {
            return res.status(409).json({ ok: false, error: result.error });
          }
          return res.status(400).json({ ok: false, error: result.error });
        }

        return res.json({ ok: true, installed: result.installed || [], skipped: result.skipped || [] });
      }

      // Handle GitHub sources (git clone based)
      const identity = resolveGitIdentity(gitIdentityId);

      const result = await installSkillsFromRepository({
        source,
        subpath,
        identity,
        scope,
        workingDirectory,
        userSkillDir: SKILL_DIR,
        selections,
        conflictPolicy,
        conflictDecisions,
      });

      if (!result.ok) {
        if (result.error?.kind === 'conflicts') {
          return res.status(409).json({ ok: false, error: result.error });
        }

        if (result.error?.kind === 'authRequired') {
          return res.status(401).json({
            ok: false,
            error: {
              ...result.error,
              identities: listGitIdentitiesForResponse(),
            },
          });
        }

        return res.status(400).json({ ok: false, error: result.error });
      }

      res.json({ ok: true, installed: result.installed || [], skipped: result.skipped || [] });
    } catch (error) {
      console.error('Failed to install skills:', error);
      res.status(500).json({ ok: false, error: { kind: 'unknown', message: error.message || 'Failed to install skills' } });
    }
  });

  // Get single skill sources
  app.get('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }
      const sources = getSkillSources(skillName, directory);

      res.json({
        name: skillName,
        sources: sources,
        scope: sources.md.scope,
        source: sources.md.source,
        exists: sources.md.exists
      });
    } catch (error) {
      console.error('Failed to get skill sources:', error);
      res.status(500).json({ error: 'Failed to get skill configuration metadata' });
    }
  });

  // Get skill supporting file content
  app.get('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath); // Decode URL-encoded path
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      const sources = getSkillSources(skillName, directory);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      const content = readSkillSupportingFile(sources.md.dir, filePath);
      if (content === null) {
        return res.status(404).json({ error: 'File not found' });
      }

      res.json({ path: filePath, content });
    } catch (error) {
      console.error('Failed to read skill file:', error);
      res.status(500).json({ error: 'Failed to read skill file' });
    }
  });

  // Create new skill
  app.post('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { scope, ...config } = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log('[Server] Creating skill:', skillName);
      console.log('[Server] Scope:', scope, 'Working directory:', directory);

      createSkill(skillName, config, directory, scope);
      // Skills are just files - OpenCode loads them on-demand, no restart needed

      res.json({
        success: true,
        requiresReload: false,
        message: `Skill ${skillName} created successfully`,
      });
    } catch (error) {
      console.error('Failed to create skill:', error);
      res.status(500).json({ error: error.message || 'Failed to create skill' });
    }
  });

  // Update existing skill
  app.patch('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      console.log(`[Server] Updating skill: ${skillName}`);
      console.log('[Server] Working directory:', directory);

      updateSkill(skillName, updates, directory);
      // Skills are just files - OpenCode loads them on-demand, no restart needed

      res.json({
        success: true,
        requiresReload: false,
        message: `Skill ${skillName} updated successfully`,
      });
    } catch (error) {
      console.error('[Server] Failed to update skill:', error);
      res.status(500).json({ error: error.message || 'Failed to update skill' });
    }
  });

  // Update/create supporting file
  app.put('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath); // Decode URL-encoded path
      const { content } = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      const sources = getSkillSources(skillName, directory);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      writeSkillSupportingFile(sources.md.dir, filePath, content || '');

      res.json({
        success: true,
        message: `File ${filePath} saved successfully`,
      });
    } catch (error) {
      console.error('Failed to write skill file:', error);
      res.status(500).json({ error: error.message || 'Failed to write skill file' });
    }
  });

  // Delete supporting file
  app.delete('/api/config/skills/:name/files/*filePath', async (req, res) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(req.params.filePath); // Decode URL-encoded path
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      const sources = getSkillSources(skillName, directory);
      if (!sources.md.exists || !sources.md.dir) {
        return res.status(404).json({ error: 'Skill not found' });
      }

      deleteSkillSupportingFile(sources.md.dir, filePath);

      res.json({
        success: true,
        message: `File ${filePath} deleted successfully`,
      });
    } catch (error) {
      console.error('Failed to delete skill file:', error);
      res.status(500).json({ error: error.message || 'Failed to delete skill file' });
    }
  });

  // Delete skill
  app.delete('/api/config/skills/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        return res.status(400).json({ error });
      }

      deleteSkill(skillName, directory);
      // Skills are just files - OpenCode loads them on-demand, no restart needed

      res.json({
        success: true,
        requiresReload: false,
        message: `Skill ${skillName} deleted successfully`,
      });
    } catch (error) {
      console.error('Failed to delete skill:', error);
      res.status(500).json({ error: error.message || 'Failed to delete skill' });
    }
  });

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

  let authLibrary = null;
  const getAuthLibrary = async () => {
    if (!authLibrary) {
      authLibrary = await import('./lib/opencode-auth.js');
    }
    return authLibrary;
  };

  app.delete('/api/provider/:providerId/auth', async (req, res) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        return res.status(400).json({ error: 'Provider ID is required' });
      }

      const { removeProviderAuth } = await getAuthLibrary();
      const removed = removeProviderAuth(providerId);

      await refreshOpenCodeAfterConfigChange(`provider ${providerId} disconnected`);

      res.json({
        success: true,
        removed,
        requiresReload: true,
        message: removed ? 'Provider disconnected successfully' : 'Provider was not connected',
        reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
      });
    } catch (error) {
      console.error('Failed to disconnect provider:', error);
      res.status(500).json({ error: error.message || 'Failed to disconnect provider' });
    }
  });

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

  app.get('/api/git/discover-credentials', async (req, res) => {
    try {
      const { discoverGitCredentials } = await import('./lib/git-credentials.js');
      const credentials = discoverGitCredentials();
      res.json(credentials);
    } catch (error) {
      console.error('Failed to discover git credentials:', error);
      res.status(500).json({ error: 'Failed to discover git credentials' });
    }
  });

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

  app.get('/api/git/remote-url', async (req, res) => {
    const { getRemoteUrl } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }
      const remote = req.query.remote || 'origin';

      const url = await getRemoteUrl(directory, remote);
      res.json({ url });
    } catch (error) {
      console.error('Failed to get remote url:', error);
      res.status(500).json({ error: 'Failed to get remote url' });
    }
  });

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

  app.get('/api/git/has-local-identity', async (req, res) => {
    const { hasLocalIdentity } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const hasLocal = await hasLocalIdentity(directory);
      res.json({ hasLocalIdentity: hasLocal });
    } catch (error) {
      console.error('Failed to check local git identity:', error);
      res.status(500).json({ error: 'Failed to check local git identity' });
    }
  });

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

  app.get('/api/git/file-diff', async (req, res) => {
    const { getFileDiff } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory || typeof directory !== 'string') {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const pathParam = req.query.path;
      if (!pathParam || typeof pathParam !== 'string') {
        return res.status(400).json({ error: 'path parameter is required' });
      }

      const staged = req.query.staged === 'true';

      const result = await getFileDiff(directory, {
        path: pathParam,
        staged,
      });

      res.json({
        original: result.original,
        modified: result.modified,
        path: result.path,
      });
    } catch (error) {
      console.error('Failed to get git file diff:', error);
      res.status(500).json({ error: error.message || 'Failed to get git file diff' });
    }
  });

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

      const model = 'gpt-5-nano';

      const completionTimeout = createTimeoutSignal(LONG_REQUEST_TIMEOUT_MS);
      let response;
      try {
        response = await fetch('https://opencode.ai/zen/v1/responses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            input: [{ role: 'user', content: prompt }],
            max_output_tokens: 1000,
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
      const raw = data?.output?.find((item) => item?.type === 'message')?.content?.find((item) => item?.type === 'output_text')?.text?.trim();

      if (!raw) {
        return res.status(502).json({ error: 'No commit message returned by generator' });
      }

      const cleanedJson = stripJsonMarkdownWrapper(raw);
      const extractedJson = extractJsonObject(cleanedJson) || extractJsonObject(raw);
      const candidates = [cleanedJson, extractedJson, raw].filter((candidate, index, array) => {
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


  app.put('/api/git/branches/rename', async (req, res) => {
    const { renameBranch } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { oldName, newName } = req.body;
      if (!oldName) {
        return res.status(400).json({ error: 'oldName is required' });
      }
      if (!newName) {
        return res.status(400).json({ error: 'newName is required' });
      }

      const result = await renameBranch(directory, oldName, newName);
      res.json(result);
    } catch (error) {
      console.error('Failed to rename branch:', error);
      res.status(500).json({ error: error.message || 'Failed to rename branch' });
    }
  });
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
      // Worktrees are an optional feature. Avoid repeated 500s (and repeated client retries)
      // when the directory isn't a git repo or uses shell shorthand like "~/".
      console.warn('Failed to get worktrees, returning empty list:', error?.message || error);
      res.setHeader('X-OpenChamber-Warning', 'git worktrees unavailable');
      res.json([]);
    }
  });

  app.post('/api/git/worktrees', async (req, res) => {
    const { addWorktree } = await getGitLibraries();
    try {
      const directory = req.query.directory;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }

      const { path, branch, createBranch, startPoint } = req.body;
      if (!path || !branch) {
        return res.status(400).json({ error: 'path and branch are required' });
      }

      const result = await addWorktree(directory, path, branch, { createBranch, startPoint });
      res.json(result);
    } catch (error) {
      console.error('Failed to add worktree:', error);
      res.status(500).json({ error: error.message || 'Failed to add worktree' });
    }
  });

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

  app.get('/api/git/commit-files', async (req, res) => {
    const { getCommitFiles } = await getGitLibraries();
    try {
      const { directory, hash } = req.query;
      if (!directory) {
        return res.status(400).json({ error: 'directory parameter is required' });
      }
      if (!hash) {
        return res.status(400).json({ error: 'hash parameter is required' });
      }

      const result = await getCommitFiles(directory, hash);
      res.json(result);
    } catch (error) {
      console.error('Failed to get commit files:', error);
      res.status(500).json({ error: error.message || 'Failed to get commit files' });
    }
  });

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

  app.post('/api/fs/mkdir', async (req, res) => {
    try {
      const { path: dirPath } = req.body;

      if (!dirPath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const expandedPath = normalizeDirectoryPath(dirPath);
      const normalizedPath = path.normalize(expandedPath);
      if (normalizedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      const resolvedPath = path.resolve(expandedPath);
      await fsPromises.mkdir(resolvedPath, { recursive: true });

      res.json({ success: true, path: resolvedPath });
    } catch (error) {
      console.error('Failed to create directory:', error);
      res.status(500).json({ error: error.message || 'Failed to create directory' });
    }
  });

  // Read file contents
  app.get('/api/fs/read', async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolvedPath = path.resolve(normalizeDirectoryPath(filePath));
      if (resolvedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }

      const content = await fsPromises.readFile(resolvedPath, 'utf8');
      res.type('text/plain').send(content);
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      if (err && typeof err === 'object' && err.code === 'EACCES') {
        return res.status(403).json({ error: 'Access to file denied' });
      }
      console.error('Failed to read file:', error);
      res.status(500).json({ error: (error && error.message) || 'Failed to read file' });
    }
  });

  // Read file as raw bytes (images, etc.)
  app.get('/api/fs/raw', async (req, res) => {
    const filePath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
    if (!filePath) {
      return res.status(400).json({ error: 'Path is required' });
    }

    try {
      const resolvedPath = path.resolve(normalizeDirectoryPath(filePath));
      if (resolvedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: 'Specified path is not a file' });
      }

      const ext = path.extname(resolvedPath).toLowerCase();
      const mimeMap = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.bmp': 'image/bmp',
        '.avif': 'image/avif',
      };
      const mimeType = mimeMap[ext] || 'application/octet-stream';

      const content = await fsPromises.readFile(resolvedPath);
      res.setHeader('Cache-Control', 'no-store');
      res.type(mimeType).send(content);
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      if (err && typeof err === 'object' && err.code === 'EACCES') {
        return res.status(403).json({ error: 'Access to file denied' });
      }
      console.error('Failed to read raw file:', error);
      res.status(500).json({ error: (error && error.message) || 'Failed to read file' });
    }
  });

  // Write file contents
  app.post('/api/fs/write', async (req, res) => {
    const { path: filePath, content } = req.body || {};
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Path is required' });
    }
    if (typeof content !== 'string') {
      return res.status(400).json({ error: 'Content is required' });
    }

    try {
      const resolvedPath = path.resolve(normalizeDirectoryPath(filePath));
      if (resolvedPath.includes('..')) {
        return res.status(400).json({ error: 'Invalid path: path traversal not allowed' });
      }

      // Ensure parent directory exists
      await fsPromises.mkdir(path.dirname(resolvedPath), { recursive: true });
      await fsPromises.writeFile(resolvedPath, content, 'utf8');
      res.json({ success: true, path: resolvedPath });
    } catch (error) {
      const err = error;
      if (err && typeof err === 'object' && err.code === 'EACCES') {
        return res.status(403).json({ error: 'Access denied' });
      }
      console.error('Failed to write file:', error);
      res.status(500).json({ error: (error && error.message) || 'Failed to write file' });
    }
  });

  // Execute shell commands in a directory (for worktree setup)
  // NOTE: This route supports background execution to avoid tying up browser connections.
  const execJobs = new Map();
  const EXEC_JOB_TTL_MS = 30 * 60 * 1000;
  const COMMAND_TIMEOUT_MS = (() => {
    const raw = Number(process.env.OPENCHAMBER_FS_EXEC_TIMEOUT_MS);
    if (Number.isFinite(raw) && raw > 0) return raw;
    // `bun install` (common worktree setup cmd) often takes >60s.
    return 5 * 60 * 1000;
  })();

  const pruneExecJobs = () => {
    const now = Date.now();
    for (const [jobId, job] of execJobs.entries()) {
      if (!job || typeof job !== 'object') {
        execJobs.delete(jobId);
        continue;
      }
      const updatedAt = typeof job.updatedAt === 'number' ? job.updatedAt : 0;
      if (updatedAt && now - updatedAt > EXEC_JOB_TTL_MS) {
        execJobs.delete(jobId);
      }
    }
  };

  const runCommandInDirectory = (shell, shellFlag, command, resolvedCwd) => {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const envPath = buildAugmentedPath();
      const execEnv = { ...process.env, PATH: envPath };

      const child = spawn(shell, [shellFlag, command], {
        cwd: resolvedCwd,
        env: execEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          child.kill('SIGKILL');
        } catch {
          // ignore
        }
      }, COMMAND_TIMEOUT_MS);

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        resolve({
          command,
          success: false,
          exitCode: undefined,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: (error && error.message) || 'Command execution failed',
        });
      });

      child.on('close', (code, signal) => {
        clearTimeout(timeout);
        const exitCode = typeof code === 'number' ? code : undefined;
        const base = {
          command,
          success: exitCode === 0 && !timedOut,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };

        if (timedOut) {
          resolve({
            ...base,
            success: false,
            error: `Command timed out after ${COMMAND_TIMEOUT_MS}ms` + (signal ? ` (${signal})` : ''),
          });
          return;
        }

        resolve(base);
      });
    });
  };

  const runExecJob = async (job) => {
    job.status = 'running';
    job.updatedAt = Date.now();

    const results = [];

    for (const command of job.commands) {
      if (typeof command !== 'string' || !command.trim()) {
        results.push({ command, success: false, error: 'Invalid command' });
        continue;
      }

      try {
        const result = await runCommandInDirectory(job.shell, job.shellFlag, command, job.resolvedCwd);
        results.push(result);
      } catch (error) {
        results.push({
          command,
          success: false,
          error: (error && error.message) || 'Command execution failed',
        });
      }

      job.results = results;
      job.updatedAt = Date.now();
    }

    job.results = results;
    job.success = results.every((r) => r.success);
    job.status = 'done';
    job.finishedAt = Date.now();
    job.updatedAt = Date.now();
  };

  app.post('/api/fs/exec', async (req, res) => {
    const { commands, cwd, background } = req.body || {};
    if (!Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: 'Commands array is required' });
    }
    if (!cwd || typeof cwd !== 'string') {
      return res.status(400).json({ error: 'Working directory (cwd) is required' });
    }

    pruneExecJobs();

    try {
      const resolvedCwd = path.resolve(normalizeDirectoryPath(cwd));
      const stats = await fsPromises.stat(resolvedCwd);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified cwd is not a directory' });
      }

      const shell = process.env.SHELL || (process.platform === 'win32' ? 'cmd.exe' : '/bin/sh');
      const shellFlag = process.platform === 'win32' ? '/c' : '-c';

      const jobId = crypto.randomUUID();
      const job = {
        jobId,
        status: 'queued',
        success: null,
        commands,
        resolvedCwd,
        shell,
        shellFlag,
        results: [],
        startedAt: Date.now(),
        finishedAt: null,
        updatedAt: Date.now(),
      };

      execJobs.set(jobId, job);

      const isBackground = background === true;
      if (isBackground) {
        void runExecJob(job).catch((error) => {
          job.status = 'done';
          job.success = false;
          job.results = Array.isArray(job.results) ? job.results : [];
          job.results.push({
            command: '',
            success: false,
            error: (error && error.message) || 'Command execution failed',
          });
          job.finishedAt = Date.now();
          job.updatedAt = Date.now();
        });

        return res.status(202).json({
          jobId,
          status: 'running',
        });
      }

      await runExecJob(job);
      res.json({
        jobId,
        status: job.status,
        success: job.success === true,
        results: job.results,
      });
    } catch (error) {
      console.error('Failed to execute commands:', error);
      res.status(500).json({ error: (error && error.message) || 'Failed to execute commands' });
    }
  });

  app.get('/api/fs/exec/:jobId', (req, res) => {
    const jobId = typeof req.params?.jobId === 'string' ? req.params.jobId : '';
    if (!jobId) {
      return res.status(400).json({ error: 'Job id is required' });
    }

    pruneExecJobs();

    const job = execJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    job.updatedAt = Date.now();

    return res.json({
      jobId: job.jobId,
      status: job.status,
      success: job.success === true,
      results: Array.isArray(job.results) ? job.results : [],
    });
  });

  app.post('/api/opencode/directory', async (req, res) => {
    try {
      const requestedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
      if (!requestedPath) {
        return res.status(400).json({ error: 'Path is required' });
      }

      const validated = await validateDirectoryPath(requestedPath);
      if (!validated.ok) {
        return res.status(400).json({ error: validated.error });
      }

      const resolvedPath = validated.directory;
      const currentSettings = await readSettingsFromDisk();
      const existingProjects = sanitizeProjects(currentSettings.projects) || [];
      const existing = existingProjects.find((project) => project.path === resolvedPath) || null;

      const nextProjects = existing
        ? existingProjects
        : [
            ...existingProjects,
            {
              id: crypto.randomUUID(),
              path: resolvedPath,
              addedAt: Date.now(),
              lastOpenedAt: Date.now(),
            },
          ];

      const activeProjectId = existing ? existing.id : nextProjects[nextProjects.length - 1].id;

      const updated = await persistSettings({
        projects: nextProjects,
        activeProjectId,
        lastDirectory: resolvedPath,
      });

      res.json({
        success: true,
        restarted: false,
        path: resolvedPath,
        settings: updated,
      });
    } catch (error) {
      console.error('Failed to update OpenCode working directory:', error);
      res.status(500).json({ error: error.message || 'Failed to update working directory' });
    }
  });

  app.get('/api/fs/list', async (req, res) => {
    const rawPath = typeof req.query.path === 'string' && req.query.path.trim().length > 0
      ? req.query.path.trim()
      : os.homedir();
    const respectGitignore = req.query.respectGitignore === 'true';

    try {
      const resolvedPath = path.resolve(normalizeDirectoryPath(rawPath));

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified path is not a directory' });
      }

      const dirents = await fsPromises.readdir(resolvedPath, { withFileTypes: true });

      // Get gitignored paths if requested
      let ignoredPaths = new Set();
      if (respectGitignore) {
        try {
          // Get all entry paths to check (relative to resolvedPath for git check-ignore)
          const pathsToCheck = dirents.map((d) => d.name);

          if (pathsToCheck.length > 0) {
            try {
              // Use git check-ignore with paths as arguments
              // Pass paths directly as arguments (works for reasonable directory sizes)
              const result = await new Promise((resolve) => {
                const child = spawn('git', ['check-ignore', '--', ...pathsToCheck], {
                  cwd: resolvedPath,
                  stdio: ['ignore', 'pipe', 'pipe'],
                });

                let stdout = '';
                child.stdout.on('data', (data) => { stdout += data.toString(); });
                child.on('close', () => resolve(stdout));
                child.on('error', () => resolve(''));
              });

              result.split('\n').filter(Boolean).forEach((name) => {
                const fullPath = path.join(resolvedPath, name.trim());
                ignoredPaths.add(fullPath);
              });
            } catch {
              // git check-ignore fails if not a git repo, continue without filtering
            }
          }
        } catch {
          // If git is not available, continue without gitignore filtering
        }
      }

      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          const entryPath = path.join(resolvedPath, dirent.name);

          // Skip gitignored entries
          if (respectGitignore && ignoredPaths.has(entryPath)) {
            return null;
          }

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
        entries: entries.filter(Boolean)
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

  app.get('/api/fs/search', async (req, res) => {
    const rawRoot = typeof req.query.root === 'string' && req.query.root.trim().length > 0
      ? req.query.root.trim()
      : typeof req.query.directory === 'string' && req.query.directory.trim().length > 0
        ? req.query.directory.trim()
        : os.homedir();
  const rawQuery = typeof req.query.q === 'string' ? req.query.q : '';
  const includeHidden = req.query.includeHidden === 'true';
  const respectGitignore = req.query.respectGitignore !== 'false';
  const limitParam = typeof req.query.limit === 'string' ? Number.parseInt(req.query.limit, 10) : undefined;
    const parsedLimit = Number.isFinite(limitParam) ? Number(limitParam) : DEFAULT_FILE_SEARCH_LIMIT;
    const limit = Math.max(1, Math.min(parsedLimit, MAX_FILE_SEARCH_LIMIT));

    try {
      const resolvedRoot = path.resolve(normalizeDirectoryPath(rawRoot));
      const stats = await fsPromises.stat(resolvedRoot);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: 'Specified root is not a directory' });
      }

      const files = await searchFilesystemFiles(resolvedRoot, {
        limit,
        query: rawQuery || '',
        includeHidden,
        respectGitignore,
      });
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

  let ptyProviderPromise = null;
  const getPtyProvider = async () => {
    if (ptyProviderPromise) {
      return ptyProviderPromise;
    }

    ptyProviderPromise = (async () => {
      const isBunRuntime = typeof globalThis.Bun !== 'undefined';

      if (isBunRuntime) {
        try {
          const bunPty = await import('bun-pty');
          console.log('Using bun-pty for terminal sessions');
          return { spawn: bunPty.spawn, backend: 'bun-pty' };
        } catch (error) {
          console.warn('bun-pty unavailable, falling back to node-pty');
        }
      }

      try {
        const nodePty = await import('node-pty');
        console.log('Using node-pty for terminal sessions');
        return { spawn: nodePty.spawn, backend: 'node-pty' };
      } catch (error) {
        console.error('Failed to load node-pty:', error && error.message ? error.message : error);
        if (isBunRuntime) {
          throw new Error('No PTY backend available. Install bun-pty or node-pty.');
        }
        throw new Error('node-pty is not available. Run: npm rebuild node-pty (or install Bun for bun-pty)');
      }
    })();

    return ptyProviderPromise;
  };

  const terminalSessions = new Map();
  const MAX_TERMINAL_SESSIONS = 20;
  const TERMINAL_IDLE_TIMEOUT = 30 * 60 * 1000;

  setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of terminalSessions.entries()) {
      if (now - session.lastActivity > TERMINAL_IDLE_TIMEOUT) {
        console.log(`Cleaning up idle terminal session: ${sessionId}`);
        try {
          session.ptyProcess.kill();
        } catch (error) {

        }
        terminalSessions.delete(sessionId);
      }
    }
  }, 5 * 60 * 1000);

  app.post('/api/terminal/create', async (req, res) => {
    try {
      if (terminalSessions.size >= MAX_TERMINAL_SESSIONS) {
        return res.status(429).json({ error: 'Maximum terminal sessions reached' });
      }

      const { cwd, cols, rows } = req.body;
      if (!cwd) {
        return res.status(400).json({ error: 'cwd is required' });
      }

      try {
        await fs.promises.access(cwd);
      } catch {
        return res.status(400).json({ error: 'Invalid working directory' });
      }

      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');

      const sessionId = Math.random().toString(36).substring(2, 15) +
                        Math.random().toString(36).substring(2, 15);

      const envPath = buildAugmentedPath();
      const resolvedEnv = { ...process.env, PATH: envPath };

      const pty = await getPtyProvider();
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

      const session = {
        ptyProcess,
        ptyBackend: pty.backend,
        cwd,
        lastActivity: Date.now(),
        clients: new Set(),
      };

      terminalSessions.set(sessionId, session);

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

  app.get('/api/terminal/:sessionId/stream', (req, res) => {
    const { sessionId } = req.params;
    const session = terminalSessions.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Terminal session not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const clientId = Math.random().toString(36).substring(7);
    session.clients.add(clientId);
    session.lastActivity = Date.now();

    const runtime = typeof globalThis.Bun === 'undefined' ? 'node' : 'bun';
    const ptyBackend = session.ptyBackend || 'unknown';
    res.write(`data: ${JSON.stringify({ type: 'connected', runtime, ptyBackend })}\n\n`);

    const heartbeatInterval = setInterval(() => {
      try {

        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error(`Heartbeat failed for client ${clientId}:`, error);
        clearInterval(heartbeatInterval);
      }
    }, 15000);

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

    const exitHandler = ({ exitCode, signal }) => {
      try {
        res.write(`data: ${JSON.stringify({ type: 'exit', exitCode, signal })}\n\n`);
        res.end();
      } catch (error) {

      }
      cleanup();
    };

    const dataDisposable = session.ptyProcess.onData(dataHandler);
    const exitDisposable = session.ptyProcess.onExit(exitHandler);

    const cleanup = () => {
      clearInterval(heartbeatInterval);
      session.clients.delete(clientId);

      if (dataDisposable && typeof dataDisposable.dispose === 'function') {
        dataDisposable.dispose();
      }
      if (exitDisposable && typeof exitDisposable.dispose === 'function') {
        exitDisposable.dispose();
      }

      try {
        res.end();
      } catch (error) {

      }

      console.log(`Client ${clientId} disconnected from terminal session ${sessionId}`);
    };

    req.on('close', cleanup);
    req.on('error', cleanup);

    console.log(`Terminal connected: session=${sessionId} client=${clientId} runtime=${runtime} pty=${ptyBackend}`);
  });

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

  app.post('/api/terminal/:sessionId/restart', async (req, res) => {
    const { sessionId } = req.params;
    const { cwd, cols, rows } = req.body;

    if (!cwd) {
      return res.status(400).json({ error: 'cwd is required' });
    }

    const existingSession = terminalSessions.get(sessionId);
    if (existingSession) {
      try {
        existingSession.ptyProcess.kill();
      } catch (error) {
      }
      terminalSessions.delete(sessionId);
    }

    try {
      try {
        const stats = await fs.promises.stat(cwd);
        if (!stats.isDirectory()) {
          return res.status(400).json({ error: 'Invalid working directory: not a directory' });
        }
      } catch (error) {
        return res.status(400).json({ error: 'Invalid working directory: not accessible' });
      }

      const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh');

      const newSessionId = Math.random().toString(36).substring(2, 15) +
                          Math.random().toString(36).substring(2, 15);

      const envPath = buildAugmentedPath();
      const resolvedEnv = { ...process.env, PATH: envPath };

      const pty = await getPtyProvider();
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

      const session = {
        ptyProcess,
        ptyBackend: pty.backend,
        cwd,
        lastActivity: Date.now(),
        clients: new Set(),
      };

      terminalSessions.set(newSessionId, session);

      ptyProcess.onExit(({ exitCode, signal }) => {
        console.log(`Terminal session ${newSessionId} exited with code ${exitCode}, signal ${signal}`);
        terminalSessions.delete(newSessionId);
      });

      console.log(`Restarted terminal session: ${sessionId} -> ${newSessionId} in ${cwd}`);
      res.json({ sessionId: newSessionId, cols: cols || 80, rows: rows || 24 });
    } catch (error) {
      console.error('Failed to restart terminal session:', error);
      res.status(500).json({ error: error.message || 'Failed to restart terminal session' });
    }
  });

  app.post('/api/terminal/force-kill', (req, res) => {
    const { sessionId, cwd } = req.body;
    let killedCount = 0;

    if (sessionId) {
      const session = terminalSessions.get(sessionId);
      if (session) {
        try {
          session.ptyProcess.kill();
        } catch (error) {
        }
        terminalSessions.delete(sessionId);
        killedCount++;
      }
    } else if (cwd) {
      for (const [id, session] of terminalSessions) {
        if (session.cwd === cwd) {
          try {
            session.ptyProcess.kill();
          } catch (error) {
          }
          terminalSessions.delete(id);
          killedCount++;
        }
      }
    } else {
      for (const [id, session] of terminalSessions) {
        try {
          session.ptyProcess.kill();
        } catch (error) {
        }
        terminalSessions.delete(id);
        killedCount++;
      }
    }

    console.log(`Force killed ${killedCount} terminal session(s)`);
    res.json({ success: true, killedCount });
  });


  try {
    // Check if we can reuse an existing OpenCode process from a previous HMR cycle
    syncFromHmrState();
    if (await isOpenCodeProcessHealthy()) {
      console.log(`[HMR] Reusing existing OpenCode process on port ${openCodePort}`);
    } else {
      // No healthy process, start fresh
      if (ENV_CONFIGURED_OPENCODE_PORT) {
        console.log(`Using OpenCode port from environment: ${ENV_CONFIGURED_OPENCODE_PORT}`);
        setOpenCodePort(ENV_CONFIGURED_OPENCODE_PORT);
      } else {
        openCodePort = null;
        syncToHmrState();
      }

      lastOpenCodeError = null;
      openCodeProcess = await startOpenCode();
      syncToHmrState();
    }
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
    void startGlobalEventWatcher();
  } catch (error) {
    console.error(`Failed to start OpenCode: ${error.message}`);
    console.log('Continuing without OpenCode integration...');
    lastOpenCodeError = error.message;
    setupProxy(app);
    scheduleOpenCodeApiDetection();
  }

  const distPath = path.join(__dirname, '..', 'dist');
    if (fs.existsSync(distPath)) {
      console.log(`Serving static files from ${distPath}`);
      app.use(express.static(distPath, {
        setHeaders(res, filePath) {
          // Service workers should never be long-cached; iOS is especially sensitive.
          if (typeof filePath === 'string' && filePath.endsWith(`${path.sep}sw.js`)) {
            res.setHeader('Cache-Control', 'no-store');
          }
        },
      }));

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

  await new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('error', onError);
      reject(error);
    };
    server.once('error', onError);
    server.listen(port, async () => {
      server.off('error', onError);
      const addressInfo = server.address();
      activePort = typeof addressInfo === 'object' && addressInfo ? addressInfo.port : port;

      try {
        process.send?.({ type: 'openchamber:ready', port: activePort });
      } catch {
        // ignore
      }

      console.log(`OpenChamber server running on port ${activePort}`);
      console.log(`Health check: http://localhost:${activePort}/health`);
      console.log(`Web interface: http://localhost:${activePort}`);

      if (tryCfTunnel) {
        console.log('\nInitializing Cloudflare Quick Tunnel...');
        const cfCheck = await checkCloudflaredAvailable();
        if (cfCheck.available) {
          try {
            const originUrl = `http://localhost:${activePort}`;
            cloudflareTunnelController = await startCloudflareTunnel({ originUrl, port: activePort });
            printTunnelWarning();
            if (onTunnelReady) {
              const tunnelUrl = cloudflareTunnelController.getPublicUrl();
              if (tunnelUrl) {
                onTunnelReady(tunnelUrl);
              }
            }
          } catch (error) {
            console.error(`Failed to start Cloudflare tunnel: ${error.message}`);
            console.log('Continuing without tunnel...');
          }
        }
      }

      resolve();
    });
  });

  if (attachSignals && !signalsAttached) {
    const handleSignal = async () => {
      await gracefulShutdown();
    };
    process.on('SIGTERM', handleSignal);
    process.on('SIGINT', handleSignal);
    process.on('SIGQUIT', handleSignal);
    signalsAttached = true;
    syncToHmrState();
  }

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
    getTunnelUrl: () => cloudflareTunnelController?.getPublicUrl() ?? null,
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
    tryCfTunnel: cliOptions.tryCfTunnel,
    attachSignals: true,
    exitOnShutdown: true,
    uiPassword: cliOptions.uiPassword
  }).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}

export { gracefulShutdown, setupProxy, restartOpenCode, main as startWebUiServer, parseArgs };
