import React from 'react';
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiAlertLine,
  RiCloseLine,
} from '@remixicon/react';
import { useNotificationCenterStore } from '@/stores/useNotificationCenterStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { cn } from '@/lib/utils';

/**
 * Format relative timestamp (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) return `${diffDay}d ago`;
  if (diffHour > 0) return `${diffHour}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

/**
 * Get icon for notification kind
 */
function getKindIcon(kind: 'completed' | 'error' | 'stuck') {
  switch (kind) {
    case 'completed':
      return <RiCheckLine className="h-4 w-4" style={{ color: 'var(--status-success)' }} />;
    case 'error':
      return <RiErrorWarningLine className="h-4 w-4" style={{ color: 'var(--status-error)' }} />;
    case 'stuck':
      return <RiAlertLine className="h-4 w-4" style={{ color: 'var(--status-warning)' }} />;
  }
}

export const NotificationCenter: React.FC = () => {
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const notifications = useNotificationCenterStore((state) => state.notifications);
  const markRead = useNotificationCenterStore((state) => state.markRead);
  const markAllRead = useNotificationCenterStore((state) => state.markAllRead);
  const dismissNotification = useNotificationCenterStore((state) => state.dismissNotification);
  const dismissAll = useNotificationCenterStore((state) => state.dismissAll);
  
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const sessions = useSessionStore((state) => state.sessions);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);

  const handleNotificationClick = React.useCallback(
    (notificationId: string, sessionId: string, projectPath: string) => {
      // Mark as read
      markRead(notificationId);

      // Find the session
      const session = sessions.find((s) => s.id === sessionId);
      if (session) {
        // Switch to the project if needed
        setActiveProject(projectPath);
        // Switch to the session
        setCurrentSession(sessionId);
      }
    },
    [markRead, sessions, setActiveProject, setCurrentSession]
  );

  const handleDismiss = React.useCallback(
    (e: React.MouseEvent, notificationId: string) => {
      e.stopPropagation();
      dismissNotification(notificationId);
    },
    [dismissNotification]
  );

  // Sort notifications by timestamp (newest first)
  const sortedNotifications = React.useMemo(() => {
    return [...notifications].sort((a, b) => b.timestamp - a.timestamp);
  }, [notifications]);

  return (
    <div className="flex flex-col w-[360px] max-h-[75vh] bg-[var(--surface-elevated)]">
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-3 py-2.5 border-b border-[var(--interactive-border)] bg-[var(--surface-elevated)]">
        <span className="typography-ui-header font-semibold text-foreground">Notifications</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={markAllRead}
            className="px-2 py-1 rounded-md typography-ui-label text-muted-foreground hover:text-foreground hover:bg-interactive-hover transition-colors"
            disabled={notifications.length === 0}
          >
            Mark all read
          </button>
          <button
            type="button"
            onClick={dismissAll}
            className="px-2 py-1 rounded-md typography-ui-label text-muted-foreground hover:text-foreground hover:bg-interactive-hover transition-colors"
            disabled={notifications.length === 0}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {sortedNotifications.length === 0 ? (
          <div className="flex items-center justify-center h-32">
            <span className="typography-ui-label text-[var(--color-muted-foreground)]">
              No notifications
            </span>
          </div>
        ) : (
          <div className="flex flex-col">
            {sortedNotifications.map((notification) => (
              <div
                key={notification.id}
                className={cn(
                  'relative flex items-start gap-3 px-3 py-2.5 cursor-pointer transition-colors border-b border-[var(--interactive-border)]',
                  'hover:bg-interactive-hover',
                  !notification.read && 'bg-[var(--surface-elevated)] border-l-2 border-l-[var(--status-info)]'
                )}
                onClick={() =>
                  handleNotificationClick(notification.id, notification.sessionId, notification.projectPath)
                }
                onMouseEnter={() => setHoveredId(notification.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                {/* Icon */}
                <div className="flex-shrink-0 pt-0.5">
                  {getKindIcon(notification.kind)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <div className="typography-ui-label font-medium text-foreground truncate">
                    {notification.title}
                  </div>
                  <div className="typography-micro text-muted-foreground line-clamp-2">
                    {notification.body}
                  </div>
                  <div className="typography-micro text-muted-foreground/60">
                    {formatRelativeTime(notification.timestamp)}
                  </div>
                </div>

                {/* Dismiss button (shown on hover) */}
                {hoveredId === notification.id && (
                  <button
                    type="button"
                    onClick={(e) => handleDismiss(e, notification.id)}
                    className="flex-shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <RiCloseLine className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
