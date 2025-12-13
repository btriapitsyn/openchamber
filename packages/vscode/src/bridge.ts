import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import type { OpenCodeManager } from './opencode';

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

const listDirectoryEntries = async (dirPath: string) => {
  const uri = vscode.Uri.file(dirPath);
  const entries = await vscode.workspace.fs.readDirectory(uri);
  return entries.map(([name, fileType]) => ({
    name,
    path: normalizeFsPath(vscode.Uri.joinPath(uri, name).fsPath),
    isDirectory: fileType === vscode.FileType.Directory,
  }));
};

const searchDirectory = async (directory: string, query: string, limit = 60) => {
  const rootPath = directory || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  if (!rootPath) return [];

  const sanitizedQuery = query?.trim() || '';
  const pattern = sanitizedQuery ? `**/*${sanitizedQuery}*` : '**/*';
  const exclude = '**/{node_modules,.git,dist,build,.next,.turbo,.cache,coverage,tmp,logs}/**';
  const results = await vscode.workspace.findFiles(
    new vscode.RelativePattern(vscode.Uri.file(rootPath), pattern),
    exclude,
    limit,
  );

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

export async function handleBridgeMessage(message: BridgeRequest, ctx?: BridgeContext): Promise<BridgeResponse> {
  const { id, type, payload } = message;

  try {
    switch (type) {
      case 'files:list': {
        const { path: dirPath } = payload as { path: string };
        const uri = vscode.Uri.file(dirPath);
        const entries = await vscode.workspace.fs.readDirectory(uri);
        const result: FileEntry[] = entries.map(([name, fileType]) => ({
          name,
          path: vscode.Uri.joinPath(uri, name).fsPath,
          isDirectory: fileType === vscode.FileType.Directory,
        }));
        return { id, type, success: true, data: { directory: dirPath, entries: result } };
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
        const target = (payload as { path?: string })?.path || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || os.homedir();
        const entries = await listDirectoryEntries(target);
        return { id, type, success: true, data: { entries, directory: target } };
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
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(target));
        return { id, type, success: true, data: { success: true, path: normalizeFsPath(target) } };
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

      case 'api:opencode/directory': {
        const target = (payload as { path?: string })?.path;
        if (!target) {
          return { id, type, success: false, error: 'Path is required' };
        }
        const result = await ctx?.manager?.setWorkingDirectory(target);
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

      default:
        return { id, type, success: false, error: `Unknown message type: ${type}` };
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return { id, type, success: false, error: errorMessage };
  }
}
