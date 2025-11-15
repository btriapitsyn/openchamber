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
import {
  RiAddLine,
  RiCheckLine,
  RiCircleLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFolder6Line,
  RiGitBranchLine,
  RiLinkUnlinkM,
  RiMore2Line,
  RiPencilAiLine,
  RiShare2Line,
} from '@remixicon/react';
import { sessionEvents } from '@/lib/sessionEvents';
import { formatDirectoryName, formatPathForDisplay, cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
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
  const [searchQuery] = React.useState('');
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
  const sortedSessions = React.useMemo(() => {
    return [...directorySessions].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  }, [directorySessions]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSessions = React.useMemo(() => {
    if (!normalizedQuery) {
      return sortedSessions;
    }
    return sortedSessions.filter((session) => {
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
  }, [sortedSessions, normalizedQuery, getWorktreeMetadata]);

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

  const emptyState = (
    <div className="px-3 py-12 text-center text-muted-foreground">
      <p className="typography-ui-label font-semibold">No sessions yet</p>
      <p className="typography-meta mt-1">
        Create your first session to start coding in this workspace.
      </p>
    </div>
  );

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

  const handleDeleteSession = React.useCallback((session: Session) => {
    sessionEvents.requestDelete({ sessions: [session] });
  }, []);

  const handleOpenCreateSession = React.useCallback(() => {
    setSessionCreateDialogOpen(true);
  }, [setSessionCreateDialogOpen]);

  const handleOpenDirectoryDialog = React.useCallback(() => {
    sessionEvents.requestDirectoryDialog();
  }, []);

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
        <div key={session.id} className="flex flex-col px-2 py-2">
          <form
            className="flex w-full items-center justify-between gap-2 px-0 py-0"
            onSubmit={(event) => {
              event.preventDefault();
              handleSaveEdit();
            }}
          >
            <Input
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
              className="h-5 flex-1 border-none bg-transparent px-0 py-0 rounded-none typography-micro focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-transparent"
              autoFocus
              placeholder="Rename session"
              onKeyDown={(event) => {
                if (event.key === 'Escape') handleCancelEdit();
              }}
            />
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-5 w-5 p-0" type="submit">
                <RiCheckLine className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 p-0"
                type="button"
                onClick={handleCancelEdit}
              >
                <RiCloseLine className="h-4 w-4" />
              </Button>
            </div>
          </form>
          <div className="flex items-center gap-2 pt-0.5 pb-0.5 -mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
            <span>{formatDateLabel(session.time?.created || Date.now())}</span>
            <div className="flex items-center gap-2 text-xs normal-case">
              {hasLinkedWorktree && (
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center text-[color:var(--status-success)]">
                      <RiGitBranchLine className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">
                    {branchLabel || worktree?.path}
                  </TooltipContent>
                </Tooltip>
              )}
              {session.share && (
                <Tooltip delayDuration={500}>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center justify-center text-[color:var(--status-info)]">
                      <RiShare2Line className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top">Shared session</TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      );
    }

    const sessionTitle = session.title || 'Untitled Session';
    const branchLabel = worktree?.label || worktree?.branch;

    const streamingIndicator = (() => {
      if (!memoryState) return null;
      if (memoryState.isZombie) {
        return <RiErrorWarningLine className="h-4 w-4 text-warning" />;
      }
      if (memoryState.isStreaming && session.id !== currentSessionId) {
        return <RiCircleLine className="h-2.5 w-2.5 animate-pulse text-primary" />;
      }
      return null;
    })();

    return (
      <div
        key={session.id}
        className={cn(
          'group relative flex flex-col px-2 py-2 transition-colors',
          isActive ? 'bg-sidebar/10' : 'hover:bg-sidebar/10',
        )}
        role="button"
        tabIndex={0}
        onClick={() => handleSessionSelect(session.id)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleSessionSelect(session.id);
          }
        }}
      >
        <div className="group relative flex items-start">
          <div className="flex min-w-0 flex-1 text-left">
            <span
              className={cn(
                'truncate typography-micro font-normal block',
                isActive ? 'text-primary' : 'text-foreground',
              )}
            >
              {searchQuery ? highlightSearch(sessionTitle, searchQuery) : sessionTitle}
            </span>
          </div>
          <div className="pointer-events-none absolute -right-2 top-1/2 flex items-center gap-[2px] -translate-y-1/2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-hover:pointer-events-auto focus-within:opacity-100 focus-within:pointer-events-auto">
            {memoryState?.backgroundMessageCount ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-primary typography-micro">
                <RiCircleLine className="h-2 w-2" />
                {memoryState.backgroundMessageCount}
              </span>
            ) : null}
            {streamingIndicator}
          </div>
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'absolute -right-2 top-0 flex h-5 w-4 items-center justify-center rounded-md bg-sidebar/40 text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 pointer-events-none hover:bg-sidebar',
                    mobileVariant
                      ? 'opacity-100 pointer-events-auto'
                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-hover:pointer-events-auto focus-visible:pointer-events-auto',
                  )}
                  aria-label="Session menu"
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => event.stopPropagation()}
                >
                  <RiMore2Line weight="regular" className={mobileVariant ? 'h-3.5 w-3.5' : 'h-3 w-3'} />
                </button>
              </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-fit">
              <DropdownMenuItem
                onClick={() => {
                  setEditingId(session.id);
                  setEditTitle(sessionTitle);
                }}
                className="[&>svg]:mr-1"
              >
                <RiPencilAiLine className="mr-1 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              {!session.share ? (
                <DropdownMenuItem onClick={() => handleShareSession(session)} className="[&>svg]:mr-1">
                  <RiShare2Line className="mr-1 h-4 w-4" />
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
                    className="[&>svg]:mr-1"
                  >
                    {copiedSessionId === session.id ? (
                      <>
                        <RiCheckLine className="mr-1 h-4 w-4" style={{ color: 'var(--status-success)' }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <RiFileCopyLine className="mr-1 h-4 w-4" />
                        Copy link
                      </>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleUnshareSession(session.id)} className="[&>svg]:mr-1">
                    <RiLinkUnlinkM className="mr-1 h-4 w-4" />
                    Unshare
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive [&>svg]:mr-1"
                onClick={() => handleDeleteSession(session)}
              >
                <RiDeleteBinLine className="mr-1 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-2 pt-0.5 pb-0.5 -mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">
          <span>{formatDateLabel(session.time?.created || Date.now())}</span>
          <div className="flex items-center gap-2 text-xs normal-case">
            {hasLinkedWorktree && (
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center text-[color:var(--status-success)]">
                    <RiGitBranchLine className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  {branchLabel || worktree?.path}
                </TooltipContent>
              </Tooltip>
            )}
            {session.share && (
              <Tooltip delayDuration={500}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center justify-center text-[color:var(--status-info)]">
                    <RiShare2Line className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">Shared session</TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground',
        mobileVariant ? '' : isDesktopRuntime ? 'bg-transparent' : 'bg-sidebar',
      )}
    >
      <div className="h-12 select-none px-0">
        <div className="flex h-full items-center gap-3 pl-2 pr-1">
          <button
            type="button"
            onClick={handleOpenDirectoryDialog}
            className={cn(
              'app-region-no-drag inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 pl-2',
              mobileVariant ? 'h-9 w-9' : 'h-7 w-7',
            )}
            aria-label="Change project directory"
          >
            <RiFolder6Line className={mobileVariant ? 'h-5 w-5' : 'h-5 w-5'} />
          </button>
          <span
            className="flex-1 truncate text-left typography-ui-label font-semibold"
            title={directoryTooltip || '/'}
          >
            {displayDirectory || '/'}
          </span>
          <button
            type="button"
            onClick={handleOpenCreateSession}
            className={cn(
              'app-region-no-drag inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 pr-2',
              mobileVariant ? 'h-9 w-9' : 'mr-1 h-7 w-7',
            )}
            aria-label="Create session"
          >
            <RiAddLine className={mobileVariant ? 'h-5 w-5' : 'h-5 w-5'} />
          </button>
        </div>
      </div>
      <div
        className={cn(
          'flex-1 space-y-0.5 overflow-y-auto py-1 scrollbar-hidden',
          mobileVariant ? 'px-2' : 'px-2',
        )}
      >
        {filteredSessions.length === 0 ? (
          emptyState
        ) : (
          filteredSessions.map((session) => renderSessionRow(session))
        )}
      </div>
    </div>
  );
};
