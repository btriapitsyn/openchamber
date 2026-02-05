import React from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import { toast } from '@/components/ui';
import { isDesktopShell, isTauriShell } from '@/lib/desktop';
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

import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { GridLoader } from '@/components/ui/grid-loader';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiErrorWarningLine,
  RiFileCopyLine,
  RiFolderAddLine,
  RiGitBranchLine,
  RiGitPullRequestLine,
  RiGitRepositoryLine,
  RiLinkUnlinkM,

  RiGithubLine,

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
import { useConfigStore } from '@/stores/useConfigStore';
import type { WorktreeMetadata } from '@/types/worktree';
import { opencodeClient } from '@/lib/opencode/client';
import { checkIsGitRepository } from '@/lib/gitApi';
import { getSafeStorage } from '@/stores/utils/safeStorage';
import { createWorktreeSession } from '@/lib/worktreeSessionCreator';
import { isVSCodeRuntime } from '@/lib/desktop';
import { updateDesktopSettings } from '@/lib/persistence';
import { BranchPickerDialog } from './BranchPickerDialog';
import { GitHubIssuePickerDialog } from './GitHubIssuePickerDialog';
import { GitHubPullRequestPickerDialog } from './GitHubPullRequestPickerDialog';

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
  worktree: WorktreeMetadata | null;
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
  isDesktopShell: boolean;
  isStuck: boolean;
  hideDirectoryControls: boolean;
  mobileVariant: boolean;
  onToggle: () => void;
  onHoverChange: (hovered: boolean) => void;
  onNewSession: () => void;
  onNewWorktreeSession?: () => void;
  onOpenBranchPicker?: () => void;
  onNewSessionFromGitHubIssue?: () => void;
  onNewSessionFromGitHubPR?: () => void;
  onOpenMultiRunLauncher: () => void;
  onRenameStart: () => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;
  onRenameValueChange: (value: string) => void;
  renameValue: string;
  isRenaming: boolean;
  onClose: () => void;
  sentinelRef: (el: HTMLDivElement | null) => void;
  children?: React.ReactNode;
  settingsAutoCreateWorktree: boolean;
}

