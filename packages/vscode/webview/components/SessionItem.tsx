import React from 'react';
import type { Session } from '@opencode-ai/sdk';

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  isStreaming?: boolean;
  onClick: () => void;
}

const formatRelativeTime = (timestamp: number | undefined): string => {
  if (!timestamp) return '';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export function SessionItem({ session, isActive, isStreaming, onClick }: SessionItemProps) {
  const title = session.title || 'New Session';
  const time = formatRelativeTime(session.time?.created);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors ${
        isActive
          ? 'bg-primary/10 border-l-2 border-primary'
          : 'hover:bg-muted/50 border-l-2 border-transparent'
      }`}
    >
      {/* Activity indicator */}
      <div className="mt-1.5 flex-shrink-0">
        {isStreaming ? (
          <span className="block w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        ) : (
          <span className={`block w-2 h-2 rounded-full ${isActive ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span>{time}</span>
          {session.summary && (
            <span className="text-[10px]">
              {session.summary.additions !== undefined && (
                <span className="text-green-600">+{session.summary.additions}</span>
              )}
              {session.summary.deletions !== undefined && (
                <span className="text-red-500 ml-1">-{session.summary.deletions}</span>
              )}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
