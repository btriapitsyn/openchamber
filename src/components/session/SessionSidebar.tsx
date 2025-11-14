import React from 'react';
import type { Session } from '@opencode-ai/sdk';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Plus, DotsThreeOutlineVertical, PencilSimple, Trash, Export, LinkBreak, Check, X, Copy, GitBranch, FolderSimpleStar, Circle, WarningCircle,  } from '@phosphor-icons/react';
import { sessionEvents } from '@/lib/sessionEvents';
import { formatDirectoryName, formatPathForDisplay, cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import type { SessionMemoryState } from '@/stores/types/sessionTypes';
import type { WorktreeMetadata } from '@/types/worktree';
import { isLinkedWorktree as detectLinkedWorktree } from '@/lib/gitApi';

const formatDateLabel = (value: string | number) => {
  const targetDate = new Date(value);
  const today = new Date();
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(targetDate, today)) {
    return 'Today';
  }
  if (isSameDay(targetDate, yesterday)) {
    return 'Yesterday';
  }
  const formatted = targetDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return formatted.replace(',', '');
};

const groupSessionsByDate = (sessions: Session[]) => {
  const groups = new Map<string, Session[]>();
  sessions.forEach((session) => {
    const label = formatDateLabel(session.time?.created || Date.now());
    if (!groups.has(label)) {
      groups.set(label, []);
    }
    groups.get(label)!.push(session);
  });
  return Array.from(groups.entries()).sort((a, b) => {
    const dateA = new Date(a[1][0].time?.created || 0);
    const dateB = new Date(b[1][0].time?.created || 0);
    return dateB.getTime() - dateA.getTime();
  });
};

const highlightSearch = (text: string, query: string) => {
  if (!query) return text;
  const lower = text.toLowerCase();
  const matchIndex = lower.indexOf(query.toLowerCase());
  if (matchIndex === -1) return text;
  const before = text.slice(0, matchIndex);
  const match = text.slice(matchIndex, matchIndex + query.length);
  const after = text.slice(matchIndex + query.length);
  return (
    <>
      {before}
      <span className="text-primary">{match}</span>
      {after}
    </>
  );
};

const normalizePath = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
};

interface SessionSidebarProps {
  mobileVariant?: boolean;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({ mobileVariant = false }) => {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
  const copyTimeout = React.useRef<number | null>(null);
  const [linkedWorktreeMap, setLinkedWorktreeMap] = React.useState<Map<string, boolean>>(new Map());
  const pendingWorktreeChecks = React.useRef<Set<string>>(new Set());

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);

