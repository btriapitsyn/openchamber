import { invoke } from '@tauri-apps/api/core';
import type { DirectoryListResult, FileSearchQuery, FileSearchResult, FilesAPI } from '@openchamber/ui/lib/api/types';

type ListDirectoryResponse = DirectoryListResult & {
  path?: string;
  entries: Array<
    DirectoryListResult['entries'][number] & {
      isFile?: boolean;
      isSymbolicLink?: boolean;
    }
  >;
};

type SearchFilesResponse = {
  root: string;
  count: number;
  files: Array<{
    name: string;
    path: string;
    relativePath: string;
    extension?: string;
  }>;
};

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

const normalizeDirectoryPayload = (result: ListDirectoryResponse): DirectoryListResult => ({
  directory: normalizePath(result.directory || result.path || ''),
  entries: Array.isArray(result.entries)
    ? result.entries.map((entry) => ({
        name: entry.name,
        path: normalizePath(entry.path),
        isDirectory: entry.isDirectory,
        size: entry.size,
        modifiedTime: entry.modifiedTime,
      }))
    : [],
});

export const createDesktopFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string): Promise<DirectoryListResult> {
    try {
      const result = await invoke<ListDirectoryResponse>('list_directory', {
        path: normalizePath(path),
      });
      return normalizeDirectoryPayload(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to list directory');
    }
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    try {
      const normalizedDirectory =
        typeof payload.directory === 'string' && payload.directory.length > 0
          ? normalizePath(payload.directory)
          : undefined;

      const result = await invoke<SearchFilesResponse>('search_files', {
        directory: normalizedDirectory,
        query: payload.query,
        max_results: payload.maxResults,
      });

      if (!result || !Array.isArray(result.files)) {
        return [];
      }

      return result.files.map<FileSearchResult>((file) => ({
        path: normalizePath(file.path),
        preview: file.relativePath ? [normalizePath(file.relativePath)] : undefined,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to search files');
    }
  },

  async createDirectory(path: string): Promise<{ success: boolean; path: string }> {
    try {
      const normalizedPath = normalizePath(path);
      const result = await invoke<{ success: boolean; path: string }>('create_directory', {
        path: normalizedPath,
      });

      return {
        success: Boolean(result?.success),
        path: result?.path ? normalizePath(result.path) : normalizedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to create directory');
    }
  },
});
