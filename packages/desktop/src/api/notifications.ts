import type { NotificationPayload, NotificationsAPI } from '@openchamber/ui/lib/api/types';

const notImplemented = (...args: unknown[]) => {
  void args;
  throw new Error('Desktop notifications API not implemented');
};

export const createDesktopNotificationsAPI = (): NotificationsAPI => ({
  async notifyAgentCompletion(payload?: NotificationPayload): Promise<boolean> {
    return notImplemented(payload);
  },
  canNotify: () => false,
});
