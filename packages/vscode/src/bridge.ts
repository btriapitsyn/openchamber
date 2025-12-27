import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { OpenCodeManager } from './opencode';
import { createAgent, createCommand, deleteAgent, deleteCommand, getAgentSources, getCommandSources, updateAgent, updateCommand } from './opencodeConfig';
import { removeProviderAuth } from './opencodeAuth';

export interface BridgeRequest {
  id: string;
  type: string;
  payload?: unknown;
}

export interface BridgeResponse {
  id: string;
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

type ApiProxyRequestPayload = {
  method?: string;
  path?: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
};

type ApiProxyResponsePayload = {
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
};

interface FileEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface FileSearchResult {
  path: string;
  score?: number;
}

export interface BridgeContext {
  manager?: OpenCodeManager;
  context?: vscode.ExtensionContext;
}

const SETTINGS_KEY = 'openchamber.settings';
const CLIENT_RELOAD_DELAY_MS = 800;

const readSettings = (ctx?: BridgeContext) => {
  const stored = ctx?.context?.globalState.get<Record<string, unknown>>(SETTINGS_KEY) || {};
  const restStored = { ...stored };
  delete (restStored as Record<string, unknown>).lastDirectory;
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const themeVariant =
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ||
    vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.HighContrastLight
      ? 'light'
      : 'dark';

  return {
    themeVariant,
    lastDirectory: workspaceFolder,
    ...restStored,
  };
};

const persistSettings = async (changes: Record<string, unknown>, ctx?: BridgeContext) => {
  const current = readSettings(ctx);
  const restChanges = { ...(changes || {}) };
  delete restChanges.lastDirectory;
  const merged = { ...current, ...restChanges, lastDirectory: current.lastDirectory };
  await ctx?.context?.globalState.update(SETTINGS_KEY, merged);
  return merged;
};

const normalizeFsPath = (value: string) => value.replace(/\\/g, '/');

const expandTildePath = (value: string) => {
  const trimmed = (value || '').trim();
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

const resolveUserPath = (value: string, baseDirectory: string) => {
  const expanded = expandTildePath(value);
  if (!expanded) {
    return expanded;
  }
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(baseDirectory, expanded);
};

const listDirectoryEntries = async (dirPath: string) => {
  const uri = vscode.Uri.file(dirPath);
  const entries = await vscode.workspace.fs.readDirectory(uri);
  return entries.map(([name, fileType]) => ({
    name,
    path: normalizeFsPath(vscode.Uri.joinPath(uri, name).fsPath),
    isDirectory: fileType === vscode.FileType.Directory,
  }));
};

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
  'logs',
]);

const shouldSkipSearchDirectory = (name: string) => {
  if (!name) {
    return false;
  }
  if (name.startsWith('.')) {
    return true;
  }
  return FILE_SEARCH_EXCLUDED_DIRS.has(name.toLowerCase());
};

/**
 * Fuzzy match scoring function.
 * Returns a score > 0 if the query fuzzy-matches the candidate, null otherwise.
 * Higher scores indicate better matches.
 */
