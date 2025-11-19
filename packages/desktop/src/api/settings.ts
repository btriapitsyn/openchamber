import type { SettingsAPI, SettingsLoadResult, SettingsPayload } from '@openchamber/ui/lib/api/types';

const sanitizePayload = (data: unknown): SettingsPayload => {
  if (!data || typeof data !== 'object') {
    return {};
  }
  return data as SettingsPayload;
};

export const createDesktopSettingsAPI = (): SettingsAPI => ({
  async load(): Promise<SettingsLoadResult> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ settings: unknown; source: 'desktop' | 'web' }>('load_settings');
      return {
        settings: sanitizePayload(result.settings),
        source: result.source,
      };
    } catch (error) {
      throw new Error(`Failed to load settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async save(changes: Partial<SettingsPayload>): Promise<SettingsPayload> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<unknown>('save_settings', { changes });
      return sanitizePayload(result);
    } catch (error) {
      throw new Error(`Failed to save settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  },

  async restartOpenCode(): Promise<{ restarted: boolean }> {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<{ restarted: boolean }>('restart_opencode');
      return { restarted: result.restarted };
    } catch (error) {
      throw new Error(`Failed to restart OpenCode: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
