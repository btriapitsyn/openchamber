import { create } from "zustand";

/** Notification kind emitted by the server */
export type NotificationKind = 'ready' | 'error' | 'question' | 'permission';

/**
 * Tracks unread notification counts per project path.
 * Notifications for the currently active project are ignored.
 * Switching to a project clears its badge.
 */
interface NotificationBadgeState {
  /** Map of normalized project path → unread notification count */
  unreadByPath: Record<string, number>;
  /** Map of normalized project path → most recent notification kind */
  kindByPath: Record<string, NotificationKind>;
}

interface NotificationBadgeActions {
  /** Increment the unread count for a project path (no-op if path is empty) */
  increment: (projectPath: string, kind?: NotificationKind) => void;
  /** Clear the unread count for a project path */
  clear: (projectPath: string) => void;
}

type NotificationBadgeStore = NotificationBadgeState & NotificationBadgeActions;

const normalizePath = (p: string): string => p.replace(/\/+$/, "");

export const useNotificationBadgeStore = create<NotificationBadgeStore>((set) => ({
  unreadByPath: {},
  kindByPath: {},

  increment: (projectPath: string, kind?: NotificationKind) => {
    if (!projectPath) return;
    const key = normalizePath(projectPath);
    set((state) => ({
      unreadByPath: {
        ...state.unreadByPath,
        [key]: (state.unreadByPath[key] ?? 0) + 1,
      },
      ...(kind ? { kindByPath: { ...state.kindByPath, [key]: kind } } : {}),
    }));
  },

  clear: (projectPath: string) => {
    if (!projectPath) return;
    const key = normalizePath(projectPath);
    set((state) => {
      if (!(key in state.unreadByPath) && !(key in state.kindByPath)) return state;
      const nextUnread = { ...state.unreadByPath };
      const nextKind = { ...state.kindByPath };
      delete nextUnread[key];
      delete nextKind[key];
      return { unreadByPath: nextUnread, kindByPath: nextKind };
    });
  },
}));