const SortableProjectItem: React.FC<SortableProjectItemProps> = ({
  id,
  projectLabel,
  projectDescription,
  isCollapsed,
  isActiveProject,
  isRepo,
  isHovered,
  isDesktopShell,
  isStuck,
  hideDirectoryControls,
  mobileVariant,
  onToggle,
  onHoverChange,
  onNewSession,
  onNewWorktreeSession,
  onOpenBranchPicker,
  onNewSessionFromGitHubIssue,
  onNewSessionFromGitHubPR,
  onOpenMultiRunLauncher,
  onRenameStart,
  onRenameSave,
  onRenameCancel,
  onRenameValueChange,
  renameValue,
  isRenaming,
  onClose,
  sentinelRef,
  children,
  settingsAutoCreateWorktree,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id });

  const [isMenuOpen, setIsMenuOpen] = React.useState(false);

  return (
    <div ref={setNodeRef} className={cn('relative', isDragging && 'opacity-40')}>
      {/* Sentinel for sticky detection */}
      {isDesktopShell && (
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
          'sticky top-0 z-10 pt-2 pb-1.5 w-full text-left cursor-pointer group/project border-b select-none',
          !isDesktopShell && 'bg-sidebar',
        )}
        style={{
          backgroundColor: isDesktopShell
            ? isStuck ? 'var(--sidebar-stuck-bg)' : 'transparent'
            : undefined,
          borderColor: isHovered
            ? 'var(--color-border-hover)'
            : isCollapsed
              ? 'color-mix(in srgb, var(--color-border) 35%, transparent)'
              : 'var(--color-border)'
        }}
        onMouseEnter={() => onHoverChange(true)}
        onMouseLeave={() => onHoverChange(false)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (!isRenaming) {
            setIsMenuOpen(true);
          }
        }}
      >
        <div className="relative flex items-center gap-1 px-1" {...attributes}>
          {isRenaming ? (
            <form
              className="flex min-w-0 flex-1 items-center gap-2"
              data-keyboard-avoid="true"
              onSubmit={(event) => {
                event.preventDefault();
                onRenameSave();
              }}
            >
              <input
                value={renameValue}
                onChange={(event) => onRenameValueChange(event.target.value)}
                className="flex-1 min-w-0 bg-transparent typography-ui-label outline-none placeholder:text-muted-foreground"
                autoFocus
                placeholder="Rename project"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    onRenameCancel();
                  }
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
                onClick={onRenameCancel}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <RiCloseLine className="size-4" />
              </button>
            </form>
          ) : (
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
          )}

          {!isRenaming ? (
            <DropdownMenu
              open={isMenuOpen}
              onOpenChange={setIsMenuOpen}
            >
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
                {isRepo && !hideDirectoryControls && settingsAutoCreateWorktree && onNewSession && (
                  <DropdownMenuItem onClick={onNewSession}>
                    <RiAddLine className="mr-1.5 h-4 w-4" />
                    New Session
                  </DropdownMenuItem>
                )}
                {isRepo && !hideDirectoryControls && !settingsAutoCreateWorktree && onNewWorktreeSession && (
                  <DropdownMenuItem onClick={onNewWorktreeSession}>
                    <RiGitBranchLine className="mr-1.5 h-4 w-4" />
                    New Session in Worktree
                  </DropdownMenuItem>
                )}
                {isRepo && !hideDirectoryControls && onNewSessionFromGitHubIssue && (
                  <DropdownMenuItem onClick={onNewSessionFromGitHubIssue}>
                    <RiGithubLine className="mr-1.5 h-4 w-4" />
                    New session from GitHub issue
                  </DropdownMenuItem>
                )}
                {isRepo && !hideDirectoryControls && onNewSessionFromGitHubPR && (
                  <DropdownMenuItem onClick={onNewSessionFromGitHubPR}>
                    <RiGitPullRequestLine className="mr-1.5 h-4 w-4" />
                    New session from GitHub PR
                  </DropdownMenuItem>
                )}
                {isRepo && !hideDirectoryControls && (
                  <DropdownMenuItem onClick={onOpenMultiRunLauncher}>
                    <ArrowsMerge className="mr-1.5 h-4 w-4" />
                    New Multi-Run
                  </DropdownMenuItem>
                )}
                {isRepo && !hideDirectoryControls && onOpenBranchPicker && (
                  <DropdownMenuItem onClick={onOpenBranchPicker}>
                    <RiGitRepositoryLine className="mr-1.5 h-4 w-4" />
                    Manage Branches
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onRenameStart}>
                  <RiPencilAiLine className="mr-1.5 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={onClose}
                  className="text-destructive focus:text-destructive"
                >
                  <RiCloseLine className="mr-1.5 h-4 w-4" />
                  Close Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}

          {isRepo && !hideDirectoryControls && onNewWorktreeSession && settingsAutoCreateWorktree && !isRenaming && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewWorktreeSession();
                  }}
                  className={cn(
                    'inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 hover:text-foreground hover:bg-interactive-hover/50 flex-shrink-0',
                    mobileVariant ? 'opacity-70' : 'opacity-100',
                  )}
                  aria-label="New session in worktree"
                >
                  <RiGitBranchLine className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p>New session in worktree</p>
              </TooltipContent>
            </Tooltip>
          )}
          {(!settingsAutoCreateWorktree || !isRepo) && !isRenaming && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNewSession();
                  }}
                  className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 flex-shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label="New session"
                >
                  <RiAddLine className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                <p>New session</p>
              </TooltipContent>
            </Tooltip>
          )}
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
}

