import type { DirectoryPermissionRequest, DirectoryPermissionResult, PermissionsAPI, StartAccessingResult } from '@openchamber/ui/lib/api/types';

export const createDesktopPermissionsAPI = (): PermissionsAPI => ({
  async requestDirectoryAccess(request: DirectoryPermissionRequest): Promise<DirectoryPermissionResult> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<DirectoryPermissionResult>('request_directory_access', { request });
      return result;
    } catch (error) {
      console.error('[desktop] Error requesting directory access:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  async startAccessingDirectory(path: string): Promise<StartAccessingResult> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<StartAccessingResult>('start_accessing_directory', { path });
      return result;
    } catch (error) {
      console.error('[desktop] Error starting directory access:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  async stopAccessingDirectory(path: string): Promise<StartAccessingResult> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<StartAccessingResult>('stop_accessing_directory', { path });
      return result;
    } catch (error) {
      console.error('[desktop] Error stopping directory access:', error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
});
