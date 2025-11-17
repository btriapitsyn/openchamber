import type { DirectoryPermissionRequest, PermissionsAPI, StartAccessingResult } from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop permissions API not implemented');
};

export const createDesktopPermissionsAPI = (): PermissionsAPI => ({
  async requestDirectoryAccess(request: DirectoryPermissionRequest) {
    return notImplemented(request);
  },
  async startAccessingDirectory(path: string): Promise<StartAccessingResult> {
    return notImplemented(path);
  },
  async stopAccessingDirectory(path: string): Promise<StartAccessingResult> {
    return notImplemented(path);
  },
});
