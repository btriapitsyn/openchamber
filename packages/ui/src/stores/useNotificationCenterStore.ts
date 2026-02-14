import { create } from "zustand";

/** Notification kind for the notification center */
export type NotificationCenterKind = 'completed' | 'error' | 'stuck';

/** A notification item in the notification center */
export interface NotificationItem {
  /** Unique identifier for this notification */
  id: string;
  /** Session ID that generated this notification */
  sessionId: string;
  /** Project path where the session ran */
  projectPath: string;
  /** Kind of notification */
  kind: NotificationCenterKind;
  /** Notification title */
  title: string;
  /** Notification body */
  body: string;
  /** Timestamp (milliseconds since epoch) */
  timestamp: number;
  /** Whether the notification has been read */
  read: boolean;
}

interface NotificationCenterState {
  /** List of all notifications */
  notifications: NotificationItem[];
}

interface NotificationCenterActions {
  /** Add a new notification (dedup by sessionId + kind) */
  addNotification: (notification: Omit<NotificationItem, 'id' | 'timestamp' | 'read'>) => void;
  /** Mark a notification as read */
  markRead: (id: string) => void;
  /** Mark all notifications as read */
  markAllRead: () => void;
  /** Dismiss (remove) a notification */
  dismissNotification: (id: string) => void;
  /** Dismiss all notifications */
  dismissAll: () => void;
}

type NotificationCenterStore = NotificationCenterState & NotificationCenterActions;

const normalizePath = (p: string): string => p.replace(/\/+$/, "");

export const useNotificationCenterStore = create<NotificationCenterStore>((set) => ({
  notifications: [],

  addNotification: (notification) => {
    set((state) => {
      // Dedup by sessionId + kind
      const exists = state.notifications.some(
        (n) => n.sessionId === notification.sessionId && n.kind === notification.kind
      );
      if (exists) return state;

      const newNotification: NotificationItem = {
        ...notification,
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        read: false,
      };

      return {
        notifications: [...state.notifications, newNotification],
      };
    });
  },

  markRead: (id: string) => {
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
    }));
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
    }));
  },

  dismissNotification: (id: string) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  dismissAll: () => {
    set({ notifications: [] });
  },
}));

/** Get the count of unread notifications */
export const getUnreadCount = (state: NotificationCenterStore): number => {
  return state.notifications.filter((n) => !n.read).length;
};

/** Get notifications for a specific project */
export const getNotificationsByProject = (projectPath: string) => (state: NotificationCenterStore): NotificationItem[] => {
  const normalizedPath = normalizePath(projectPath);
  return state.notifications.filter((n) => normalizePath(n.projectPath) === normalizedPath);
};
