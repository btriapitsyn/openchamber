import React, { useMemo, useState, useCallback } from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import {
  RiChat4Line,
  RiSearchLine,
  RiHistoryLine,
} from '@remixicon/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { GridLoader } from '@/components/ui/grid-loader';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { usePanes, type PaneId } from '@/stores/usePaneStore';
import { useSessionActivity } from '@/hooks/useSessionActivity';

const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};

const normalizePath = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
};

interface SessionHistoryItemProps {
  session: Session;
  onSelect: (session: Session) => void;
}

const SessionHistoryItem: React.FC<SessionHistoryItemProps> = ({ session, onSelect }) => {
  // Use per-session hook - only re-renders when THIS session's phase changes
  const { isWorking: isStreaming } = useSessionActivity(session.id);
  const additions = session.summary?.additions ?? 0;
  const deletions = session.summary?.deletions ?? 0;
  const hasChanges = additions > 0 || deletions > 0;
  const updated = session.time?.updated ?? session.time?.created;

  return (
    <button
      type="button"
      onClick={() => onSelect(session)}
      className="w-full flex flex-col gap-0.5 rounded-md px-2 py-2 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-center gap-2">
        <RiChat4Line className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate text-sm text-foreground">
          {session.title || 'Untitled'}
        </span>
        {isStreaming && <GridLoader size="xs" className="text-primary shrink-0" />}
      </div>
      <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
        {hasChanges && (
          <span className="flex items-center gap-0.5">
            <span className="text-[color:var(--status-success)]">+{additions}</span>
            <span>/</span>
            <span className="text-destructive">-{deletions}</span>
          </span>
        )}
        {updated && (
          <span className="text-muted-foreground/70">{formatRelativeTime(updated)}</span>
        )}
      </div>
    </button>
  );
};

interface SessionHistoryDropdownProps {
  paneId: PaneId;
  buttonClassName?: string;
}

export const SessionHistoryDropdown: React.FC<SessionHistoryDropdownProps> = ({ paneId, buttonClassName }) => {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
  const worktreeId = currentDirectory ?? 'global';
  const { openChatSession } = usePanes(worktreeId);

  const sessionsByDirectory = useSessionStore((s) => s.sessionsByDirectory);
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  const currentWorktreeSessions = useMemo(() => {
    const normalizedPath = normalizePath(currentDirectory);
    if (!normalizedPath) return [];
    return sessionsByDirectory.get(normalizedPath) ?? [];
  }, [currentDirectory, sessionsByDirectory]);

  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return currentWorktreeSessions;
    const query = searchQuery.toLowerCase();
    return currentWorktreeSessions.filter(s => 
      (s.title?.toLowerCase().includes(query)) ||
      (s.id.toLowerCase().includes(query))
    );
  }, [currentWorktreeSessions, searchQuery]);

  const sortedSessions = useMemo(() => {
    return [...filteredSessions].sort((a, b) => 
      (b.time?.updated ?? b.time?.created ?? 0) - (a.time?.updated ?? a.time?.created ?? 0)
    );
  }, [filteredSessions]);

  const handleSelectSession = useCallback((session: Session) => {
    openChatSession(paneId, session.id, session.title || 'Chat');
    setCurrentSession(session.id);
    setOpen(false);
    setSearchQuery('');
  }, [openChatSession, paneId, setCurrentSession]);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    setOpen(isOpen);
    if (!isOpen) {
      setSearchQuery('');
    }
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <Tooltip delayDuration={700}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={buttonClassName ?? 'flex h-12 w-12 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors'}
              aria-label="Session history"
            >
              <RiHistoryLine className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Session History</TooltipContent>
      </Tooltip>

      <DropdownMenuContent 
        align="end" 
        sideOffset={4}
        className="w-80 p-0"
      >
        <div className="flex flex-col max-h-96">
          <div className="flex items-center gap-2 p-2 border-b border-border/50">
            <div className="flex-1 relative">
              <RiSearchLine className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sessions..."
                className="w-full h-8 pl-8 pr-3 rounded-md bg-muted/50 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                autoFocus
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <ScrollableOverlay className="flex-1 overflow-y-auto max-h-72">
            {sortedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-6 text-center">
                <RiChat4Line className="h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? 'No sessions match your search' : 'No sessions yet'}
                </p>
              </div>
            ) : (
              <div className="p-1 space-y-0.5">
                {sortedSessions.map((session) => (
                  <SessionHistoryItem
                    key={session.id}
                    session={session}
                    onSelect={handleSelectSession}
                  />
                ))}
              </div>
            )}
          </ScrollableOverlay>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
