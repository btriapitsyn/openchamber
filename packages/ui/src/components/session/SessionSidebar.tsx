import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import { toast } from 'sonner';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiGitRepositoryLine,
  RiLinkUnlinkM,
  RiMore2Line,
  RiPencilAiLine,
  RiShare2Line,
  RiShieldLine,
} from '@remixicon/react';
import { sessionEvents } from '@/lib/sessionEvents';
import { ArrowsMerge } from '@/components/icons/ArrowsMerge';
import { formatDirectoryName, formatPathForDisplay, cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useUIStore } from '@/stores/useUIStore';
import type { WorktreeMetadata } from '@/types/worktree';
import { opencodeClient } from '@/lib/opencode/client';
import { checkIsGitRepository } from '@/lib/gitApi';
import { getSafeStorage } from '@/stores/utils/safeStorage';

const GROUP_COLLAPSE_STORAGE_KEY = 'oc.sessions.groupCollapse';
const PROJECT_COLLAPSE_STORAGE_KEY = 'oc.sessions.projectCollapse';
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

// Format project label: kebab-case/snake_case → Title Case
const formatProjectLabel = (label: string): string => {
  return label
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

interface SortableProjectItemProps {
  id: string;
  projectLabel: string;
  projectDescription: string;
  isCollapsed: boolean;
  isActiveProject: boolean;
  isRepo: boolean;
  isHovered: boolean;
  isDesktopRuntime: boolean;
  isStuck: boolean;
  hideDirectoryControls: boolean;
  mobileVariant: boolean;
  onToggle: () => void;
  onHoverChange: (hovered: boolean) => void;
  onOpenWorktreeManager: () => void;
  onOpenMultiRunLauncher: () => void;
  onClose: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
}

const SortableProjectItem: React.FC<SortableProjectItemProps> = ({
  id,
  projectLabel,
  projectDescription,
  isCollapsed,
  isActiveProject,
  isRepo,
  isHovered,
  isDesktopRuntime,
  isStuck,
  hideDirectoryControls,
  mobileVariant,
  onToggle,
  onHoverChange,
  onOpenWorktreeManager,
  onOpenMultiRunLauncher,
  onClose,
  sentinelRef,
  children,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id });

  return (
    <div ref={setNodeRef} className={cn('relative', isDragging && 'opacity-40')}>
      {/* Sentinel for sticky detection */}
      {isDesktopRuntime && (
        <div
          ref={sentinelRef}
          data-project-id={id}
          className="absolute top-0 h-px w-full pointer-events-none"
          aria-hidden="true"
        />
      )}
      
      {/* Project header - sticky like workspace groups */}
      <div
        className={cn(
          'sticky top-0 z-10 pt-2 pb-1.5 w-full text-left cursor-pointer group/project border-b',
          !isDesktopRuntime && 'bg-sidebar',
        )}
        style={{
          backgroundColor: isDesktopRuntime
            ? isStuck ? 'var(--sidebar-stuck-bg)' : 'transparent'
            : undefined,
          borderColor: isHovered
            ? 'var(--color-border)'
            : isCollapsed
              ? 'color-mix(in srgb, var(--color-border) 35%, transparent)'
              : 'var(--color-border)'
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
      >
        <div className="relative flex items-center gap-1 px-1" {...attributes}>
          {/* Project name with tooltip for path - draggable */}
          <Tooltip delayDuration={1500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                {...listeners}
                className="flex-1 min-w-0 flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-sm cursor-grab active:cursor-grabbing"
              >
                <span className={cn(
                  "typography-ui font-semibold truncate",
                  isActiveProject ? "text-primary" : "text-foreground group-hover/project:text-foreground"
                )}>
                  {projectLabel}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {projectDescription}
            </TooltipContent>
          </Tooltip>

          {/* Project menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:text-foreground',
                  mobileVariant ? 'opacity-70' : 'opacity-0 group-hover/project:opacity-100',
                )}
                aria-label="Project menu"
                onClick={(e) => e.stopPropagation()}
              >
                <RiMore2Line className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {isRepo && !hideDirectoryControls && (
                <>
                  <DropdownMenuItem onClick={onOpenWorktreeManager}>
                    <RiGitRepositoryLine className="mr-1.5 h-4 w-4" />
                    Manage Worktrees
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onOpenMultiRunLauncher}>
                    <ArrowsMerge className="mr-1.5 h-4 w-4" />
                    New Multi-Run
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem
                onClick={onClose}
                className="text-destructive focus:text-destructive"
              >
                <RiCloseLine className="mr-1.5 h-4 w-4" />
                Close Project
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Collapse arrow */}
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground flex-shrink-0"
            aria-label={isCollapsed ? 'Expand project' : 'Collapse project'}
          >
            {isCollapsed ? (
              <RiArrowRightSLine className="h-4 w-4" />
            ) : (
              <RiArrowDownSLine className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {/* Children (workspace groups and sessions) */}
      {children}
    </div>
  );
};

// Drag overlay component - shows only the header during drag
interface ProjectDragOverlayProps {
  projectLabel: string;
  isActiveProject: boolean;
  isCollapsed: boolean;
}

const ProjectDragOverlay: React.FC<ProjectDragOverlayProps> = ({
  projectLabel,
  isActiveProject,
  isCollapsed,
}) => {
  return (
    <div
      className="bg-sidebar border border-border rounded-md shadow-lg px-2 py-1.5"
      style={{ width: 'max-content', maxWidth: '280px' }}
    >
      <div className="flex items-center gap-2">
        <span className={cn(
          "typography-ui font-semibold truncate",
          isActiveProject ? "text-primary" : "text-foreground"
        )}>
          {projectLabel}
        </span>
        <span className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground ml-auto">
          {isCollapsed ? (
            <RiArrowRightSLine className="h-4 w-4" />
          ) : (
            <RiArrowDownSLine className="h-4 w-4" />
          )}
        </span>
      </div>
    </div>
  );
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
  const [collapsedProjects, setCollapsedProjects] = React.useState<Set<string>>(new Set());
  const [pendingProjectClose, setPendingProjectClose] = React.useState<{
    id: string;
    label: string;
  } | null>(null);
  const [projectRepoStatus, setProjectRepoStatus] = React.useState<Map<string, boolean | null>>(new Map());
  const [expandedSessionGroups, setExpandedSessionGroups] = React.useState<Set<string>>(new Set());
  const [hoveredGroupId, setHoveredGroupId] = React.useState<string | null>(null);
  const [hoveredProjectId, setHoveredProjectId] = React.useState<string | null>(null);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [stuckHeaders, setStuckHeaders] = React.useState<Set<string>>(new Set());
  const [stuckProjectHeaders, setStuckProjectHeaders] = React.useState<Set<string>>(new Set());
  const headerSentinelRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const projectHeaderSentinelRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const ignoreIntersectionUntil = React.useRef<number>(0);

  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);

  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const addProject = useProjectsStore((state) => state.addProject);
  const removeProject = useProjectsStore((state) => state.removeProject);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);
  const setActiveProjectIdOnly = useProjectsStore((state) => state.setActiveProjectIdOnly);
  const reorderProjects = useProjectsStore((state) => state.reorderProjects);

  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const openMultiRunLauncher = useUIStore((state) => state.openMultiRunLauncher);

  const sessions = useSessionStore((state) => state.sessions);
  const sessionsByDirectory = useSessionStore((state) => state.sessionsByDirectory);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);
  const shareSession = useSessionStore((state) => state.shareSession);
  const unshareSession = useSessionStore((state) => state.unshareSession);
  const sessionMemoryState = useSessionStore((state) => state.sessionMemoryState);
  const sessionActivityPhase = useSessionStore((state) => state.sessionActivityPhase);
  const permissions = useSessionStore((state) => state.permissions);
  const worktreeMetadata = useSessionStore((state) => state.worktreeMetadata);
  const availableWorktreesByProject = useSessionStore((state) => state.availableWorktreesByProject);
  const getSessionsByDirectory = useSessionStore((state) => state.getSessionsByDirectory);
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
      const storedProjects = safeStorage.getItem(PROJECT_COLLAPSE_STORAGE_KEY);
      if (storedProjects) {
        const parsed = JSON.parse(storedProjects);
        if (Array.isArray(parsed)) {
          setCollapsedProjects(new Set(parsed.filter((item) => typeof item === 'string')));
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

  const sortedSessions = React.useMemo(() => {
    return [...sessions].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  }, [sessions]);

  React.useEffect(() => {
    let cancelled = false;
    const normalizedProjects = projects
      .map((project) => ({ id: project.id, path: normalizePath(project.path) }))
      .filter((project): project is { id: string; path: string } => Boolean(project.path));

    setProjectRepoStatus(new Map());

    if (normalizedProjects.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    normalizedProjects.forEach((project) => {
      checkIsGitRepository(project.path)
        .then((result) => {
          if (!cancelled) {
            setProjectRepoStatus((prev) => {
              const next = new Map(prev);
              next.set(project.id, result);
              return next;
            });
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProjectRepoStatus((prev) => {
              const next = new Map(prev);
              next.set(project.id, null);
              return next;
            });
          }
        });
    });

    return () => {
      cancelled = true;
    };
  }, [projects]);

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

  React.useEffect(() => {
    const directories = new Set<string>();
    sortedSessions.forEach((session) => {
      const dir = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
      if (dir) {
        directories.add(dir);
      }
    });
    projects.forEach((project) => {
      const normalized = normalizePath(project.path);
      if (normalized) {
        directories.add(normalized);
      }
    });

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
  }, [sortedSessions, projects, directoryStatus]);

  React.useEffect(() => {
    return () => {
      if (copyTimeout.current) {
        clearTimeout(copyTimeout.current);
      }
    };
  }, []);


  const emptyState = (
    <div className="py-6 text-center text-muted-foreground">
      <p className="typography-ui-label font-semibold">No sessions yet</p>
      <p className="typography-meta mt-1">Create your first session to start coding.</p>
    </div>
  );

  const handleSessionSelect = React.useCallback(
    (sessionId: string, sessionDirectory?: string | null, disabled?: boolean, projectId?: string | null) => {
      if (disabled) {
        return;
      }

      if (projectId && projectId !== activeProjectId) {
        // Important: avoid switching to the project root first (that can select the wrong session).
        setActiveProjectIdOnly(projectId);
      }

      if (sessionDirectory && sessionDirectory !== currentDirectory) {
        setDirectory(sessionDirectory, { showOverlay: false });
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
      activeProjectId,
      allowReselect,
      currentDirectory,
      currentSessionId,
      mobileVariant,
      onSessionSelected,
      setActiveMainTab,
      setActiveProjectIdOnly,
      setCurrentSession,
      setDirectory,
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
    (directory: string | null, projectId?: string | null) => {
      if (projectId && projectId !== activeProjectId) {
        setActiveProject(projectId);
      }
      setActiveMainTab('chat');
      if (mobileVariant) {
        setSessionSwitcherOpen(false);
      }
      openNewSessionDraft({ directoryOverride: directory ?? null });
    },
    [activeProjectId, openNewSessionDraft, setActiveMainTab, setActiveProject, setSessionSwitcherOpen, mobileVariant],
  );

  const handleOpenWorktreeManager = React.useCallback(
    (projectId?: string | null) => {
      if (projectId && projectId !== activeProjectId) {
        setActiveProjectIdOnly(projectId);
      }
      sessionEvents.requestCreate({ worktreeMode: 'create', projectId: projectId ?? null });
    },
    [activeProjectId, setActiveProjectIdOnly],
  );

  const handleOpenDirectoryDialog = React.useCallback(() => {
    if (isDesktopRuntime && window.opencodeDesktop?.requestDirectoryAccess) {
      window.opencodeDesktop
        .requestDirectoryAccess('')
        .then((result) => {
          if (result.success && result.path) {
            const added = addProject(result.path, { id: result.projectId });
            if (!added) {
              toast.error('Failed to add project', {
                description: 'Please select a valid directory.',
              });
            }
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
  }, [addProject, isDesktopRuntime]);

  const confirmPendingProjectClose = React.useCallback(() => {
    const pending = pendingProjectClose;
    if (!pending) {
      return;
    }

    removeProject(pending.id);
    setPendingProjectClose(null);
    toast.success('Project closed', { description: pending.label });
  }, [pendingProjectClose, removeProject]);

  const cancelPendingProjectClose = React.useCallback(() => {
    setPendingProjectClose(null);
  }, []);

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


  const buildGroupedSessions = React.useCallback(
    (projectSessions: Session[], projectRoot: string | null, availableWorktrees: WorktreeMetadata[]) => {
      const groups = new Map<string, SessionGroup>();
      const normalizedProjectRoot = normalizePath(projectRoot ?? null);
      const sortedProjectSessions = [...projectSessions].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));

      const sessionMap = new Map(sortedProjectSessions.map((session) => [session.id, session]));
      const childrenMap = new Map<string, Session[]>();
      sortedProjectSessions.forEach((session) => {
        const parentID = (session as Session & { parentID?: string | null }).parentID;
        if (!parentID) {
          return;
        }
        const collection = childrenMap.get(parentID) ?? [];
        collection.push(session);
        childrenMap.set(parentID, collection);
      });
      childrenMap.forEach((list) => list.sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0)));

      const buildProjectNode = (session: Session): SessionNode => {
        const children = childrenMap.get(session.id) ?? [];
        return {
          session,
          children: children.map((child) => buildProjectNode(child)),
        };
      };

      const worktreeByPath = new Map<string, WorktreeMetadata>();
      availableWorktrees.forEach((meta) => {
        if (meta.path) {
          const normalized = normalizePath(meta.path) ?? meta.path;
          worktreeByPath.set(normalized, meta);
        }
      });

      const ensureGroup = (session: Session) => {
        const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);

        const sessionWorktreeMeta = worktreeMetadata.get(session.id) ?? null;
        const worktree =
          sessionWorktreeMeta ??
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

      const roots = sortedProjectSessions.filter((session) => {
        const parentID = (session as Session & { parentID?: string | null }).parentID;
        if (!parentID) {
          return true;
        }
        return !sessionMap.has(parentID);
      });

      roots.forEach((session) => {
        const group = ensureGroup(session);
        const node = buildProjectNode(session);
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
    },
    [homeDirectory, worktreeMetadata]
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

  const toggleProject = React.useCallback((projectId: string) => {
    // Ignore intersection events for a short period after toggling
    ignoreIntersectionUntil.current = Date.now() + 150;
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      try {
        safeStorage.setItem(PROJECT_COLLAPSE_STORAGE_KEY, JSON.stringify(Array.from(next)));
      } catch { /* ignored */ }
      return next;
    });
  }, [safeStorage]);

  const normalizedProjects = React.useMemo(() => {
    return projects
      .map((project) => ({
        ...project,
        normalizedPath: normalizePath(project.path),
      }))
      .filter((project) => Boolean(project.normalizedPath)) as Array<{
        id: string;
        path: string;
        label?: string;
        normalizedPath: string;
      }>;
  }, [projects]);

  const getSessionsForProject = React.useCallback(
    (project: { normalizedPath: string }) => {
      const worktreesForProject = availableWorktreesByProject.get(project.normalizedPath) ?? [];
      const directories = [
        project.normalizedPath,
        ...worktreesForProject
          .map((meta) => normalizePath(meta.path) ?? meta.path)
          .filter((value): value is string => Boolean(value)),
      ];

      const seen = new Set<string>();
      const collected: Session[] = [];

      directories.forEach((directory) => {
        const sessionsForDirectory = sessionsByDirectory.get(directory) ?? getSessionsByDirectory(directory);
        sessionsForDirectory.forEach((session) => {
          if (seen.has(session.id)) {
            return;
          }
          seen.add(session.id);
          collected.push(session);
        });
      });

      return collected;
    },
    [availableWorktreesByProject, getSessionsByDirectory, sessionsByDirectory],
  );

  const projectSections = React.useMemo(() => {
    return normalizedProjects.map((project) => {
      const projectSessions = getSessionsForProject(project);
      const worktreesForProject = availableWorktreesByProject.get(project.normalizedPath) ?? [];
      const groups = buildGroupedSessions(projectSessions, project.normalizedPath, worktreesForProject);
      return {
        project,
        groups,
      };
    });
  }, [normalizedProjects, getSessionsForProject, buildGroupedSessions, availableWorktreesByProject]);

  // Track when sticky headers become "stuck" using sentinel elements
  React.useEffect(() => {
    if (!isDesktopRuntime) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Ignore intersection events shortly after collapse/expand
        if (Date.now() < ignoreIntersectionUntil.current) return;
        
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
      { threshold: 0, rootMargin: '-96px 0px 0px 0px' }
    );

    // Small delay to let DOM settle after collapse/expand
    const timeoutId = setTimeout(() => {
      headerSentinelRefs.current.forEach((el) => {
        if (el) observer.observe(el);
      });
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [isDesktopRuntime, projectSections, collapsedProjects]);

  // Track when project sticky headers become "stuck"
  React.useEffect(() => {
    if (!isDesktopRuntime) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const projectId = (entry.target as HTMLElement).dataset.projectId;
          if (!projectId) return;
          
          setStuckProjectHeaders((prev) => {
            const next = new Set(prev);
            if (!entry.isIntersecting) {
              next.add(projectId);
            } else {
              next.delete(projectId);
            }
            return next;
          });
        });
      },
      { threshold: 0 }
    );

    projectHeaderSentinelRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [isDesktopRuntime, projectSections]);

  const renderSessionNode = React.useCallback(
    (node: SessionNode, depth = 0, groupDirectory?: string | null, projectId?: string | null): React.ReactNode => {
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
      const pendingPermissionCount = permissions.get(session.id)?.length ?? 0;

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
                onClick={() => handleSessionSelect(session.id, sessionDirectory, isMissingDirectory, projectId)}
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

                  {pendingPermissionCount > 0 ? (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1 py-0.5 text-[0.7rem] text-destructive flex-shrink-0"
                      title="Permission required"
                      aria-label="Permission required"
                    >
                      <RiShieldLine className="h-3 w-3" />
                      <span className="leading-none">{pendingPermissionCount}</span>
                    </span>
                  ) : null}
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
                renderSessionNode(child, depth + 1, sessionDirectory ?? groupDirectory, projectId),
              )
            : null}
        </React.Fragment>
      );
    },
    [
      directoryStatus,
      sessionMemoryState,
      sessionActivityPhase,
      permissions,
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

  const renderGroupSessions = React.useCallback(
    (group: SessionGroup, groupKey: string, projectId?: string | null) => {
      const isExpanded = expandedSessionGroups.has(groupKey);
      const maxVisible = hideDirectoryControls ? 10 : 5;
      const totalSessions = group.sessions.length;
      const visibleSessions = isExpanded ? group.sessions : group.sessions.slice(0, maxVisible);
      const remainingCount = totalSessions - visibleSessions.length;

      return (
        <>
          {visibleSessions.map((node) => renderSessionNode(node, 0, group.directory, projectId))}
          {totalSessions === 0 ? (
            <div className="py-1 text-left typography-micro text-muted-foreground">
              No sessions in this workspace yet.
            </div>
          ) : null}
          {remainingCount > 0 && !isExpanded ? (
            <button
              type="button"
              onClick={() => toggleGroupSessionLimit(groupKey)}
              className="mt-0.5 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
            >
              Show {remainingCount} more {remainingCount === 1 ? 'session' : 'sessions'}
            </button>
          ) : null}
          {isExpanded && totalSessions > maxVisible ? (
            <button
              type="button"
              onClick={() => toggleGroupSessionLimit(groupKey)}
              className="mt-0.5 flex items-center justify-start rounded-md px-1.5 py-0.5 text-left text-xs text-muted-foreground/70 leading-tight hover:text-foreground hover:underline"
            >
              Show fewer sessions
            </button>
          ) : null}
        </>
      );
    },
    [expandedSessionGroups, hideDirectoryControls, renderSessionNode, toggleGroupSessionLimit]
  );

  // DnD sensors for project reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = React.useCallback(
    (event: DragStartEvent) => {
      setActiveDragId(event.active.id as string);
    },
    []
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveDragId(null);
      
      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = normalizedProjects.findIndex((p) => p.id === active.id);
      const newIndex = normalizedProjects.findIndex((p) => p.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderProjects(oldIndex, newIndex);
      }
    },
    [normalizedProjects, reorderProjects]
  );

  const handleDragCancel = React.useCallback(() => {
    setActiveDragId(null);
  }, []);

  // Get the active dragging project for the overlay
  const activeDragProject = React.useMemo(() => {
    if (!activeDragId) return null;
    const section = projectSections.find((s) => s.project.id === activeDragId);
    if (!section) return null;
    const project = section.project;
    return {
      id: project.id,
      label: formatProjectLabel(
        project.label?.trim()
          || formatDirectoryName(project.normalizedPath, homeDirectory)
          || project.normalizedPath
      ),
      isActive: project.id === activeProjectId,
      isCollapsed: collapsedProjects.has(project.id),
    };
  }, [activeDragId, projectSections, homeDirectory, activeProjectId, collapsedProjects]);

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground overflow-x-hidden',
        mobileVariant ? '' : isDesktopRuntime ? 'bg-transparent' : 'bg-sidebar',
      )}
    >
      {!hideDirectoryControls && (
        <div className="h-8 select-none pl-3.5 pr-2 flex-shrink-0">
          <div className="flex h-full items-center justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <p className="typography-ui-label font-medium text-muted-foreground">Projects</p>
              <span className="typography-micro text-muted-foreground/50">
                {projects.length}
              </span>
            </div>
            <button
              type="button"
              onClick={handleOpenDirectoryDialog}
              className={cn(
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                !isDesktopRuntime && 'bg-sidebar/60 hover:bg-sidebar',
              )}
              aria-label="Add project"
              title="Add project"
            >
              <RiAddLine className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <ScrollableOverlay
        outerClassName="flex-1 min-h-0"
        className={cn('space-y-1 pb-1 pl-2.5 pr-1', mobileVariant ? '' : '')}
      >
        {projectSections.length === 0 ? (
          emptyState
        ) : showOnlyMainWorkspace ? (
          <div className="space-y-[0.6rem] py-1">
            {(() => {
              const activeSection = projectSections.find((section) => section.project.id === activeProjectId) ?? projectSections[0];
              if (!activeSection) {
                return emptyState;
              }
              // VS Code sessions view typically only shows one workspace, but sessions may live in worktrees or
              // canonicalized paths. Prefer the main group if it has sessions; otherwise fall back to any group
              // that contains sessions so we don't show an empty list when sessions exist.
              const group =
                activeSection.groups.find((candidate) => candidate.isMain && candidate.sessions.length > 0)
                ?? activeSection.groups.find((candidate) => candidate.sessions.length > 0)
                ?? activeSection.groups.find((candidate) => candidate.isMain)
                ?? activeSection.groups[0];
              if (!group) {
                return (
                  <div className="py-1 text-left typography-micro text-muted-foreground">
                    No sessions yet.
                  </div>
                );
              }
              const groupKey = `${activeSection.project.id}:${group.id}`;
              return renderGroupSessions(group, groupKey, activeSection.project.id);
            })()}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <SortableContext
              items={normalizedProjects.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              {projectSections.map((section) => {
                const project = section.project;
                const projectKey = project.id;
                const projectLabel = formatProjectLabel(
                  project.label?.trim()
                    || formatDirectoryName(project.normalizedPath, homeDirectory)
                    || project.normalizedPath
                );
                const projectDescription = formatPathForDisplay(project.normalizedPath, homeDirectory);
                const isCollapsed = collapsedProjects.has(projectKey);
                const isActiveProject = projectKey === activeProjectId;
                const isRepo = projectRepoStatus.get(projectKey);
                const isHovered = hoveredProjectId === projectKey;

                return (
                  <SortableProjectItem
                    key={projectKey}
                    id={projectKey}
                    projectLabel={projectLabel}
                    projectDescription={projectDescription}
                    isCollapsed={isCollapsed}
                    isActiveProject={isActiveProject}
                    isRepo={Boolean(isRepo)}
                    isHovered={isHovered}
                    isDesktopRuntime={isDesktopRuntime}
                    isStuck={stuckProjectHeaders.has(projectKey)}
                    hideDirectoryControls={hideDirectoryControls}
                    mobileVariant={mobileVariant}
                    onToggle={() => toggleProject(projectKey)}
                    onHoverChange={(hovered) => setHoveredProjectId(hovered ? projectKey : null)}
                    onOpenWorktreeManager={() => handleOpenWorktreeManager(projectKey)}
                    onOpenMultiRunLauncher={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      openMultiRunLauncher();
                    }}
                    onClose={() => setPendingProjectClose({ id: projectKey, label: projectLabel })}
                    sentinelRef={(el) => { projectHeaderSentinelRefs.current.set(projectKey, el); }}
                  >
                    {!isCollapsed ? (
                      <div className="space-y-2 pl-1">
                        {section.groups.map((group) => {
                          const groupKey = `${projectKey}:${group.id}`;
                          return (
                            <div key={groupKey} className="relative">
                              {isDesktopRuntime && (
                                <div
                                  ref={(el) => { headerSentinelRefs.current.set(groupKey, el); }}
                                  data-group-id={groupKey}
                                  className="absolute top-0 h-px w-full pointer-events-none"
                                  aria-hidden="true"
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => toggleGroup(groupKey)}
                                className={cn(
                                  'sticky top-[38px] z-[9] pt-1.5 pb-1 w-full text-left cursor-pointer group/header border-b',
                                  !isDesktopRuntime && 'bg-sidebar',
                                )}
                                style={{
                                  backgroundColor: isDesktopRuntime
                                    ? stuckHeaders.has(groupKey) ? 'var(--sidebar-stuck-bg)' : 'transparent'
                                    : undefined,
                                  borderColor: hoveredGroupId === groupKey
                                    ? 'var(--color-border)'
                                    : collapsedGroups.has(groupKey)
                                      ? 'color-mix(in srgb, var(--color-border) 35%, transparent)'
                                      : 'var(--color-border)'
                                }}
                                onMouseEnter={() => setHoveredGroupId(groupKey)}
                                onMouseLeave={() => setHoveredGroupId(null)}
                                aria-label={collapsedGroups.has(groupKey) ? 'Expand group' : 'Collapse group'}
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
                                        handleCreateSessionInGroup(group.directory, projectKey);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                          e.stopPropagation();
                                          handleCreateSessionInGroup(group.directory, projectKey);
                                        }
                                      }}
                                    >
                                      <RiAddLine className="h-4.5 w-4.5" />
                                    </span>
                                  )}
                                </div>
                              </button>

                              {!collapsedGroups.has(groupKey) ? (
                                <div className="space-y-[0.6rem] py-1">
                                  {renderGroupSessions(group, groupKey, projectKey)}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </SortableProjectItem>
                );
              })}
            </SortableContext>
            <DragOverlay>
              {activeDragProject ? (
                <ProjectDragOverlay
                  projectLabel={activeDragProject.label}
                  isActiveProject={activeDragProject.isActive}
                  isCollapsed={activeDragProject.isCollapsed}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </ScrollableOverlay>

      <Dialog
        open={pendingProjectClose !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingProjectClose(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Close project?</DialogTitle>
            <DialogDescription>
              This removes it from the sidebar. You can add it again later.
            </DialogDescription>
          </DialogHeader>

          <div className="typography-ui font-medium">
            {pendingProjectClose?.label}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="secondary" onClick={cancelPendingProjectClose}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirmPendingProjectClose}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
