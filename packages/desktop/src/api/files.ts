
import { safeInvoke } from '../lib/tauriCallbackManager';
import type { DirectoryListResult, FileSearchQuery, FileSearchResult, FilesAPI, ListDirectoryOptions } from '@openchamber/ui/lib/api/types';

type ReadFileBinaryResponse = {
  dataUrl: string;
  path: string;
};

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
        name: entry.name || '',
        path: normalizePath(entry.path || ''),
        isDirectory: entry.isDirectory ?? false,
        size: entry.size ?? 0,
        modified: (entry as { modified?: string }).modified ?? new Date().toISOString(),
      }))
    : [],
});

export const createDesktopFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string, options?: ListDirectoryOptions): Promise<DirectoryListResult> {
    try {
      const result = await safeInvoke<ListDirectoryResponse>('list_directory', {
        path: normalizePath(path),
        includeHidden: false,
        respectGitignore: options?.respectGitignore ?? false,
      }, {
        timeout: 10000,
        onCancel: () => {
          console.warn('[FilesAPI] List directory operation timed out');
        }
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

      const result = await safeInvoke<SearchFilesResponse>('search_files', {
        directory: normalizedDirectory,
        query: payload.query,
        max_results: payload.maxResults || 100
      }, {
        timeout: 15000,
        onCancel: () => {
          console.warn('[FilesAPI] Search files operation timed out');
        }
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
      const result = await safeInvoke<{ success: boolean; path: string }>('create_directory', {
        path: normalizedPath
      }, {
        timeout: 5000,
        onCancel: () => {
          console.warn('[FilesAPI] Create directory operation timed out');
        }
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

  async readFile(path: string): Promise<{ content: string; path: string }> {
    try {
      const normalizedPath = normalizePath(path);
      const result = await safeInvoke<{ content: string; path: string }>('read_file', {
        path: normalizedPath
      }, {
        timeout: 10000,
        onCancel: () => {
          console.warn('[FilesAPI] Read file operation timed out');
        }
      });

      return {
        content: result?.content ?? '',
        path: result?.path ? normalizePath(result.path) : normalizedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to read file');
    }
  },

  async readFileBinary(path: string): Promise<ReadFileBinaryResponse> {
    try {
      const normalizedPath = normalizePath(path);
      const result = await safeInvoke<ReadFileBinaryResponse>('read_file_binary', {
        path: normalizedPath
      }, {
        timeout: 15000,
        onCancel: () => {
          console.warn('[FilesAPI] Read binary file operation timed out');
        }
      });

      return {
        dataUrl: result?.dataUrl ?? '',
        path: result?.path ? normalizePath(result.path) : normalizedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to read file');
    }
  },

  async writeFile(path: string, content: string): Promise<{ success: boolean; path: string }> {
    try {
      const normalizedPath = normalizePath(path);
      const result = await safeInvoke<{ success: boolean; path: string }>('write_file', {
        path: normalizedPath,
        content
      }, {
        timeout: 10000,
        onCancel: () => {
          console.warn('[FilesAPI] Write file operation timed out');
        }
      });

      return {
        success: Boolean(result?.success),
        path: result?.path ? normalizePath(result.path) : normalizedPath,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to write file');
    }
  },

  async execCommands(commands: string[], cwd: string): Promise<{
    success: boolean;
    results: Array<{
      command: string;
      success: boolean;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      error?: string;
    }>;
  }> {
    try {
      const normalizedCwd = normalizePath(cwd);
      const result = await safeInvoke<{
        success: boolean;
        results: Array<{
          command: string;
          success: boolean;
          exitCode?: number;
          stdout?: string;
          stderr?: string;
          error?: string;
        }>;
      }>('exec_commands', {
        commands,
        cwd: normalizedCwd
      }, {
        timeout: 120000, // 2 minutes for command execution
        onCancel: () => {
          console.warn('[FilesAPI] Exec commands operation timed out');
        }
      });

      return {
        success: Boolean(result?.success),
        results: result?.results ?? [],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message || 'Failed to execute commands');
    }
  },
});