  const getSessionsByDirectory = useSessionStore((state) => state.getSessionsByDirectory);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);
  const shareSession = useSessionStore((state) => state.shareSession);
  const unshareSession = useSessionStore((state) => state.unshareSession);
  const getWorktreeMetadata = useSessionStore((state) => state.getWorktreeMetadata);
  const sessionMemoryState = useSessionStore((state) => state.sessionMemoryState);

  const setSessionCreateDialogOpen = useUIStore((state) => state.setSessionCreateDialogOpen);

  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof window.opencodeDesktop !== 'undefined';
  });

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
  }, []);

  const directorySessions = getSessionsByDirectory(currentDirectory);
  const groupedSessions = React.useMemo(
    () => groupSessionsByDate(directorySessions),
    [directorySessions],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredGroups = React.useMemo(() => {
    if (!normalizedQuery) return groupedSessions;
    return groupedSessions
      .map(([label, sessions]) => {
        const filtered = sessions.filter((session) => {
          const worktree = getWorktreeMetadata(session.id);
          const metadataText = [
            session.title || 'Untitled Session',
            worktree?.label,
            worktree?.branch,
            session.share?.url,
            formatDateLabel(session.time?.created || Date.now()),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return metadataText.includes(normalizedQuery);
        });
        return [label, filtered] as [string, Session[]];
      })
      .filter(([, sessions]) => sessions.length > 0);
  }, [groupedSessions, normalizedQuery, getWorktreeMetadata]);

  React.useEffect(() => {
    return () => {
      if (copyTimeout.current) {
        clearTimeout(copyTimeout.current);
      }
    };
  }, []);

  const displayDirectory = React.useMemo(
    () => formatDirectoryName(currentDirectory, homeDirectory),
    [currentDirectory, homeDirectory],
  );

  const directoryTooltip = React.useMemo(
    () => formatPathForDisplay(currentDirectory, homeDirectory),
    [currentDirectory, homeDirectory],
  );

  const badgeSize = mobileVariant ? 'h-6 w-6' : 'h-5 w-5';
  const badgeIconSize = mobileVariant ? 'h-4 w-4' : 'h-3 w-3';
  const menuSize = mobileVariant ? 'h-8 w-8' : 'h-6 w-6';

  const handleSessionSelect = React.useCallback(
    (sessionId: string) => {
      setCurrentSession(sessionId);
    },
    [setCurrentSession],
  );

  const handleSaveEdit = React.useCallback(async () => {
    if (editingId && editTitle.trim()) {
      await updateSessionTitle(editingId, editTitle.trim());
      setEditingId(null);
      setEditTitle('');
    }
  }, [editingId, editTitle, updateSessionTitle]);

  const handleCancelEdit = React.useCallback(() => {
    setEditingId(null);
    setEditTitle('');
  }, []);

  const handleShareSession = React.useCallback(
    async (session: Session) => {
      const result = await shareSession(session.id);
      if (result && result.share?.url) {
        toast.success('Session shared', {
          description: 'You can copy the link from the menu.',
        });
      } else {
        toast.error('Unable to share session');
      }
    },
    [shareSession],
  );

  const handleCopyShareUrl = React.useCallback((url: string, sessionId: string) => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopiedSessionId(sessionId);
        if (copyTimeout.current) {
          clearTimeout(copyTimeout.current);
        }
        copyTimeout.current = window.setTimeout(() => {
          setCopiedSessionId(null);
          copyTimeout.current = null;
        }, 2000);
      })
      .catch(() => {
        toast.error('Failed to copy URL');
      });
  }, []);

  const handleUnshareSession = React.useCallback(
    async (sessionId: string) => {
      const result = await unshareSession(sessionId);
      if (result) {
        toast.success('Session unshared');
      } else {
        toast.error('Unable to unshare session');
      }
    },
    [unshareSession],
  );

  const handleDeleteSession = React.useCallback((session: Session, dateLabel?: string) => {
    sessionEvents.requestDelete({ sessions: [session], dateLabel });
  }, []);

  const handleDeleteSessionGroup = React.useCallback(
    (label: string, sessions: Session[]) => {
      sessionEvents.requestDelete({ sessions, dateLabel: label });
    },
    [],
  );

  const handleOpenCreateSession = React.useCallback(() => {
    setSessionCreateDialogOpen(true);
  }, [setSessionCreateDialogOpen]);

  const handleOpenDirectoryDialog = React.useCallback(() => {
    sessionEvents.requestDirectoryDialog();
  }, []);

  const streamingSessions = React.useMemo(() => {
    let count = 0;
    sessionMemoryState.forEach((state: SessionMemoryState | undefined, sessionId: string) => {
      if (state?.isStreaming && sessionId !== currentSessionId) {
        count += 1;
      }
    });
    return count;
  }, [sessionMemoryState, currentSessionId]);

  const dirtyWorktreeCount = React.useMemo(() => {
    return directorySessions.reduce<number>((acc, session) => {
      const metadata = getWorktreeMetadata(session.id);
      return metadata?.status?.isDirty ? acc + 1 : acc;
    }, 0);
  }, [directorySessions, getWorktreeMetadata]);

  React.useEffect(() => {
    const directories = directorySessions
      .map((session) => normalizePath((session as Session & { directory?: string | null }).directory ?? null))
      .filter((dir): dir is string => Boolean(dir));
    const uniqueDirectories = Array.from(new Set(directories));

    uniqueDirectories.forEach((directory) => {
      if (linkedWorktreeMap.has(directory) || pendingWorktreeChecks.current.has(directory)) {
        return;
      }

      pendingWorktreeChecks.current.add(directory);
      detectLinkedWorktree(directory)
        .then((linked) => {
          setLinkedWorktreeMap((prev) => {
            const next = new Map(prev);
            next.set(directory, linked);
            return next;
          });
        })
        .catch((error) => {
          console.error('Failed to determine worktree type:', error);
          setLinkedWorktreeMap((prev) => {
            if (prev.has(directory)) {
              return prev;
            }
            const next = new Map(prev);
            next.set(directory, false);
            return next;
          });
        })
        .finally(() => {
          pendingWorktreeChecks.current.delete(directory);
        });
    });
  }, [directorySessions, linkedWorktreeMap]);

  const emptyState = (
    <div className="px-3 py-12 text-center text-muted-foreground">
      <p className="typography-ui-label font-semibold">No sessions yet</p>
      <p className="typography-meta mt-1">
        Create your first session to start coding in this workspace.
      </p>
    </div>
  );

  const renderSessionRow = (session: Session) => {
    const worktree = getWorktreeMetadata(session.id) as WorktreeMetadata | undefined | null;
    const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
    const worktreePath = normalizePath(worktree?.path ?? null);
    const linkedStatus =
      sessionDirectory && linkedWorktreeMap.has(sessionDirectory)
        ? linkedWorktreeMap.get(sessionDirectory)
        : undefined;
    const hasLinkedWorktree =
      typeof linkedStatus === 'boolean'
        ? linkedStatus
        : Boolean(worktreePath && sessionDirectory && worktreePath === sessionDirectory);
    const memoryState = sessionMemoryState.get(session.id);
    const isActive = currentSessionId === session.id;

    if (editingId === session.id) {
      return (
        <div
          key={session.id}
          className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2 py-2"
        >
          <Input
            value={editTitle}
            onChange={(event) => setEditTitle(event.target.value)}
            className="h-8 flex-1 typography-meta"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSaveEdit();
              if (event.key === 'Escape') handleCancelEdit();
            }}
          />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEdit}>
            <Check className="h-4 w-4" weight="bold" />
          </Button>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleCancelEdit}>
            <X className="h-4 w-4" weight="bold" />
          </Button>
        </div>
      );
    }

    const streamingIndicator = (() => {
      if (!memoryState) return null;
      if (memoryState.isZombie) {
        return <WarningCircle className="h-4 w-4 text-warning" />;
      }
      if (memoryState.isStreaming && session.id !== currentSessionId) {
        return <Circle className="h-2.5 w-2.5 animate-pulse text-primary" weight="fill" />;
      }
      return null;
    })();

    return (
      <div
        key={session.id}
        className={cn(
          'group relative rounded-md px-0 py-1 transition-colors',
          mobileVariant ? 'hover:bg-transparent' : 'hover:bg-sidebar/60'
        )}
      >
        <button
          type="button"
          onClick={() => handleSessionSelect(session.id)}
         className="flex min-w-0 w-full items-center gap-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
         >
           <span
              className={cn(
                'truncate typography-ui-label font-normal',
                isActive ? 'text-primary' : 'text-foreground',
              )}
            >
              {searchQuery ? highlightSearch(session.title || 'Untitled Session', searchQuery) : session.title || 'Untitled Session'}
            </span>
           <div className="flex flex-none items-center gap-0.5 pl-1">
             {hasLinkedWorktree && (
               <Tooltip delayDuration={1000}>
                 <TooltipTrigger asChild>
                   <span
                     className={cn(
                       'inline-flex items-center justify-center rounded-full text-xs text-[color:var(--status-success)]',
                       badgeSize
                     )}
                     aria-label="Worktree attached"
                   >
                     <GitBranch className={badgeIconSize} weight="bold" />
                   </span>
                 </TooltipTrigger>
                 <TooltipContent side="top">{worktree?.label || worktree?.branch || worktree?.path}</TooltipContent>
               </Tooltip>
             )}
             {session.share && (
               <Tooltip delayDuration={1000}>
                 <TooltipTrigger asChild>
                   <span
                     className={cn(
                       'inline-flex items-center justify-center rounded-full text-xs text-[color:var(--status-info)]',
                       badgeSize
                     )}
                     aria-label="Session shared"
                   >
                     <Export className={badgeIconSize} weight="bold" />
                   </span>
                 </TooltipTrigger>
                 <TooltipContent side="top">Shared session</TooltipContent>
               </Tooltip>
             )}
           </div>
           <div className="flex flex-none items-center gap-1">
             {memoryState?.backgroundMessageCount ? (
               <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-primary typography-micro">
                 <Circle className="h-2 w-2" weight="fill" />
                 {memoryState.backgroundMessageCount}
               </span>
             ) : null}
             {streamingIndicator}
           </div>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'absolute right-0 top-1/2 inline-flex -translate-y-1/2 items-center justify-center rounded-md bg-sidebar/80 text-muted-foreground transition-colors hover:bg-sidebar text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                mobileVariant ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                menuSize
              )}
            >
              <DotsThreeOutlineVertical className={mobileVariant ? 'h-4 w-4' : 'h-3.5 w-3.5'} weight="duotone" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem
              onClick={() => {
                setEditingId(session.id);
                setEditTitle(session.title || '');
              }}
            >
              <PencilSimple className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            {!session.share ? (
              <DropdownMenuItem onClick={() => handleShareSession(session)}>
                <Export className="mr-2 h-4 w-4" />
                Share
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem
                  onClick={() => {
                    if (session.share?.url) {
                      handleCopyShareUrl(session.share.url, session.id);
                    }
                  }}
                >
                  {copiedSessionId === session.id ? (
                    <>
                      <Check className="mr-2 h-4 w-4" style={{ color: 'var(--status-success)' }} weight="bold" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-2 h-4 w-4" />
                      Copy link
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleUnshareSession(session.id)}>
                  <LinkBreak className="mr-2 h-4 w-4" />
                  Unshare
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => handleDeleteSession(session)}
            >
              <Trash className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderGroupHeader = (label: string, sessions: Session[]) => {
    const sessionCountLabel = sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;
    return (
      <div className="group/date flex items-center justify-between px-0.5 pt-2 pb-1">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="typography-micro text-muted-foreground/80">{sessionCountLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => handleDeleteSessionGroup(label, sessions)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 group-hover/date:opacity-100 focus-visible:opacity-100"
          aria-label={`Delete sessions from ${label}`}
        >
          <Trash className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground',
        mobileVariant ? '' : isDesktopRuntime ? 'bg-transparent' : 'bg-sidebar'
      )}
    >
      <div className="h-12 select-none px-1">
        <div className="flex h-full items-center gap-1.5">
           <button
              type="button"
              onClick={handleOpenDirectoryDialog}
              className={cn(
                'app-region-no-drag inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                mobileVariant ? 'h-9 w-9' : 'ml-1 h-7 w-7'
              )}
              aria-label="Change project directory"
            >
             <FolderSimpleStar className={mobileVariant ? 'h-5 w-5' : 'h-5 w-5'} weight="duotone" />
           </button>
           <span className="flex-1 truncate text-left typography-ui-label font-semibold" title={directoryTooltip || '/'}>
             {displayDirectory || '/'}
           </span>
            <button
              type="button"
              onClick={handleOpenCreateSession}
              className={cn(
                'app-region-no-drag inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                mobileVariant ? 'h-9 w-9' : 'mr-1 h-7 w-7'
              )}
              aria-label="Create session"
            >
              <Plus className={mobileVariant ? 'h-5 w-5' : 'h-5 w-5'} weight="bold" />
           </button>
        </div>
      </div>
      <div
        className={cn(
          'flex-1 space-y-3 overflow-y-auto py-1 scrollbar-hidden',
          mobileVariant ? 'pl-2 pr-2' : 'pl-2 pr-3'
        )}
      >
        {filteredGroups.length === 0 ? (
          emptyState
        ) : (
          filteredGroups.map(([label, sessions]) => (
            <section key={label} className="space-y-1">
              {renderGroupHeader(label, sessions)}
              <div className="space-y-1 px-0">
                {sessions.map((session) => renderSessionRow(session))}
              </div>
            </section>
          ))
        )}
      </div>

    </div>
  );
};
