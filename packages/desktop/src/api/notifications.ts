import { invoke } from '@tauri-apps/api/core';
import type { NotificationsAPI, NotificationPayload } from '@openchamber/ui/lib/api/types';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

export const requestInitialNotificationPermission = async (): Promise<void> => {
  try {
    const granted = await isPermissionGranted();
    if (!granted) {
      await requestPermission();
    }
  } catch (error) {
    console.error('[notifications] Failed to request permission:', error);
  }
};

export const createDesktopNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === 'granted';
      }
      
      if (granted) {
        await invoke('notify_agent_completion', { payload });
        return true;
      } else {
        console.warn('[notifications] Cannot send notification: Permission denied');
        return false;
      }
    } catch (error) {
      console.error('[notifications] Failed to send notification:', error);
      return false;
    }
  },

  async canNotify(): Promise<boolean> {
    return await isPermissionGranted();
  }
});
