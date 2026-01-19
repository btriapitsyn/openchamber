import type {
  CommandExecResult,
  DirectoryListResult,
  FileSearchQuery,
  FileSearchResult,
  FilesAPI,
} from '@openchamber/ui/lib/api/types';

import { sendBridgeMessage, sendBridgeMessageWithOptions } from './bridge';

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

export const createVSCodeFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string): Promise<DirectoryListResult> {
    const target = normalizePath(path);
    const data = await sendBridgeMessage<{
      directory?: string;
      path?: string;
      entries: Array<{ name: string; path: string; isDirectory: boolean }>;
    }>('api:fs:list', { path: target });

    const directory = normalizePath(data?.directory || data?.path || target);
    const entries = Array.isArray(data?.entries) ? data.entries : [];
    return {
      directory,
      entries: entries.map((entry) => ({
        name: entry.name,
        path: normalizePath(entry.path),
        isDirectory: Boolean(entry.isDirectory),
      })),
    };
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    const data = await sendBridgeMessage<{ files: Array<{ path: string; relativePath?: string }> }>('api:fs:search', {
      directory: normalizePath(payload.directory),
      query: payload.query,
      limit: payload.maxResults,
      includeHidden: payload.includeHidden,
    });

    const files = Array.isArray(data?.files) ? data.files : [];
    return files
      .filter((file) => file && typeof file.path === 'string')
      .map((file) => ({
        path: normalizePath(file.path),
        preview: file.relativePath ? [normalizePath(file.relativePath)] : undefined,
      }));
  },

  async createDirectory(path: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const data = await sendBridgeMessage<{ success: boolean; path: string }>('api:fs:mkdir', { path: target });
    return {
      success: Boolean(data?.success),
      path: typeof data?.path === 'string' ? normalizePath(data.path) : target,
    };
  },

  async readFile(path: string): Promise<{ content: string; path: string }> {
    const target = normalizePath(path);
    const data = await sendBridgeMessage<{ content: string; path: string }>('api:fs:read', { path: target });
    return {
      content: typeof data?.content === 'string' ? data.content : '',
      path: typeof data?.path === 'string' ? normalizePath(data.path) : target,
    };
  },

  async writeFile(path: string, content: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const data = await sendBridgeMessage<{ success: boolean; path: string }>('api:fs:write', { path: target, content });
    return {
      success: Boolean(data?.success),
      path: typeof data?.path === 'string' ? normalizePath(data.path) : target,
    };
  },

  async execCommands(commands: string[], cwd: string): Promise<{ success: boolean; results: CommandExecResult[] }> {
    const targetCwd = normalizePath(cwd);
    // Use extended timeout for command execution (5 minutes)
    const data = await sendBridgeMessageWithOptions<{ success: boolean; results?: CommandExecResult[] }>('api:fs:exec', {
      commands,
      cwd: targetCwd,
    }, { timeoutMs: 300000 });

    return {
      success: Boolean(data?.success),
      results: Array.isArray(data?.results) ? data.results : [],
    };
  },
});
