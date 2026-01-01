import React from 'react';
import type { Session } from '@opencode-ai/sdk';
import { toast } from 'sonner';
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
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFolder6Line,
  RiGitRepositoryLine,
  RiLinkUnlinkM,
  RiMore2Line,
  RiPencilAiLine,
  RiShare2Line,
} from '@remixicon/react';
import { sessionEvents } from '@/lib/sessionEvents';
import { ArrowsMerge } from '@/components/icons/ArrowsMerge';
import { formatDirectoryName, formatPathForDisplay, cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
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
};

interface SessionSidebarProps {
  mobileVariant?: boolean;
  onSessionSelected?: (sessionId: string) => void;
  allowReselect?: boolean;
  hideDirectoryControls?: boolean;
  showOnlyMainWorkspace?: boolean;
}

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
  mobileVariant = false,
  onSessionSelected,
  allowReselect = false,
  hideDirectoryControls = false,
  showOnlyMainWorkspace = false,
}) => {
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
  const [hoveredGroupId, setHoveredGroupId] = React.useState<string | null>(null);
  const [stuckHeaders, setStuckHeaders] = React.useState<Set<string>>(new Set());
  const headerSentinelRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());

  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);

  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const openMultiRunLauncher = useUIStore((state) => state.openMultiRunLauncher);

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
  const openNewSessionDraft = useSessionStore((state) => state.openNewSessionDraft);

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
    } catch { /* ignored */ }
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

      if (mobileVariant) {
        setActiveMainTab('chat');
        setSessionSwitcherOpen(false);
      }

      if (!allowReselect && sessionId === currentSessionId) {
        onSessionSelected?.(sessionId);
        return;
      }
      setCurrentSession(sessionId);
      onSessionSelected?.(sessionId);
    },
    [
      allowReselect,
      currentSessionId,
      mobileVariant,
      onSessionSelected,
      setActiveMainTab,
      setCurrentSession,
      setSessionSwitcherOpen,
    ],
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

  const deleteSession = useSessionStore((state) => state.deleteSession);
  const deleteSessions = useSessionStore((state) => state.deleteSessions);

  const handleDeleteSession = React.useCallback(
    async (session: Session) => {
      const descendants = collectDescendants(session.id);
      if (descendants.length === 0) {

        const success = await deleteSession(session.id);
        if (success) {
          toast.success('Session deleted');
        } else {
          toast.error('Failed to delete session');
        }
      } else {

        const ids = [session.id, ...descendants.map((s) => s.id)];
        const { deletedIds, failedIds } = await deleteSessions(ids);
        if (deletedIds.length > 0) {
          toast.success(`Deleted ${deletedIds.length} session${deletedIds.length === 1 ? '' : 's'}`);
        }
        if (failedIds.length > 0) {
          toast.error(`Failed to delete ${failedIds.length} session${failedIds.length === 1 ? '' : 's'}`);
        }
      }
    },
    [collectDescendants, deleteSession, deleteSessions],
  );

  const handleCreateSessionInGroup = React.useCallback(
    (directory: string | null) => {
      setActiveMainTab('chat');
      if (mobileVariant) {
        setSessionSwitcherOpen(false);
      }
      openNewSessionDraft({ directoryOverride: directory ?? null });
    },
    [openNewSessionDraft, setActiveMainTab, setSessionSwitcherOpen, mobileVariant],
  );

  const handleOpenWorktreeManager = React.useCallback(() => {
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
      } catch { /* ignored */ }
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
    const existingWorktreePaths = new Set<string>();
    availableWorktrees.forEach((meta) => {
      if (meta.path) {
        const normalized = normalizePath(meta.path) ?? meta.path;
        existingWorktreePaths.add(normalized);
        worktreeByPath.set(normalized, meta);
      }
    });

    const ensureGroup = (session: Session) => {
      const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);

      const sessionWorktreeMeta = worktreeMetadata.get(session.id);
      const sessionWorktreeExists = sessionWorktreeMeta?.path
        ? existingWorktreePaths.has(normalizePath(sessionWorktreeMeta.path) ?? sessionWorktreeMeta.path)
        : false;
      const worktree =
        (sessionWorktreeExists ? sessionWorktreeMeta : null) ??
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
        groups.set(key, {
          id: key,
          label,
          description,
          isMain,
          worktree,
          directory,
          sessions: [],
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
    });

    if (!groups.has('main')) {
      groups.set('main', {
        id: 'main',
        label: 'Main workspace',
        description: normalizedProjectRoot ? formatPathForDisplay(normalizedProjectRoot, homeDirectory) : null,
        isMain: true,
        worktree: null,
        directory: normalizedProjectRoot,
        sessions: [],
      });
    }

    worktreeByPath.forEach((meta, path) => {
      const key = meta.path;
      if (!groups.has(key)) {
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
  }, [sortedSessions, worktreeMetadata, availableWorktrees, projectRoot, homeDirectory, buildNode, sessionMap]);

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
      } catch { /* ignored */ }
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

  // Track when sticky headers become "stuck" using sentinel elements
  React.useEffect(() => {
    if (!isDesktopRuntime) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const groupId = (entry.target as HTMLElement).dataset.groupId;
          if (!groupId) return;
          
          setStuckHeaders((prev) => {
            const next = new Set(prev);
            // When sentinel is NOT intersecting, header is stuck
            if (!entry.isIntersecting) {
              next.add(groupId);
            } else {
              next.delete(groupId);
            }
            return next;
          });
        });
      },
      { threshold: 0 }
    );

    headerSentinelRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isDesktopRuntime, groupedSessions]);

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
          <div
            key={session.id}
            className={cn(
              'group relative flex items-center rounded-md px-1.5 py-1',
              'dark:bg-accent/80 bg-primary/12',
              depth > 0 && 'pl-[20px]',
            )}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0">
              <form
                className="flex w-full items-center gap-2"
                data-keyboard-avoid="true"
                onSubmit={(event) => {
                  event.preventDefault();
                  handleSaveEdit();
                }}
              >
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="flex-1 min-w-0 bg-transparent typography-ui-label outline-none placeholder:text-muted-foreground"
                  autoFocus
                  placeholder="Rename session"
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') handleCancelEdit();
                  }}
                />
                <button
                  type="submit"
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RiCheckLine className="size-4" />
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <RiCloseLine className="size-4" />
                </button>
              </form>
              <div className="flex items-center gap-2 typography-micro text-muted-foreground/60 min-w-0 overflow-hidden leading-tight">
                {hasChildren ? (
                  <span className="inline-flex items-center justify-center flex-shrink-0">
                    {isExpanded ? (
                      <RiArrowDownSLine className="h-3 w-3" />
                    ) : (
                      <RiArrowRightSLine className="h-3 w-3" />
                    )}
                  </span>
                ) : null}
                <span className="flex-shrink-0">{formatDateLabel(session.time?.created || Date.now())}</span>
                {session.share ? (
                  <RiShare2Line className="h-3 w-3 text-[color:var(--status-info)] flex-shrink-0" />
                ) : null}
                {hasSummary && ((additions ?? 0) !== 0 || (deletions ?? 0) !== 0) ? (
                  <span className="flex-shrink-0 text-[0.7rem] leading-none">
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
              </div>
            </div>
          </div>
        );
      }

      const phase = sessionActivityPhase?.get(session.id) ?? 'idle';
      const isStreaming = phase === 'busy' || phase === 'cooldown';

      const streamingIndicator = (() => {
        if (!memoryState) return null;
        if (memoryState.isZombie) {
          return <RiErrorWarningLine className="h-4 w-4 text-warning" />;
        }
        return null;
      })();

      return (
        <React.Fragment key={session.id}>
          <div
            className={cn(
              'group relative flex items-center rounded-md px-1.5 py-1',
              isActive ? 'dark:bg-accent/80 bg-primary/12' : 'hover:dark:bg-accent/40 hover:bg-primary/6',
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
                  'flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 text-foreground',
                )}
              >
                {}
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span
                    className={cn(
                      'truncate typography-ui-label font-normal text-foreground',
                      isStreaming && 'animate-pulse [animation-duration:1.8s]'
                    )}
                  >
                    {sessionTitle}
                  </span>
                </div>

                {}
                <div className="flex items-center gap-2 typography-micro text-muted-foreground/60 min-w-0 overflow-hidden leading-tight">
                  {hasChildren ? (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        toggleParent(session.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleParent(session.id);
                        }
                      }}
                      className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex-shrink-0 rounded-sm"
                      aria-label={isExpanded ? 'Collapse subsessions' : 'Expand subsessions'}
                    >
                      {isExpanded ? (
                        <RiArrowDownSLine className="h-3 w-3" />
                      ) : (
                        <RiArrowRightSLine className="h-3 w-3" />
                      )}
                    </span>
                  ) : null}
                  <span className="flex-shrink-0">{formatDateLabel(session.time?.created || Date.now())}</span>
                  {session.share ? (
                    <RiShare2Line className="h-3 w-3 text-[color:var(--status-info)] flex-shrink-0" />
                  ) : null}
                  {hasSummary && ((additions ?? 0) !== 0 || (deletions ?? 0) !== 0) ? (
                    <span className="flex-shrink-0 text-[0.7rem] leading-none">
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
                {streamingIndicator}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-3.5 w-[18px] items-center justify-center rounded-md text-muted-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                        mobileVariant ? 'opacity-70' : 'opacity-0 group-hover:opacity-100',
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
    ],
  );

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground overflow-x-hidden',
        mobileVariant ? '' : isDesktopRuntime ? 'bg-transparent' : 'bg-sidebar',
      )}
    >
      {!hideDirectoryControls && (
        <div className="h-14 select-none px-2 flex-shrink-0">
          <div className="flex h-full items-center gap-0">
            <button
              type="button"
              onClick={handleOpenDirectoryDialog}
              className={cn(
                'group flex min-w-0 flex-1 items-center gap-2 rounded-md px-0 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                !isDesktopRuntime && 'hover:bg-sidebar/20',
              )}
              aria-label="Change project directory"
              title={directoryTooltip || '/'}
            >
              <span
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground group-hover:text-foreground',
                  !isDesktopRuntime && 'bg-sidebar/60',
                )}
              >
                <RiFolder6Line className="h-[1.125rem] w-[1.125rem] translate-y-px" />
              </span>
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate whitespace-nowrap typography-ui font-semibold text-muted-foreground group-hover:text-foreground">
                  {displayDirectory || '/'}
                </p>
              </div>
            </button>

            {isGitRepo ? (
              <>
                <button
                  type="button"
                  onClick={handleOpenWorktreeManager}
                  className={cn(
                    'inline-flex h-10 w-7 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    !isDesktopRuntime && 'bg-sidebar/60 hover:bg-sidebar',
                  )}
                  aria-label="Manage worktrees"
                  title="Manage worktrees"
                >
                  <RiGitRepositoryLine className="h-[1.125rem] w-[1.125rem] translate-y-px" />
                </button>
                <button
                  type="button"
                  onClick={openMultiRunLauncher}
                  className={cn(
                    'inline-flex h-10 w-7 flex-shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    !isDesktopRuntime && 'bg-sidebar/60 hover:bg-sidebar',
                  )}
                  aria-label="New Multi-Run"
                  title="New Multi-Run"
                >
                  <ArrowsMerge className="h-[1.125rem] w-[1.125rem] translate-y-px" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      )}

      <ScrollableOverlay
        outerClassName="flex-1 min-h-0"
        className={cn('space-y-1 pb-1 pl-2.5 pr-1', mobileVariant ? '' : '')}
      >
        {groupedSessions.length === 0 ? (
          emptyState
        ) : (hideDirectoryControls && groupedSessions.length === 1 && groupedSessions[0].isMain) || showOnlyMainWorkspace ? (
          <div className="space-y-[0.6rem] py-1">
            {(() => {
              const group = groupedSessions.find(g => g.isMain) ?? groupedSessions[0];
              const maxVisible = hideDirectoryControls ? 10 : 7;
              const totalSessions = group.sessions.length;
              const isExpanded = expandedSessionGroups.has(group.id);
              const visibleSessions = isExpanded ? group.sessions : group.sessions.slice(0, maxVisible);
              const remainingCount = totalSessions - visibleSessions.length;

              if (totalSessions === 0) {
                return (
                  <div className="py-1 text-left typography-micro text-muted-foreground">
                    No sessions yet.
                  </div>
                );
              }

              return (
                <>
                  {visibleSessions.map((node) => renderSessionNode(node, 0, group.directory))}
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
        ) : (
          groupedSessions.map((group) => (
            <div key={group.id} className="relative">
              {/* Sentinel element to detect when header becomes stuck */}
              {isDesktopRuntime && (
                <div
                  ref={(el) => { headerSentinelRefs.current.set(group.id, el); }}
                  data-group-id={group.id}
                  className="absolute top-0 h-px w-full pointer-events-none"
                  aria-hidden="true"
                />
              )}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className={cn(
                  'sticky top-0 z-10 pt-1.5 pb-1 w-full text-left cursor-pointer group/header border-b transition-colors duration-150',
                  isDesktopRuntime
                    ? stuckHeaders.has(group.id) ? 'bg-sidebar' : 'bg-transparent'
                    : 'bg-sidebar',
                )}
                style={{
                  borderColor: hoveredGroupId === group.id
                    ? 'var(--color-border)'
                    : collapsedGroups.has(group.id)
                      ? 'color-mix(in srgb, var(--color-border) 35%, transparent)'
                      : 'var(--color-border)'
                }}
                onMouseEnter={() => setHoveredGroupId(group.id)}
                onMouseLeave={() => setHoveredGroupId(null)}
                aria-label={collapsedGroups.has(group.id) ? 'Expand group' : 'Collapse group'}
              >
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="typography-micro font-medium text-muted-foreground truncate group-hover/header:text-foreground">
                    {group.label}
                  </span>
                  {!hideDirectoryControls && (
                    <span
                      role="button"
                      tabIndex={0}
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-md text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:text-foreground',
                      )}
                      aria-label="Create session in this group"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateSessionInGroup(group.directory);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.stopPropagation();
                          handleCreateSessionInGroup(group.directory);
                        }
                      }}
                    >
                      <RiAddLine className="h-4.5 w-4.5" />
                    </span>
                  )}
                </div>
              </button>

              {}
              {!collapsedGroups.has(group.id) ? (
                <div className="space-y-[0.6rem] py-1">
                  {(() => {
                    const isExpanded = expandedSessionGroups.has(group.id);
                    const maxVisible = hideDirectoryControls ? 10 : 7;
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
