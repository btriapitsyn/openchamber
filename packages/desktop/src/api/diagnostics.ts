import { invoke } from '@tauri-apps/api/core';
import type { DiagnosticsAPI } from '@openchamber/ui/lib/api/types';

type LogResponse = {
  fileName?: string;
  content?: string;
};

const normalizePayload = (payload: LogResponse): { fileName: string; content: string } => ({
  fileName: typeof payload.fileName === 'string' && payload.fileName.trim().length > 0 ? payload.fileName : 'desktop.log',
  content: typeof payload.content === 'string' ? payload.content : '',
});

export const createDesktopDiagnosticsAPI = (): DiagnosticsAPI => ({
  async downloadLogs() {
    try {
      const result = await invoke<LogResponse>('fetch_desktop_logs');
      return normalizePayload(result ?? {});
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to download desktop logs');
    }
  },
});