const fuzzyMatchScore = (query: string, candidate: string): number | null => {
  if (!query) return 0;

  const q = query.toLowerCase();
  const c = candidate.toLowerCase();

  // Fast path: exact substring match gets high score
  if (c.includes(q)) {
    const idx = c.indexOf(q);
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

const searchFilesystemFiles = async (rootPath: string, query: string, limit: number) => {
  const normalizedQuery = (query || '').trim().toLowerCase();
  const matchAll = normalizedQuery.length === 0;

  const rootUri = vscode.Uri.file(rootPath);
  const queue: vscode.Uri[] = [rootUri];
  const visited = new Set<string>([normalizeFsPath(rootUri.fsPath)]);
  // Collect more candidates for fuzzy matching, then sort and trim
  const collectLimit = matchAll ? limit : Math.max(limit * 3, 200);
  const candidates: Array<{ name: string; path: string; relativePath: string; extension?: string; score: number }> = [];
  const MAX_CONCURRENCY = 5;

  while (queue.length > 0 && candidates.length < collectLimit) {
    const batch = queue.splice(0, MAX_CONCURRENCY);
    const dirLists = await Promise.all(
      batch.map((dir) => Promise.resolve(vscode.workspace.fs.readDirectory(dir)).catch(() => [] as [string, vscode.FileType][]))
    );

    for (let index = 0; index < batch.length; index += 1) {
      const currentDir = batch[index];
      const dirents = dirLists[index];

      for (const [entryName, entryType] of dirents) {
        if (!entryName || entryName.startsWith('.')) {
          continue;
        }

        const entryUri = vscode.Uri.joinPath(currentDir, entryName);
        const absolute = normalizeFsPath(entryUri.fsPath);

        if (entryType === vscode.FileType.Directory) {
          if (shouldSkipSearchDirectory(entryName)) {
            continue;
          }
          if (!visited.has(absolute)) {
            visited.add(absolute);
            queue.push(entryUri);
          }
          continue;
        }

        if (entryType !== vscode.FileType.File) {
          continue;
        }

        const relativePath = normalizeFsPath(path.relative(rootPath, absolute) || path.basename(absolute));
        const extension = entryName.includes('.') ? entryName.split('.').pop()?.toLowerCase() : undefined;

        if (matchAll) {
          candidates.push({
            name: entryName,
            path: absolute,
            relativePath,
            extension,
            score: 0,
          });
        } else {
          // Try fuzzy match against relative path (includes filename)
          const score = fuzzyMatchScore(normalizedQuery, relativePath);
          if (score !== null) {
            candidates.push({
              name: entryName,
              path: absolute,
              relativePath,
              extension,
              score,
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
    extension,
  }));
};

const searchDirectory = async (directory: string, query: string, limit = 60) => {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
  const rootPath = directory
    ? resolveUserPath(directory, workspaceRoot)
    : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  if (!rootPath) return [];

  const sanitizedQuery = query?.trim() || '';
  if (!sanitizedQuery) {
    return searchFilesystemFiles(rootPath, '', limit);
  }

  // Fast-path via VS Code's file index (may be case-sensitive depending on platform/workspace).
  try {
    const pattern = `**/*${sanitizedQuery}*`;
    const exclude = '**/{node_modules,.git,dist,build,.next,.turbo,.cache,coverage,tmp,logs}/**';
    const results = await vscode.workspace.findFiles(
      new vscode.RelativePattern(vscode.Uri.file(rootPath), pattern),
      exclude,
      limit,
    );

    if (Array.isArray(results) && results.length > 0) {
      return results.map((file) => {
        const absolute = normalizeFsPath(file.fsPath);
        const relative = normalizeFsPath(path.relative(rootPath, absolute));
        const name = path.basename(absolute);
        return {
          name,
          path: absolute,
          relativePath: relative || name,
          extension: name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined,
        };
      });
    }
  } catch {
    // Fall through to filesystem traversal.
  }

  // Fallback: deterministic, case-insensitive traversal with early-exit at limit.
  return searchFilesystemFiles(rootPath, sanitizedQuery, limit);
};

const fetchModelsMetadata = async () => {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined;
  const timeout = controller ? setTimeout(() => controller.abort(), 8000) : undefined;
  try {
    const response = await fetch('https://models.dev/api.json', {
      signal: controller?.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`models.dev responded with ${response.status}`);
    }
    return await response.json();
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
};

const base64EncodeUtf8 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

const collectHeaders = (headers: Headers): Record<string, string> => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
};

export async function handleBridgeMessage(message: BridgeRequest, ctx?: BridgeContext): Promise<BridgeResponse> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case 'api:proxy': {
        const apiUrl = ctx?.manager?.getApiUrl();
        if (!apiUrl) {
          const body = JSON.stringify({ error: 'OpenCode API unavailable' });
          const data: ApiProxyResponsePayload = {
            status: 503,
            headers: { 'content-type': 'application/json' },
            bodyBase64: base64EncodeUtf8(body),
          };
          return { id, type, success: true, data };
        }

        const { method, path: requestPath, headers, bodyBase64 } = (payload || {}) as ApiProxyRequestPayload;
        const normalizedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';
        const normalizedPath =
          typeof requestPath === 'string' && requestPath.trim().length > 0
            ? requestPath.trim().startsWith('/')
              ? requestPath.trim()
              : `/${requestPath.trim()}`
            : '/';

        const base = `${apiUrl.replace(/\/+$/, '')}/`;
        const targetUrl = new URL(normalizedPath.replace(/^\/+/, ''), base).toString();
        const requestHeaders: Record<string, string> = { ...(headers || {}) };

        // Ensure SSE requests are negotiated correctly.
        if (normalizedPath === '/event' || normalizedPath === '/global/event') {
          if (!requestHeaders.Accept) {
            requestHeaders.Accept = 'text/event-stream';
          }
          requestHeaders['Cache-Control'] = requestHeaders['Cache-Control'] || 'no-cache';
          requestHeaders.Connection = requestHeaders.Connection || 'keep-alive';
        }

        try {
          const response = await fetch(targetUrl, {
            method: normalizedMethod,
            headers: requestHeaders,
            body:
              typeof bodyBase64 === 'string' && bodyBase64.length > 0 && normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD'
                ? Buffer.from(bodyBase64, 'base64')
                : undefined,
          });

          const arrayBuffer = await response.arrayBuffer();
          const data: ApiProxyResponsePayload = {
            status: response.status,
            headers: collectHeaders(response.headers),
            bodyBase64: Buffer.from(arrayBuffer).toString('base64'),
          };

          return { id, type, success: true, data };
        } catch (error) {
          const body = JSON.stringify({
            error: error instanceof Error ? error.message : 'Failed to reach OpenCode API',
          });
          const data: ApiProxyResponsePayload = {
            status: 502,
            headers: { 'content-type': 'application/json' },
            bodyBase64: base64EncodeUtf8(body),
          };
          return { id, type, success: true, data };
        }
      }

      case 'files:list': {
        const { path: dirPath } = payload as { path: string };
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        const resolvedPath = resolveUserPath(dirPath, workspaceRoot);
        const uri = vscode.Uri.file(resolvedPath);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const result: FileEntry[] = entries.map(([name, fileType]) => ({
          name,
          path: vscode.Uri.joinPath(uri, name).fsPath,
          isDirectory: fileType === vscode.FileType.Directory,
        }));
        return { id, type, success: true, data: { directory: normalizeFsPath(resolvedPath), entries: result } };
      }

      case 'files:search': {
        const { query, maxResults = 50 } = payload as { query: string; maxResults?: number };
        const pattern = `**/*${query}*`;
        const files = await vscode.workspace.findFiles(pattern, '**/node_modules/**', maxResults);
        const results: FileSearchResult[] = files.map((file) => ({
          path: file.fsPath,
        }));
        return { id, type, success: true, data: results };
      }

      case 'workspace:folder': {
        const folder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
        return { id, type, success: true, data: { folder } };
      }

      case 'config:get': {
        const { key } = payload as { key: string };
        const config = vscode.workspace.getConfiguration('openchamber');
        const value = config.get(key);
        return { id, type, success: true, data: { value } };
      }

      case 'api:fs:list': {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        const target = (payload as { path?: string })?.path || workspaceRoot;
        const resolvedPath = resolveUserPath(target, workspaceRoot) || workspaceRoot;
        const entries = await listDirectoryEntries(resolvedPath);
        const normalized = normalizeFsPath(resolvedPath);
        return { id, type, success: true, data: { entries, directory: normalized, path: normalized } };
      }

      case 'api:fs:search': {
        const { directory = '', query = '', limit } = (payload || {}) as { directory?: string; query?: string; limit?: number };
        const files = await searchDirectory(directory, query, limit);
        return { id, type, success: true, data: { files } };
      }

      case 'api:fs:mkdir': {
        const target = (payload as { path: string })?.path;
        if (!target) {
          return { id, type, success: false, error: 'Path is required' };
        }
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        const resolvedPath = resolveUserPath(target, workspaceRoot);
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(resolvedPath));
        return { id, type, success: true, data: { success: true, path: normalizeFsPath(resolvedPath) } };
      }

      case 'api:fs/home': {
        const workspaceHome = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const home = workspaceHome || os.homedir();
        return { id, type, success: true, data: { home: normalizeFsPath(home) } };
      }

      case 'api:files/pick': {
        const MAX_SIZE = 10 * 1024 * 1024;
        const allowMany = (payload as { allowMany?: boolean })?.allowMany !== false;
        const defaultUri = vscode.workspace.workspaceFolders?.[0]?.uri;

        const picks = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: allowMany,
          defaultUri,
          openLabel: 'Attach',
        });

        if (!picks || picks.length === 0) {
          return { id, type, success: true, data: { files: [], skipped: [] } };
        }

        const files: Array<{ name: string; mimeType: string; size: number; dataUrl: string }> = [];
        const skipped: Array<{ name: string; reason: string }> = [];

        const guessMime = (ext: string) => {
          switch (ext) {
            case '.png':
            case '.jpg':
            case '.jpeg':
            case '.gif':
            case '.bmp':
            case '.webp':
              return `image/${ext.replace('.', '')}`;
            case '.pdf':
              return 'application/pdf';
            case '.txt':
            case '.log':
              return 'text/plain';
            case '.json':
              return 'application/json';
            case '.md':
            case '.markdown':
              return 'text/markdown';
            default:
              return 'application/octet-stream';
          }
        };

        for (const uri of picks) {
          try {
            const stat = await vscode.workspace.fs.stat(uri);
            const size = stat.size ?? 0;
            const name = path.basename(uri.fsPath);

            if (size > MAX_SIZE) {
              skipped.push({ name, reason: 'File exceeds 10MB limit' });
              continue;
            }

            const bytes = await vscode.workspace.fs.readFile(uri);
            const ext = path.extname(name).toLowerCase();
            const mimeType = guessMime(ext);
            const base64 = Buffer.from(bytes).toString('base64');
            const dataUrl = `data:${mimeType};base64,${base64}`;
            files.push({ name, mimeType, size, dataUrl });
          } catch (error) {
            const name = path.basename(uri.fsPath);
            skipped.push({ name, reason: error instanceof Error ? error.message : 'Failed to read file' });
          }
        }

        return { id, type, success: true, data: { files, skipped } };
      }

      case 'api:config/settings:get': {
        const settings = readSettings(ctx);
        return { id, type, success: true, data: settings };
      }

      case 'api:config/settings:save': {
        const changes = (payload as Record<string, unknown>) || {};
        const updated = await persistSettings(changes, ctx);
        return { id, type, success: true, data: updated };
      }

      case 'api:config/reload': {
        await ctx?.manager?.restart();
        return { id, type, success: true, data: { restarted: true } };
      }

      case 'api:config/agents': {
        const { method, name, body } = (payload || {}) as { method?: string; name?: string; body?: Record<string, unknown> };
        const agentName = typeof name === 'string' ? name.trim() : '';
        if (!agentName) {
          return { id, type, success: false, error: 'Agent name is required' };
        }

        const normalizedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';
        if (normalizedMethod === 'GET') {
          const sources = getAgentSources(agentName);
          return {
            id,
            type,
            success: true,
            data: { name: agentName, sources, isBuiltIn: !sources.md.exists && !sources.json.exists },
          };
        }

        if (normalizedMethod === 'POST') {
          createAgent(agentName, (body || {}) as Record<string, unknown>);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Agent ${agentName} created successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        if (normalizedMethod === 'PATCH') {
          updateAgent(agentName, (body || {}) as Record<string, unknown>);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Agent ${agentName} updated successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        if (normalizedMethod === 'DELETE') {
          deleteAgent(agentName);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Agent ${agentName} deleted successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        return { id, type, success: false, error: `Unsupported method: ${normalizedMethod}` };
      }

      case 'api:config/commands': {
        const { method, name, body } = (payload || {}) as { method?: string; name?: string; body?: Record<string, unknown> };
        const commandName = typeof name === 'string' ? name.trim() : '';
        if (!commandName) {
          return { id, type, success: false, error: 'Command name is required' };
        }

        const normalizedMethod = typeof method === 'string' && method.trim() ? method.trim().toUpperCase() : 'GET';
        if (normalizedMethod === 'GET') {
          const sources = getCommandSources(commandName);
          return {
            id,
            type,
            success: true,
            data: { name: commandName, sources, isBuiltIn: !sources.md.exists && !sources.json.exists },
          };
        }

        if (normalizedMethod === 'POST') {
          createCommand(commandName, (body || {}) as Record<string, unknown>);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Command ${commandName} created successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        if (normalizedMethod === 'PATCH') {
          updateCommand(commandName, (body || {}) as Record<string, unknown>);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Command ${commandName} updated successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        if (normalizedMethod === 'DELETE') {
          deleteCommand(commandName);
          await ctx?.manager?.restart();
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              requiresReload: true,
              message: `Command ${commandName} deleted successfully. Reloading interface…`,
              reloadDelayMs: CLIENT_RELOAD_DELAY_MS,
            },
          };
        }

        return { id, type, success: false, error: `Unsupported method: ${normalizedMethod}` };
      }

      case 'api:opencode/directory': {
        const target = (payload as { path?: string })?.path;
        if (!target) {
          return { id, type, success: false, error: 'Path is required' };
        }
        const baseDirectory =
          ctx?.manager?.getWorkingDirectory() || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        const resolvedPath = resolveUserPath(target, baseDirectory);
        const result = await ctx?.manager?.setWorkingDirectory(resolvedPath);
        if (!result) {
          return { id, type, success: false, error: 'OpenCode manager unavailable' };
        }
        return { id, type, success: true, data: result };
      }

      case 'api:models/metadata': {
        try {
          const data = await fetchModelsMetadata();
          return { id, type, success: true, data };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { id, type, success: false, error: errorMessage };
        }
      }

      case 'editor:openFile': {
        const { path: filePath, line, column } = payload as { path: string; line?: number; column?: number };
        try {
          const doc = await vscode.workspace.openTextDocument(filePath);
          const options: vscode.TextDocumentShowOptions = {};
          if (typeof line === 'number') {
            const pos = new vscode.Position(Math.max(0, line - 1), column || 0);
            options.selection = new vscode.Range(pos, pos);
          }
          await vscode.window.showTextDocument(doc, options);
          return { id, type, success: true };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { id, type, success: false, error: errorMessage };
        }
      }

      case 'editor:openDiff': {
        const { original, modified, label } = payload as { original: string; modified: string; label?: string };
        try {
          // If the paths are just content, we need to create virtual documents or temp files.
          // However, 'editor:openDiff' usually implies comparing two URIs.
          // If the payload contains file paths:
          const originalUri = vscode.Uri.file(original);
          const modifiedUri = vscode.Uri.file(modified);
          const title = label || `${path.basename(original)} ↔ ${path.basename(modified)}`;
          
          await vscode.commands.executeCommand('vscode.diff', originalUri, modifiedUri, title);
          return { id, type, success: true };
        } catch (error) {
           const errorMessage = error instanceof Error ? error.message : String(error);
           return { id, type, success: false, error: errorMessage };
        }
      }

      case 'api:provider/auth:delete': {
        const { providerId } = (payload || {}) as { providerId?: string };
        if (!providerId) {
          return { id, type, success: false, error: 'Provider ID is required' };
        }
        try {
          const removed = removeProviderAuth(providerId);
          if (removed) {
            await ctx?.manager?.restart();
          }
          return {
            id,
            type,
            success: true,
            data: {
              success: true,
              removed,
              requiresReload: removed,
              message: removed
                ? `Provider ${providerId} disconnected successfully. Reloading interface…`
                : `Provider ${providerId} was not configured.`,
              reloadDelayMs: removed ? CLIENT_RELOAD_DELAY_MS : undefined,
            },
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { id, type, success: false, error: errorMessage };
        }
      }

      default:
        return { id, type, success: false, error: `Unknown message type: ${type}` };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { id, type, success: false, error: errorMessage };
  }
}