const ProjectDragOverlay: React.FC<ProjectDragOverlayProps> = ({
  projectLabel,
  isActiveProject,
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
  const [editingProjectId, setEditingProjectId] = React.useState<string | null>(null);
  const [editProjectTitle, setEditProjectTitle] = React.useState('');
  const [copiedSessionId, setCopiedSessionId] = React.useState<string | null>(null);
  const copyTimeout = React.useRef<number | null>(null);
  const [expandedParents, setExpandedParents] = React.useState<Set<string>>(new Set());
  const [directoryStatus, setDirectoryStatus] = React.useState<Map<string, 'unknown' | 'exists' | 'missing'>>(
    () => new Map(),
  );
  const checkingDirectories = React.useRef<Set<string>>(new Set());
  const safeStorage = React.useMemo(() => getSafeStorage(), []);
  const [collapsedProjects, setCollapsedProjects] = React.useState<Set<string>>(new Set());

  const [projectRepoStatus, setProjectRepoStatus] = React.useState<Map<string, boolean | null>>(new Map());
  const [expandedSessionGroups, setExpandedSessionGroups] = React.useState<Set<string>>(new Set());
  const [hoveredProjectId, setHoveredProjectId] = React.useState<string | null>(null);
  const [branchPickerOpen, setBranchPickerOpen] = React.useState(false);
  const [branchPickerProjectId, setBranchPickerProjectId] = React.useState<string | null>(null);
  const [issuePickerOpen, setIssuePickerOpen] = React.useState(false);
  const [pullRequestPickerOpen, setPullRequestPickerOpen] = React.useState(false);
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [stuckProjectHeaders, setStuckProjectHeaders] = React.useState<Set<string>>(new Set());
  const [openMenuSessionId, setOpenMenuSessionId] = React.useState<string | null>(null);
  const projectHeaderSentinelRefs = React.useRef<Map<string, HTMLDivElement | null>>(new Map());
  const ignoreIntersectionUntil = React.useRef<number>(0);
  const persistCollapsedProjectsTimer = React.useRef<number | null>(null);
  const pendingCollapsedProjects = React.useRef<Set<string> | null>(null);

  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);

  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const addProject = useProjectsStore((state) => state.addProject);
  const removeProject = useProjectsStore((state) => state.removeProject);
  const setActiveProject = useProjectsStore((state) => state.setActiveProject);
  const setActiveProjectIdOnly = useProjectsStore((state) => state.setActiveProjectIdOnly);
  const renameProject = useProjectsStore((state) => state.renameProject);
  const reorderProjects = useProjectsStore((state) => state.reorderProjects);

  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);
  const setSessionSwitcherOpen = useUIStore((state) => state.setSessionSwitcherOpen);
  const openMultiRunLauncher = useUIStore((state) => state.openMultiRunLauncher);

  const settingsAutoCreateWorktree = useConfigStore((state) => state.settingsAutoCreateWorktree);

  const sessions = useSessionStore((state) => state.sessions);
  const sessionsByDirectory = useSessionStore((state) => state.sessionsByDirectory);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const updateSessionTitle = useSessionStore((state) => state.updateSessionTitle);
  const shareSession = useSessionStore((state) => state.shareSession);
  const unshareSession = useSessionStore((state) => state.unshareSession);
  const sessionMemoryState = useSessionStore((state) => state.sessionMemoryState);
  const sessionStatus = useSessionStore((state) => state.sessionStatus);
  const permissions = useSessionStore((state) => state.permissions);
  const worktreeMetadata = useSessionStore((state) => state.worktreeMetadata);
  const availableWorktreesByProject = useSessionStore((state) => state.availableWorktreesByProject);
  const getSessionsByDirectory = useSessionStore((state) => state.getSessionsByDirectory);
  const openNewSessionDraft = useSessionStore((state) => state.openNewSessionDraft);

  const tauriIpcAvailable = React.useMemo(() => isTauriShell(), []);
  const isDesktopShellRuntime = React.useMemo(() => isDesktopShell(), []);

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  const flushCollapsedProjectsPersist = React.useCallback(() => {
    if (isVSCode) {
      return;
    }
    const collapsed = pendingCollapsedProjects.current;
    pendingCollapsedProjects.current = null;
    persistCollapsedProjectsTimer.current = null;
    if (!collapsed) {
      return;
    }

    const { projects } = useProjectsStore.getState();
    const updatedProjects = projects.map((project) => ({
      ...project,
      sidebarCollapsed: collapsed.has(project.id),
    }));
    void updateDesktopSettings({ projects: updatedProjects }).catch(() => {});
  }, [isVSCode]);

  const scheduleCollapsedProjectsPersist = React.useCallback((collapsed: Set<string>) => {
    if (typeof window === 'undefined') {
      return;
    }
    if (isVSCode) {
      return;
    }

    pendingCollapsedProjects.current = collapsed;
    if (persistCollapsedProjectsTimer.current !== null) {
      window.clearTimeout(persistCollapsedProjectsTimer.current);
    }
    persistCollapsedProjectsTimer.current = window.setTimeout(() => {
      flushCollapsedProjectsPersist();
    }, 700);
  }, [flushCollapsedProjectsPersist, isVSCode]);

  React.useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && persistCollapsedProjectsTimer.current !== null) {
        window.clearTimeout(persistCollapsedProjectsTimer.current);
      }
      persistCollapsedProjectsTimer.current = null;
      pendingCollapsedProjects.current = null;
    };
  }, []);

  React.useEffect(() => {
    try {
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

  const sortedSessions = React.useMemo(() => {
    return [...sessions].sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
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
    map.forEach((list) => list.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)));
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
        .catch(async () => {
          // SDK worktrees can be outside UI runtime FS permissions.
          // Probe via OpenCode API instead of local FS.
          const looksLikeSdkWorktree =
            directory.includes('/opencode/worktree/') ||
            directory.includes('/.opencode/data/worktree/') ||
            directory.includes('/.local/share/opencode/worktree/');

          if (looksLikeSdkWorktree) {
            const ok = await opencodeClient.probeDirectory(directory).catch(() => false);
            if (ok) {
              setDirectoryStatus((prev) => {
                const next = new Map(prev);
                if (next.get(directory) === 'exists') {
                  return prev;
                }
                next.set(directory, 'exists');
                return next;
              });
              return;
            }
          }

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

  const handleSaveProjectEdit = React.useCallback(() => {
    if (editingProjectId && editProjectTitle.trim()) {
      renameProject(editingProjectId, editProjectTitle.trim());
      setEditingProjectId(null);
      setEditProjectTitle('');
    }
  }, [editingProjectId, editProjectTitle, renameProject]);

  const handleCancelProjectEdit = React.useCallback(() => {
    setEditingProjectId(null);
    setEditProjectTitle('');
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
      
      // Check if this is a worktree session - if so, show confirmation dialog
      const worktree = worktreeMetadata.get(session.id);
      if (worktree) {
        // Find ALL sessions linked to this worktree (not just the triggered one)
        const worktreePath = worktree.path;
        const allWorktreeSessions: Session[] = [];
        const sessionIdSet = new Set<string>();
        
        // Iterate through all sessions and find those linked to the same worktree
        sessions.forEach((s) => {
          const meta = worktreeMetadata.get(s.id);
          if (meta && meta.path === worktreePath && !sessionIdSet.has(s.id)) {
            allWorktreeSessions.push(s);
            sessionIdSet.add(s.id);
            // Also collect descendants of each worktree session
            const sessionDescendants = collectDescendants(s.id);
            sessionDescendants.forEach((desc) => {
              if (!sessionIdSet.has(desc.id)) {
                allWorktreeSessions.push(desc);
                sessionIdSet.add(desc.id);
              }
            });
          }
        });

        sessionEvents.requestDelete({
          sessions: allWorktreeSessions,
          mode: 'worktree',
          worktree,
        });
        return;
      }

      if (descendants.length === 0) {

        const success = await deleteSession(session.id);
        if (success) {
          toast.success('Session deleted', {
            action: {
              label: 'OK',
              onClick: () => { },
            },
          });
        } else {
          toast.error('Failed to delete session');
        }
      } else {

        const ids = [session.id, ...descendants.map((s) => s.id)];
        const { deletedIds, failedIds } = await deleteSessions(ids);
        if (deletedIds.length > 0) {
          toast.success(`Deleted ${deletedIds.length} session${deletedIds.length === 1 ? '' : 's'}`, {
            action: {
              label: 'OK',
              onClick: () => { },
            },
          });
        }
        if (failedIds.length > 0) {
          toast.error(`Failed to delete ${failedIds.length} session${failedIds.length === 1 ? '' : 's'}`);
        }
      }
    },
    [collectDescendants, deleteSession, deleteSessions, worktreeMetadata, sessions],
  );

  const handleOpenDirectoryDialog = React.useCallback(() => {
    if (!tauriIpcAvailable) {
      sessionEvents.requestDirectoryDialog();
      return;
    }

    import('@/lib/desktop')
      .then(({ requestDirectoryAccess }) => requestDirectoryAccess(''))
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
  }, [addProject, tauriIpcAvailable]);

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
        worktree: worktreeMetadata.get(session.id) ?? null,
      };
    },
    [childrenMap, worktreeMetadata],
  );


  const buildGroupedSessions = React.useCallback(
    (projectSessions: Session[], projectRoot: string | null, availableWorktrees: WorktreeMetadata[]) => {
      const normalizedProjectRoot = normalizePath(projectRoot ?? null);
      const sortedProjectSessions = [...projectSessions].sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));

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
      childrenMap.forEach((list) => list.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0)));

      // Build worktree lookup map
      const worktreeByPath = new Map<string, WorktreeMetadata>();
      availableWorktrees.forEach((meta) => {
        if (meta.path) {
          const normalized = normalizePath(meta.path) ?? meta.path;
          worktreeByPath.set(normalized, meta);
        }
      });

      // Helper to get worktree metadata for a session
      const getSessionWorktree = (session: Session): WorktreeMetadata | null => {
        const sessionDirectory = normalizePath((session as Session & { directory?: string | null }).directory ?? null);
        const sessionWorktreeMeta = worktreeMetadata.get(session.id) ?? null;
        if (sessionWorktreeMeta) return sessionWorktreeMeta;
        if (sessionDirectory) {
          const worktree = worktreeByPath.get(sessionDirectory) ?? null;
          // Only count as worktree if it's not the main project root
          if (worktree && sessionDirectory !== normalizedProjectRoot) {
            return worktree;
          }
        }
        return null;
      };

      const buildProjectNode = (session: Session): SessionNode => {
        const children = childrenMap.get(session.id) ?? [];
        return {
          session,
          children: children.map((child) => buildProjectNode(child)),
          worktree: getSessionWorktree(session),
        };
      };

      // Find root sessions (no parent or parent not in current project)
      const roots = sortedProjectSessions.filter((session) => {
        const parentID = (session as Session & { parentID?: string | null }).parentID;
        if (!parentID) {
          return true;
        }
        return !sessionMap.has(parentID);
      });

      // Build all session nodes into a single flat group sorted by date
      const allSessions: SessionNode[] = roots.map((session) => buildProjectNode(session));

      // Return single group with all sessions
      return [{
        id: 'all',
        label: 'All sessions',
        description: normalizedProjectRoot ? formatPathForDisplay(normalizedProjectRoot, homeDirectory) : null,
        isMain: true,
        worktree: null,
        directory: normalizedProjectRoot,
        sessions: allSessions,
      }];
    },
    [homeDirectory, worktreeMetadata]
  );

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

      // Persist collapse state to server settings (web + desktop local/remote).
      if (!isVSCode) {
        scheduleCollapsedProjectsPersist(next);
      }
      return next;
    });
  }, [isVSCode, safeStorage, scheduleCollapsedProjectsPersist]);

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
      // In VS Code, only show sessions from the main project directory (skip worktrees)
      const worktreesForProject = isVSCode ? [] : (availableWorktreesByProject.get(project.normalizedPath) ?? []);
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
    [availableWorktreesByProject, getSessionsByDirectory, sessionsByDirectory, isVSCode],
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

  // Track when project sticky headers become "stuck"
  React.useEffect(() => {
    if (!isDesktopShellRuntime) return;

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
  }, [isDesktopShellRuntime, projectSections]);

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
              'bg-interactive-selection',
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

      const statusType = sessionStatus?.get(session.id)?.type ?? 'idle';
      const isStreaming = statusType === 'busy' || statusType === 'retry';
      const pendingPermissionCount = permissions.get(session.id)?.length ?? 0;

      const streamingIndicator = (() => {
        if (!memoryState) return null;
        if (memoryState.isZombie) {
          return <RiErrorWarningLine className="h-4 w-4 text-status-warning" />;
        }
        return null;
      })();

      return (
        <React.Fragment key={session.id}>
          <div
            className={cn(
              'group relative flex items-center rounded-md px-1.5 py-1',
              isActive ? 'bg-interactive-selection' : 'hover:bg-interactive-hover',
              isMissingDirectory ? 'opacity-75' : '',
              depth > 0 && 'pl-[20px]',
            )}
            onContextMenu={(e) => {
              e.preventDefault();
              setOpenMenuSessionId(session.id);
            }}
          >
            <div className="flex min-w-0 flex-1 items-center">
              <button
                type="button"
                disabled={isMissingDirectory}
                onClick={() => handleSessionSelect(session.id, sessionDirectory, isMissingDirectory, projectId)}
                className={cn(
                  'flex min-w-0 flex-1 flex-col gap-0 overflow-hidden rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 text-foreground select-none',
                )}
              >
                {}
                <div className="flex w-full items-center gap-2 min-w-0 flex-1 overflow-hidden">
                  {isStreaming ? (
                    <GridLoader size="xs" className="text-primary flex-shrink-0" />
                  ) : null}
                  <div className="block min-w-0 flex-1 truncate typography-ui-label font-normal text-foreground">
                    {sessionTitle}
                  </div>

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
                  {node.worktree ? (
                    <Tooltip delayDuration={700}>
                      <TooltipTrigger asChild>
                        <span className="flex-shrink-0">
                          <RiGitBranchLine className="h-3 w-3 text-[color:var(--status-info)]" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {node.worktree.branch || node.worktree.label || 'Worktree'}
                      </TooltipContent>
                    </Tooltip>
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
                    <span className="inline-flex items-center gap-0.5 text-status-warning flex-shrink-0">
                      <RiErrorWarningLine className="h-3 w-3" />
                      Missing
                    </span>
                  ) : null}
                </div>
              </button>

              <div className="flex items-center gap-1.5 self-stretch">
                {streamingIndicator}
                <DropdownMenu
                  open={openMenuSessionId === session.id}
                  onOpenChange={(open) => setOpenMenuSessionId(open ? session.id : null)}
                >
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
                    {node.worktree ? (
                      <DropdownMenuItem
                        onClick={() => {
                          if (projectId && projectId !== activeProjectId) {
                            setActiveProject(projectId);
                          }
                          setActiveMainTab('chat');
                          if (mobileVariant) {
                            setSessionSwitcherOpen(false);
                          }
                          openNewSessionDraft({ directoryOverride: node.worktree?.path ?? null });
                        }}
                        className="[&>svg]:mr-1"
                      >
                        <RiGitBranchLine className="mr-1 h-4 w-4" />
                        New session in worktree
                      </DropdownMenuItem>
                    ) : null}
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
      sessionStatus,
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
      activeProjectId,
      setActiveProject,
      setActiveMainTab,
      setSessionSwitcherOpen,
      openNewSessionDraft,
      openMenuSessionId,
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
    };
  }, [activeDragId, projectSections, homeDirectory, activeProjectId]);

  return (
    <div
      className={cn(
        'flex h-full flex-col text-foreground overflow-x-hidden',
        mobileVariant ? '' : 'bg-sidebar',
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
                'inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                    !isDesktopShellRuntime && 'bg-sidebar/60 hover:bg-sidebar',
              )}
              aria-label="Add project"
              title="Add project"
            >
              <RiFolderAddLine className="h-4.5 w-4.5" />
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
                    isDesktopShell={isDesktopShellRuntime}
                    isStuck={stuckProjectHeaders.has(projectKey)}
                    hideDirectoryControls={hideDirectoryControls}
                    mobileVariant={mobileVariant}
                    onToggle={() => toggleProject(projectKey)}
                    onHoverChange={(hovered) => setHoveredProjectId(hovered ? projectKey : null)}
                    onNewSession={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      setActiveMainTab('chat');
                      if (mobileVariant) {
                        setSessionSwitcherOpen(false);
                      }
                      openNewSessionDraft({ directoryOverride: project.normalizedPath });
                    }}
                    onNewWorktreeSession={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      setActiveMainTab('chat');
                      if (mobileVariant) {
                        setSessionSwitcherOpen(false);
                      }
                      createWorktreeSession();
                    }}
                    onOpenBranchPicker={() => {
                      setBranchPickerProjectId(projectKey);
                      setBranchPickerOpen(true);
                    }}
                    onNewSessionFromGitHubIssue={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      setActiveMainTab('chat');
                      if (mobileVariant) {
                        setSessionSwitcherOpen(false);
                      }
                      setIssuePickerOpen(true);
                    }}
                    onNewSessionFromGitHubPR={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      setActiveMainTab('chat');
                      if (mobileVariant) {
                        setSessionSwitcherOpen(false);
                      }
                      setPullRequestPickerOpen(true);
                    }}
                    onOpenMultiRunLauncher={() => {
                      if (projectKey !== activeProjectId) {
                        setActiveProject(projectKey);
                      }
                      openMultiRunLauncher();
                    }}
                    onRenameStart={() => {
                      setEditingProjectId(projectKey);
                      setEditProjectTitle(project.label?.trim() || formatDirectoryName(project.normalizedPath, homeDirectory) || project.normalizedPath);
                    }}
                    onRenameSave={handleSaveProjectEdit}
                    onRenameCancel={handleCancelProjectEdit}
                    onRenameValueChange={setEditProjectTitle}
                    renameValue={editingProjectId === projectKey ? editProjectTitle : ''}
                    isRenaming={editingProjectId === projectKey}
                    onClose={() => removeProject(projectKey)}
                    sentinelRef={(el) => { projectHeaderSentinelRefs.current.set(projectKey, el); }}
                    settingsAutoCreateWorktree={settingsAutoCreateWorktree}
                  >
                    {!isCollapsed ? (
                      <div className="space-y-[0.6rem] py-1 pl-1">
                        {section.groups[0] ? renderGroupSessions(section.groups[0], `${projectKey}:all`, projectKey) : (
                          <div className="py-1 text-left typography-micro text-muted-foreground">
                            No sessions yet.
                          </div>
                        )}
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
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </ScrollableOverlay>

      <BranchPickerDialog
        open={branchPickerOpen}
        onOpenChange={setBranchPickerOpen}
        project={branchPickerProjectId
          ? normalizedProjects.find((p) => p.id === branchPickerProjectId) ?? null
          : null}
      />

      <GitHubIssuePickerDialog
        open={issuePickerOpen}
        onOpenChange={setIssuePickerOpen}
      />

      <GitHubPullRequestPickerDialog
        open={pullRequestPickerOpen}
        onOpenChange={setPullRequestPickerOpen}
      />
    </div>
  );
};
