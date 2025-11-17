import type { NotificationPayload, NotificationsAPI } from '@openchamber/ui/lib/api/types';

const notifyWithWebAPI = async (payload?: NotificationPayload): Promise<boolean> => {
  if (typeof Notification === 'undefined') {
    console.info('Notifications not supported in this environment', payload);
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  try {
    new Notification(payload?.title ?? 'OpenChamber', {
      body: payload?.body,
      tag: payload?.tag,
    });
    return true;
  } catch (error) {
    console.warn('Failed to send notification', error);
    return false;
  }
};

export const createWebNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    return notifyWithWebAPI(payload);
  },
  canNotify: () => (typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false),
});
