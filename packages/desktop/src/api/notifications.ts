import { invoke } from '@tauri-apps/api/core';
import type { NotificationsAPI, NotificationPayload } from '@openchamber/ui/lib/api/types';
import { isPermissionGranted, requestPermission } from '@tauri-apps/plugin-notification';

export const requestInitialNotificationPermission = async (): Promise<void> => {
  try {
    const granted = await isPermissionGranted();
    await invoke('desktop_log', { level: 'info', message: `[notifications] Startup permission check: ${granted}` });
    
    if (!granted) {
      const permission = await requestPermission();
      await invoke('desktop_log', { level: 'info', message: `[notifications] Startup request result: ${permission}` });
    } else {
      await invoke('desktop_log', { level: 'info', message: '[notifications] Startup: already granted' });
    }
  } catch (error) {
    await invoke('desktop_log', { level: 'error', message: `[notifications] Startup failed: ${error}` });
  }
};

export const createDesktopNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    try {
      let granted = await isPermissionGranted();
      if (!granted) {
        await invoke('desktop_log', { level: 'warn', message: '[notifications] Permission not granted, requesting now...' });
        const permission = await requestPermission();
        granted = permission === 'granted';
        await invoke('desktop_log', { level: 'info', message: `[notifications] Request result: ${permission}` });
      }
      
      if (granted) {
        await invoke('desktop_log', { level: 'info', message: `[notifications] Sending: ${payload?.title}` });
        await invoke('notify_agent_completion', { payload });
        return true;
      } else {
        await invoke('desktop_log', { level: 'error', message: '[notifications] Cannot send: Permission denied' });
        return false;
      }
    } catch (error) {
      await invoke('desktop_log', { level: 'error', message: `[notifications] Exception: ${error}` });
      return false;
    }
  },

  async canNotify(): Promise<boolean> {
    return await isPermissionGranted();
  }
});
