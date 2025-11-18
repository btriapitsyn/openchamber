import type { NotificationPayload, NotificationsAPI } from '@openchamber/ui/lib/api/types';

const notify = async (payload?: NotificationPayload): Promise<boolean> => {
  if (typeof Notification === 'undefined') {
    return false;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
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

export const createDesktopNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    return notify(payload);
  },
  canNotify: () => (typeof Notification !== 'undefined' ? Notification.permission === 'granted' : false),
});
