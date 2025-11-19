import type { DirectoryListResult, FileSearchQuery, FileSearchResult, FilesAPI } from '@openchamber/ui/lib/api/types';

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

export const createWebFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string): Promise<DirectoryListResult> {
    const target = normalizePath(path);
    const response = await fetch('/api/fs/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to list directory');
    }

    return response.json();
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    const response = await fetch('/api/fs/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directory: normalizePath(payload.directory),
        query: payload.query,
        maxResults: payload.maxResults,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to search files');
    }

    const results = (await response.json()) as unknown;
    if (!Array.isArray(results)) {
      return [];
    }
    return results
      .filter((item): item is FileSearchResult => !!item && typeof item === 'object' && typeof (item as { path?: string }).path === 'string')
      .map((item) => ({
        path: normalizePath((item as FileSearchResult).path),
        score: (item as FileSearchResult).score,
        preview: (item as FileSearchResult).preview,
      }));
  },

  async createDirectory(path: string): Promise<{ success: boolean; path: string }> {
    const target = normalizePath(path);
    const response = await fetch('/api/fs/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || 'Failed to create directory');
    }

    const result = await response.json();
    return {
      success: Boolean(result?.success),
      path: typeof result?.path === 'string' ? normalizePath(result.path) : target,
    };
  },
});
