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
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
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
import type { WorktreeMetadata } from '@/types/worktree';
import { opencodeClient } from '@/lib/opencode/client';
import { checkIsGitRepository } from '@/lib/gitApi';
import { getSafeStorage } from '@/stores/utils/safeStorage';

const WORKTREE_ROOT = '.openchamber';
const GROUP_COLLAPSE_STORAGE_KEY = 'oc.sessions.groupCollapse';
const SESSION_EXPANDED_STORAGE_KEY = 'oc.sessions.expandedParents';

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

const normalizePath = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
};

const deriveProjectRoot = (directory: string | null, metadata: Map<string, WorktreeMetadata>): string | null => {
  const normalized = normalizePath(directory);
  const firstMetadata = Array.from(metadata.values())[0];
  if (firstMetadata?.projectDirectory) {
    return normalizePath(firstMetadata.projectDirectory);
  }
  if (!normalized) {
    return null;
  }
  const marker = `/${WORKTREE_ROOT}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex > 0) {
    return normalized.slice(0, markerIndex);
  }
  return normalized;
};

type SessionNode = {
  session: Session;
  children: SessionNode[];
};

type SessionGroup = {
  id: string;
  label: string;
  description: string | null;
  isMain: boolean;
  worktree: WorktreeMetadata | null;
  directory: string | null;
  sessions: SessionNode[];
  isMissingDirectory: boolean;
};

interface SessionSidebarProps {
  mobileVariant?: boolean;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({ mobileVariant = false }) => {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
  const copyTimeout = React.useRef<number | null>(null);
  const [expandedParents, setExpandedParents] = React.useState<Set<string>>(new Set());
  const [directoryStatus, setDirectoryStatus] = React.useState<Map<string, 'unknown' | 'exists' | 'missing'>>(
    () => new Map(),
  );
  const checkingDirectories = React.useRef<Set<string>>(new Set());
  const safeStorage = React.useMemo(() => getSafeStorage(), []);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Set<string>>(new Set());
  const [isGitRepo, setIsGitRepo] = React.useState<boolean | null>(null);
  const [expandedSessionGroups, setExpandedSessionGroups] = React.useState<Set<string>>(new Set());

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);

  const getSessionsByDirectory = useSessionStore((state) => state.getSessionsByDirectory);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);
  const shareSession = useSessionStore((state) => state.shareSession);
  const unshareSession = useSessionStore((state) => state.unshareSession);
  const sessionMemoryState = useSessionStore((state) => state.sessionMemoryState);
  const sessionActivityPhase = useSessionStore((state) => state.sessionActivityPhase);
  const worktreeMetadata = useSessionStore((state) => state.worktreeMetadata);
  const availableWorktrees = useSessionStore((state) => state.availableWorktrees);

  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    return typeof window.opencodeDesktop !== 'undefined';
  });

  React.useEffect(() => {
    try {
      const storedGroups = safeStorage.getItem(GROUP_COLLAPSE_STORAGE_KEY);
      if (storedGroups) {
        const parsed = JSON.parse(storedGroups);
        if (Array.isArray(parsed)) {
          setCollapsedGroups(new Set(parsed.filter((item) => typeof item === 'string')));
        }
      }
      const storedParents = safeStorage.getItem(SESSION_EXPANDED_STORAGE_KEY);
      if (storedParents) {
        const parsed = JSON.parse(storedParents);
        if (Array.isArray(parsed)) {
          setExpandedParents(new Set(parsed.filter((item) => typeof item === 'string')));
        }
      }
    } catch {
      // ignore storage errors
    }
  }, [safeStorage]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
  }, []);


  const sessions = getSessionsByDirectory(currentDirectory);
  const sortedSessions = React.useMemo(() => {
    return [...sessions].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  }, [sessions]);

  React.useEffect(() => {
    if (!currentDirectory) {
      setIsGitRepo(null);
      return;
    }
    let cancelled = false;
    checkIsGitRepository(currentDirectory)
      .then((result) => {
        if (!cancelled) {
          setIsGitRepo(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsGitRepo(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentDirectory]);

  const sessionMap = React.useMemo(() => {
    return new Map(sortedSessions.map((session) => [session.id, session]));
  }, [sortedSessions]);

  const parentMap = React.useMemo(() => {
    const map = new Map<string, string>();
    sortedSessions.forEach((session) => {
      const parentID = (session as Session & { parentID?: string | null }).parentID;
      if (parentID) {
        map.set(session.id, parentID);
      }
    });
    return map;
  }, [sortedSessions]);

  const childrenMap = React.useMemo(() => {
    const map = new Map<string, Session[]>();
    sortedSessions.forEach((session) => {
      const parentID = (session as Session & { parentID?: string | null }).parentID;
      if (!parentID) {
        return;
      }
      const collection = map.get(parentID) ?? [];
      collection.push(session);
      map.set(parentID, collection);
    });
    map.forEach((list) => list.sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0)));
    return map;
  }, [sortedSessions]);

  React.useEffect(() => {
    if (!currentSessionId) {
      return;
    }
    setExpandedParents((previous) => {
      const next = new Set(previous);
      let cursor = parentMap.get(currentSessionId) || null;
      let changed = false;
      while (cursor) {
        if (!next.has(cursor)) {
          next.add(cursor);
          changed = true;
        }
        cursor = parentMap.get(cursor) || null;
      }
      return changed ? next : previous;
    });
  }, [currentSessionId, parentMap]);

  const projectRoot = React.useMemo(
    () => deriveProjectRoot(currentDirectory, worktreeMetadata),
    [currentDirectory, worktreeMetadata],
  );

  React.useEffect(() => {
    const directories = new Set<string>();
    sortedSessions.forEach((session) => {
      const dir = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
      if (dir) {
        directories.add(dir);
      }
    });
    if (projectRoot) {
      directories.add(projectRoot);
    }

    directories.forEach((directory) => {
      const known = directoryStatus.get(directory);
      if ((known && known !== 'unknown') || checkingDirectories.current.has(directory)) {
        return;
      }
      checkingDirectories.current.add(directory);
      opencodeClient
        .listLocalDirectory(directory)
        .then(() => {
          setDirectoryStatus((prev) => {
            const next = new Map(prev);
            if (next.get(directory) === 'exists') {
              return prev;
            }
            next.set(directory, 'exists');
            return next;
          });
        })
        .catch(() => {
          setDirectoryStatus((prev) => {
            const next = new Map(prev);
            if (next.get(directory) === 'missing') {
              return prev;
            }
            next.set(directory, 'missing');
            return next;
          });
        })
        .finally(() => {
          checkingDirectories.current.delete(directory);
        });
    });
  }, [sortedSessions, projectRoot, directoryStatus]);

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
    <div className="py-6 text-center text-muted-foreground">
      <p className="typography-ui-label font-semibold">No sessions yet</p>
      <p className="typography-meta mt-1">Create your first session to start coding.</p>
    </div>
  );

  const handleSessionSelect = React.useCallback(
    (sessionId: string, disabled?: boolean) => {
      if (disabled) {
        return;
      }
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

  const collectDescendants = React.useCallback(
    (sessionId: string): Session[] => {
      const collected: Session[] = [];
      const visit = (id: string) => {
        const children = childrenMap.get(id) ?? [];
        children.forEach((child) => {
          collected.push(child);
          visit(child.id);
        });
      };
      visit(sessionId);
      return collected;
    },
    [childrenMap],
  );

  const handleDeleteSession = React.useCallback(
    (session: Session) => {
      const targets = [session, ...collectDescendants(session.id)];
      const unique = Array.from(
        new Map(targets.map((entry) => [entry.id, entry])).values(),
      );
      sessionEvents.requestDelete({ sessions: unique, mode: 'session' });
    },
    [collectDescendants],
  );

  const handleOpenCreateSession = React.useCallback(() => {
    sessionEvents.requestCreate({ worktreeMode: 'main' });
  }, []);

  const handleCreateWorktree = React.useCallback(() => {
    sessionEvents.requestCreate({ worktreeMode: 'create' });
  }, []);

  const handleOpenDirectoryDialog = React.useCallback(() => {
    if (isDesktopRuntime && window.opencodeDesktop?.requestDirectoryAccess) {
      window.opencodeDesktop
        .requestDirectoryAccess('')
        .then((result) => {
          if (result.success && result.path) {
            setDirectory(result.path, { showOverlay: true });
          } else if (result.error && result.error !== 'Directory selection cancelled') {
            toast.error('Failed to select directory', {
              description: result.error,
            });
          }
        })
        .catch((error) => {
          console.error('Desktop: Error selecting directory:', error);
          toast.error('Failed to select directory');
        });
    } else {
      sessionEvents.requestDirectoryDialog();
    }
  }, [isDesktopRuntime, setDirectory]);

  const toggleParent = React.useCallback((sessionId: string) => {
    setExpandedParents((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      try {
        safeStorage.setItem(SESSION_EXPANDED_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [safeStorage]);

  const buildNode = React.useCallback(
    (session: Session): SessionNode => {
      const children = childrenMap.get(session.id) ?? [];
      return {
        session,
        children: children.map((child) => buildNode(child)),
      };
    },
    [childrenMap],
  );

  const groupedSessions = React.useMemo<SessionGroup[]>(() => {
    const groups = new Map<string, SessionGroup>();
    const normalizedProjectRoot = normalizePath(projectRoot ?? null);

    const worktreeByPath = new Map<string, WorktreeMetadata>();
    availableWorktrees.forEach((meta) => {
      if (meta.path) {
        worktreeByPath.set(normalizePath(meta.path) ?? meta.path, meta);
      }
    });
    worktreeMetadata.forEach((meta) => {
      if (meta.path) {
        worktreeByPath.set(normalizePath(meta.path) ?? meta.path, meta);
      }
    });

    const ensureGroup = (session: Session) => {
      const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
      const worktree =
        worktreeMetadata.get(session.id) ??
        (sessionDirectory ? worktreeByPath.get(sessionDirectory) ?? null : null);
      const isMain =
        !worktree &&
        ((sessionDirectory && normalizedProjectRoot
          ? sessionDirectory === normalizedProjectRoot
          : !sessionDirectory && Boolean(normalizedProjectRoot)));
      const key = isMain ? 'main' : worktree?.path ?? sessionDirectory ?? session.id;
      const directory = worktree?.path ?? sessionDirectory ?? normalizedProjectRoot ?? null;
      if (!groups.has(key)) {
        const label = isMain
          ? 'Main workspace'
          : worktree?.label || worktree?.branch || formatDirectoryName(directory || '', homeDirectory) || 'Worktree';
        const description = worktree?.relativePath
          ? formatPathForDisplay(worktree.relativePath, homeDirectory)
          : directory
            ? formatPathForDisplay(directory, homeDirectory)
            : null;
        const missing = directory ? directoryStatus.get(directory) === 'missing' : false;
        groups.set(key, {
          id: key,
          label,
          description,
          isMain,
          worktree,
          directory,
          sessions: [],
          isMissingDirectory: missing,
        });
      }
      return groups.get(key)!;
    };

    const roots = sortedSessions.filter((session) => {
      const parentID = (session as Session & { parentID?: string | null }).parentID;
      if (!parentID) {
        return true;
      }
      return !sessionMap.has(parentID);
    });

    roots.forEach((session) => {
      const group = ensureGroup(session);
      const node = buildNode(session);
      group.sessions.push(node);
      if (group.directory && directoryStatus.get(group.directory) === 'missing') {
        group.isMissingDirectory = true;
      }
    });

    // Add empty main group if missing
    if (!groups.has('main')) {
      const missing = normalizedProjectRoot ? directoryStatus.get(normalizedProjectRoot) === 'missing' : false;
      groups.set('main', {
        id: 'main',
        label: 'Main workspace',
        description: normalizedProjectRoot ? formatPathForDisplay(normalizedProjectRoot, homeDirectory) : null,
        isMain: true,
        worktree: null,
        directory: normalizedProjectRoot,
        sessions: [],
        isMissingDirectory: missing,
      });
    }

    // Add empty worktree groups from discovered worktrees
    worktreeByPath.forEach((meta, path) => {
      const key = meta.path;
      if (!groups.has(key)) {
        const missing = directoryStatus.get(path) === 'missing';
        groups.set(key, {
          id: key,
          label: meta.label || meta.branch || formatDirectoryName(path, homeDirectory) || 'Worktree',
          description: meta.relativePath
            ? formatPathForDisplay(meta.relativePath, homeDirectory)
            : formatPathForDisplay(path, homeDirectory),
          isMain: false,
          worktree: meta,
          directory: path,
          sessions: [],
          isMissingDirectory: missing,
        });
      }
    });

    groups.forEach((group) => {
      group.sessions.sort((a, b) => (b.session.time?.created || 0) - (a.session.time?.created || 0));
    });

    return Array.from(groups.values()).sort((a, b) => {
      if (a.isMain !== b.isMain) {
        return a.isMain ? -1 : 1;
      }
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [sortedSessions, worktreeMetadata, availableWorktrees, projectRoot, homeDirectory, directoryStatus, buildNode, sessionMap]);

  const flattenNodes = React.useCallback((nodes: SessionNode[]): Session[] => {
    const collected: Session[] = [];
    const visit = (node: SessionNode) => {
      collected.push(node.session);
      node.children.forEach(visit);
    };
    nodes.forEach(visit);
    return Array.from(new Map(collected.map((entry) => [entry.id, entry])).values());
  }, []);

  const handleRemoveWorktree = React.useCallback(
    (group: SessionGroup) => {
      const targets = flattenNodes(group.sessions);
      sessionEvents.requestDelete({
        sessions: targets,
        mode: 'worktree',
        worktree: group.worktree,
      });
    },
    [flattenNodes],
  );

  const toggleGroup = React.useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      try {
        safeStorage.setItem(GROUP_COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch {
        // ignore
      }
      return next;
    });
  }, [safeStorage]);

  const toggleGroupSessionLimit = React.useCallback((groupId: string) => {
    setExpandedSessionGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  const renderSessionNode = React.useCallback(
    (node: SessionNode, depth = 0, groupDirectory?: string | null): React.ReactNode => {
      const session = node.session;
      const sessionDirectory =
        normalizePath((session as Session & { directory?: string | null }).directory ?? null) ??
        normalizePath(groupDirectory ?? null);
      const directoryState = sessionDirectory ? directoryStatus.get(sessionDirectory) : null;
      const isMissingDirectory = directoryState === 'missing';
      const memoryState = sessionMemoryState.get(session.id);
      const isActive = currentSessionId === session.id;
      const sessionTitle = session.title || 'Untitled Session';
      const hasChildren = node.children.length > 0;
      const isExpanded = expandedParents.has(session.id);
      const additions = session.summary?.additions;
      const deletions = session.summary?.deletions;
      const hasSummary = typeof additions === 'number' || typeof deletions === 'number';

      if (editingId === session.id) {
        return (
          <div key={session.id} className="flex flex-col rounded-lg border border-transparent px-2 py-2">
            <form
              className="flex w-full items-center justify-between gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                handleSaveEdit();
              }}
            >
              <Input
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                className="h-7 flex-1 border-none bg-transparent px-0 py-0 typography-micro focus-visible:ring-0 focus-visible:ring-offset-0"
                autoFocus
                placeholder="Rename session"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') handleCancelEdit();
                }}
              />
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-6 w-6 p-0" type="submit">
                  <RiCheckLine className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  type="button"
                  onClick={handleCancelEdit}
                >
                  <RiCloseLine className="h-4 w-4" />
                </Button>
              </div>
            </form>
            <div className="flex items-center gap-2 pt-1 typography-micro text-muted-foreground/70 overflow-hidden">
              <span className="flex-shrink-0">{formatDateLabel(session.time?.created || Date.now())}</span>
              {session.share && (
                <RiShare2Line className="h-3 w-3 text-[color:var(--status-info)] flex-shrink-0" />
              )}
            </div>
          </div>
        );
      }

      const streamingIndicator = (() => {
        if (!memoryState) return null;
        if (memoryState.isZombie) {
          return <RiErrorWarningLine className="h-4 w-4 text-warning" />;
        }
        return null;
      })();

      const phase = sessionActivityPhase?.get(session.id) ?? 'idle';
      const isStreaming = phase === 'busy' || phase === 'cooldown';

      const backgroundBadge =
        memoryState?.backgroundMessageCount && memoryState.backgroundMessageCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-border/50 px-1.5 py-0.5 text-primary typography-micro">
            <RiCircleLine className="h-2 w-2" />
            {memoryState.backgroundMessageCount}
          </span>
        ) : null;

      return (
        <React.Fragment key={session.id}>
          <div
            className={cn(
              'group relative flex items-center rounded-md px-1.5 py-1 transition-colors',
              isActive ? 'bg-accent/60' : 'hover:bg-accent/40',
              isMissingDirectory ? 'opacity-75' : '',
              depth > 0 && 'pl-[20px]',
            )}
          >
            <div className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                disabled={isMissingDirectory}
                onClick={() => handleSessionSelect(session.id, isMissingDirectory)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 text-foreground',
                )}
              >
                {/* Row 1: Title */}
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={cn(
                      'truncate typography-ui-label font-normal text-foreground',
                      isStreaming && 'animate-pulse [animation-duration:1.8s]'
                    )}
                  >
                    {sessionTitle}
                  </span>
                </div>

                {/* Row 2: Metadata inline with chevron */}
                <div className="flex items-center gap-2 typography-micro text-muted-foreground/60 min-w-0 overflow-hidden leading-tight">
                  {hasChildren ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleParent(session.id);
                      }}
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none flex-shrink-0"
                      aria-label={isExpanded ? 'Collapse subsessions' : 'Expand subsessions'}
                    >
                      {isExpanded ? (
                        <RiArrowDownSLine className="h-3 w-3" />
                      ) : (
                        <RiArrowRightSLine className="h-3 w-3" />
                      )}
                    </button>
                  ) : null}
                  <span className="flex-shrink-0">{formatDateLabel(session.time?.created || Date.now())}</span>
                  {session.share ? (
                    <RiShare2Line className="h-3 w-3 text-[color:var(--status-info)] flex-shrink-0" />
                  ) : null}
                  {hasSummary && ((additions ?? 0) !== 0 || (deletions ?? 0) !== 0) ? (
                    <span className="flex-shrink-0">
                      <span className="text-[color:var(--status-success)]">+{Math.max(0, additions ?? 0)}</span>
                      <span className="text-muted-foreground/50">/</span>
                      <span className="text-destructive">-{Math.max(0, deletions ?? 0)}</span>
                    </span>
                  ) : null}
                  {hasChildren ? (
                    <span className="truncate">
                      {node.children.length} {node.children.length === 1 ? 'task' : 'tasks'}
                    </span>
                  ) : null}
                  {isMissingDirectory ? (
                    <span className="inline-flex items-center gap-0.5 text-warning flex-shrink-0">
                      <RiErrorWarningLine className="h-3 w-3" />
                      Missing
                    </span>
                  ) : null}
                </div>
              </button>

              <div className="flex items-center gap-1.5 self-stretch">
                {backgroundBadge}
                {streamingIndicator}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-3.5 w-[18px] items-center justify-center rounded-md text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                      )}
                      aria-label="Session menu"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <RiMore2Line className={mobileVariant ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[180px]">
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
                      Remove
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
          {hasChildren && isExpanded
            ? node.children.map((child) =>
                renderSessionNode(child, depth + 1, sessionDirectory ?? groupDirectory),
              )
            : null}
        </React.Fragment>
      );
    },
    [
      directoryStatus,
      sessionMemoryState,
      sessionActivityPhase,
      currentSessionId,
      expandedParents,
      editingId,
      editTitle,
      handleSaveEdit,
      handleCancelEdit,
      toggleParent,
      handleSessionSelect,
      handleShareSession,
      handleCopyShareUrl,
      handleUnshareSession,
      handleDeleteSession,
      copiedSessionId,
      mobileVariant,
      homeDirectory,
    ],
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground overflow-x-hidden',
        mobileVariant ? '' : isDesktopRuntime ? 'bg-transparent' : 'bg-sidebar',
      )}
    >
      <div className="h-14 select-none px-2 flex-shrink-0">
        <div className="flex h-full items-center gap-0">
          <button
            type="button"
            onClick={handleOpenDirectoryDialog}
            className={cn(
              'group flex min-w-0 flex-1 items-center gap-2 rounded-md px-0 py-1 text-left transition-colors hover:bg-sidebar/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
            )}
            aria-label="Change project directory"
            title={directoryTooltip || '/'}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar/60 group-hover:text-primary">
              <RiFolder6Line className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 overflow-hidden">
              <p className="truncate whitespace-nowrap typography-ui font-semibold group-hover:text-primary">
                {displayDirectory || '/'}
              </p>
            </div>
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex h-10 w-7 flex-shrink-0 items-center justify-center rounded-xl bg-sidebar/60 text-muted-foreground transition-colors hover:bg-sidebar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                )}
                aria-label="Session actions"
              >
                <RiAddLine className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              <DropdownMenuItem onClick={handleOpenCreateSession} className="[&>svg]:mr-1">
                <RiPencilAiLine className="mr-1 h-4 w-4" />
                Create session
              </DropdownMenuItem>
              {isGitRepo ? (
                <DropdownMenuItem onClick={handleCreateWorktree} className="[&>svg]:mr-1">
                  <RiGitBranchLine className="mr-1 h-4 w-4" />
                  Create worktree
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollableOverlay
        outerClassName="flex-1 min-h-0"
        className={cn('space-y-1 py-1 pl-2.5 pr-1', mobileVariant ? '' : '')}
      >
        {groupedSessions.length === 0 ? (
          emptyState
        ) : (
          groupedSessions.map((group, index) => (
            <div
              key={group.id}
              className={cn(
                'rounded-md bg-transparent',
                index === 0 ? 'pt-1 pb-0' : 'py-1',
                index > 0 && 'border-t border-border/90 -mx-2.5 px-2.5'
              )}
            >
            <div
              className="group flex h-8 items-center gap-2 rounded-md px-1.5"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="group flex w-full items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label={collapsedGroups.has(group.id) ? 'Expand worktree group' : 'Collapse worktree group'}
                  >
                    {collapsedGroups.has(group.id) ? (
                      <RiArrowRightSLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    ) : (
                      <RiArrowDownSLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                    )}
                    <p className="truncate typography-ui-header font-semibold text-[15px] group-hover:text-primary">
                      {group.label}
                    </p>
                    {group.isMissingDirectory ? (
                      <span className="inline-flex items-center gap-1 typography-micro text-warning">
                        <RiErrorWarningLine className="h-3 w-3" />
                        Missing
                      </span>
                    ) : null}
                  </button>
                </div>

                {!group.isMain ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-3.5 w-[18px] items-center justify-center rounded-md text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label="Worktree menu"
                      >
                        <RiMore2Line className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[160px]">
                      <DropdownMenuItem onClick={() => handleRemoveWorktree(group)} className="[&>svg]:mr-1 text-destructive focus:text-destructive">
                        <RiDeleteBinLine className="mr-1 h-4 w-4" />
                        Remove worktree
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>

              {!collapsedGroups.has(group.id) ? (
                <div className="space-y-1.5 py-0.5">
                  {(() => {
                    const isExpanded = expandedSessionGroups.has(group.id);
                    const maxVisible = 7;
                    const totalSessions = group.sessions.length;
                    const visibleSessions = isExpanded ? group.sessions : group.sessions.slice(0, maxVisible);
                    const remainingCount = totalSessions - visibleSessions.length;

                    return (
                      <>
                        {visibleSessions.map((node) => renderSessionNode(node, 0, group.directory))}
                        {totalSessions === 0 ? (
                          <div className="py-1 text-left typography-micro text-muted-foreground">
                            No sessions in this worktree yet.
                          </div>
                        ) : null}
                        {remainingCount > 0 && !isExpanded ? (
                          <button
                            type="button"
                            onClick={() => toggleGroupSessionLimit(group.id)}
                            className="mt-0.5 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
                          >
                            Show {remainingCount} more {remainingCount === 1 ? 'session' : 'sessions'}
                          </button>
                        ) : null}
                        {isExpanded && totalSessions > maxVisible ? (
                          <button
                            type="button"
                            onClick={() => toggleGroupSessionLimit(group.id)}
                            className="mt-0.5 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
                          >
                            Show fewer sessions
                          </button>
                        ) : null}
                      </>
                    );
                  })()}
                </div>
              ) : null}
            </div>
          ))
        )}
      </ScrollableOverlay>
    </div>
  );
};
