import type { DirectoryListResult, FileSearchQuery, FileSearchResult, FilesAPI } from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop files API not implemented');
};

export const createDesktopFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string): Promise<DirectoryListResult> {
    return notImplemented(path);
  },
  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    return notImplemented(payload);
  },
});
