import { invoke } from '@tauri-apps/api/core';
import type { NotificationsAPI, NotificationPayload } from '@openchamber/ui/lib/api/types';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

export const createDesktopNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    let granted = await isPermissionGranted();
    if (!granted) {
      const permission = await requestPermission();
      granted = permission === 'granted';
    }
    
    if (granted) {
        try {
            await invoke('notify_agent_completion', { payload });
            return true;
        } catch (error) {
            console.error('Failed to send notification:', error);
            return false;
        }
    }
    
    return false;
  },

  async canNotify(): Promise<boolean> {
    return await isPermissionGranted();
  }
});
