import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowLeftLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiFolder6Line,
  RiFolderOpenLine,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiMore2Line,
  RiChat4Line,
  RiSearchLine,
  RiSideBarLine,
  RiFolderTransferLine,
} from '@remixicon/react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { GridLoader } from '@/components/ui/grid-loader';
import { GitHubReposSidebar } from './GitHubReposSidebar';
import { cn, formatDirectoryName, getModifierLabel } from '@/lib/utils';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { sessionEvents } from '@/lib/sessionEvents';
import { checkIsGitRepository } from '@/lib/gitApi';
import { createWorktreeSession } from '@/lib/worktreeSessionCreator';
import { hasLegacyWorktrees, migrateWorktreesToGlobalLocation } from '@/lib/git/worktreeService';
import { BranchPickerDialog } from '@/components/session/BranchPickerDialog';
import type { WorktreeMetadata } from '@/types/worktree';
import { SIDEBAR_SECTIONS, type SidebarSection } from '@/constants/sidebar';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';

const normalizePath = (value?: string | null): string | null => {
  if (!value) return null;
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
};

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

interface WorktreeStats {
  sessionCount: number;
  additions: number;
  deletions: number;
  lastUpdated: number | null;
  isStreaming: boolean;
}

interface WorktreeItemProps {
  worktree: WorktreeMetadata;
  isActive: boolean;
  isMain: boolean;
  stats: WorktreeStats;
  onSelect: () => void;
  onClose?: () => void;
  onRename?: () => void;
  onOpenInFinder?: () => void;
  isEditing?: boolean;
  editValue?: string;
  onEditChange?: (value: string) => void;
  onSaveRename?: () => void;
  onCancelRename?: () => void;
  isAutoReviewEnabled?: boolean;
}

const WorktreeItem: React.FC<WorktreeItemProps> = ({
  worktree,
  isActive,
  isMain,
  stats,
  onSelect,
  onClose,
  onRename,
  onOpenInFinder,
  isEditing,
  editValue,
  onEditChange,
  onSaveRename,
  onCancelRename,
  isAutoReviewEnabled,
}) => {
  const label = isMain ? 'main' : (worktree.label || worktree.branch || 'worktree');
  const hasChanges = stats.additions > 0 || stats.deletions > 0;
  const showActions = onOpenInFinder || (!isMain && (onClose || onRename));
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSaveRename?.();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancelRename?.();
    }
  }, [onSaveRename, onCancelRename]);
  
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (!showActions) return;
    e.preventDefault();
    setDropdownOpen(true);
  }, [showActions]);

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <div
        className={cn(
          'group flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left',
          'transition-colors cursor-pointer',
          isActive
            ? 'bg-primary/10'
            : 'hover:bg-muted/50'
        )}
        onClick={isEditing ? undefined : onSelect}
        onContextMenu={handleContextMenu}
      >
        <div className="flex items-center gap-2">
          <RiGitBranchLine className={cn(
            'h-4 w-4 shrink-0',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )} />
          {isEditing ? (
            <input
              ref={inputRef}
              type="text"
              value={editValue ?? ''}
              onChange={(e) => onEditChange?.(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={onSaveRename}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 bg-transparent border-b border-primary text-sm text-foreground outline-none px-0 py-0"
            />
          ) : (
            <span className={cn(
              'flex-1 truncate text-sm',
              isActive ? 'text-primary font-medium' : 'text-foreground'
            )}>
              {label}
            </span>
          )}
          {stats.isStreaming && (
            <GridLoader size="xs" className="text-primary shrink-0" />
          )}
          {isAutoReviewEnabled && !stats.isStreaming && (
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <span className="h-2 w-2 rounded-full bg-cyan-500 shrink-0 animate-pulse" />
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">Auto-review enabled</TooltipContent>
            </Tooltip>
          )}
          {worktree.status?.isDirty && !stats.isStreaming && !isAutoReviewEnabled && (
            <span className="h-2 w-2 rounded-full bg-warning shrink-0" title="Uncommitted changes" />
          )}
          {showActions && !isEditing && (
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                onClick={(e) => e.stopPropagation()}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted/50 transition-all"
              >
                <RiMore2Line className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
          )}
        </div>
        
        {(stats.sessionCount > 0 || hasChanges) && !isEditing && (
          <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
            {stats.sessionCount > 0 && (
              <span className="flex items-center gap-1">
                <RiChat4Line className="h-3 w-3" />
                {stats.sessionCount}
              </span>
            )}
            {hasChanges && (
              <span className="flex items-center gap-0.5">
                <span className="text-[color:var(--status-success)]">+{stats.additions}</span>
                <span>/</span>
                <span className="text-destructive">-{stats.deletions}</span>
              </span>
            )}
            {stats.lastUpdated && (
              <span className="text-muted-foreground/70">
                {formatRelativeTime(stats.lastUpdated)}
              </span>
            )}
          </div>
        )}
      </div>
      {showActions && (
        <DropdownMenuContent align="end" className="min-w-[120px]">
          {onOpenInFinder && (
            <DropdownMenuItem onClick={onOpenInFinder}>
              <RiFolderOpenLine className="mr-1.5 h-4 w-4" />
              Open in Finder
            </DropdownMenuItem>
          )}
          {onRename && (
            <DropdownMenuItem onClick={onRename}>
              Rename
            </DropdownMenuItem>
          )}
          {onClose && (
            <DropdownMenuItem
              onClick={onClose}
              className="text-destructive focus:text-destructive"
            >
              <RiCloseLine className="mr-1.5 h-4 w-4" />
              Close Worktree
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
};

interface ProjectSectionProps {
  project: {
    id: string;
    path: string;
    label?: string;
    normalizedPath: string;
  };
  isActive: boolean;
  worktrees: WorktreeMetadata[];
  activeWorktreePath: string | null;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelectWorktree: (path: string) => void;
  onClose: () => void;
  onCloseWorktree?: (worktreePath: string) => void;
  onOpenInFinder?: (worktreePath: string) => void;
  onNewWorktreeSession?: () => void;
  onOpenBranchPicker?: () => void;
  onMigrateWorktrees?: () => void;
  isRepo: boolean;
  hasLegacy: boolean;
  getWorktreeStats: (worktreePath: string) => WorktreeStats;
  editingWorktreePath: string | null;
  editValue: string;
  onStartRename: (worktreePath: string, currentLabel: string) => void;
  onEditChange: (value: string) => void;
  onSaveRename: () => void;
  onCancelRename: () => void;
  worktreeLabels: Map<string, string>;
  autoReviewDirectory: string | null;
}

const ProjectSection: React.FC<ProjectSectionProps> = ({
  project,
  isActive,
  worktrees,
  activeWorktreePath,
  isCollapsed,
  onToggleCollapse,
  onSelectWorktree,
  onClose,
  onCloseWorktree,
  onOpenInFinder,
  onNewWorktreeSession,
  onOpenBranchPicker,
  onMigrateWorktrees,
  isRepo,
  hasLegacy,
  getWorktreeStats,
  editingWorktreePath,
  editValue,
  onStartRename,
  onEditChange,
  onSaveRename,
  onCancelRename,
  worktreeLabels,
  autoReviewDirectory,
}) => {
  const projectLabel = project.label || formatDirectoryName(project.path);
  const normalizedProjectPath = project.normalizedPath;
  
  const actualWorktrees = useMemo(() => {
    if (!isRepo) return [];
    return worktrees.filter(w => normalizePath(w.path) !== normalizedProjectPath);
  }, [isRepo, worktrees, normalizedProjectPath]);

  const projectStats = useMemo(() => {
    let totalSessions = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let lastUpdated: number | null = null;

    actualWorktrees.forEach(wt => {
      const stats = getWorktreeStats(wt.path);
      totalSessions += stats.sessionCount;
      totalAdditions += stats.additions;
      totalDeletions += stats.deletions;
      if (stats.lastUpdated && (!lastUpdated || stats.lastUpdated > lastUpdated)) {
        lastUpdated = stats.lastUpdated;
      }
    });

    return { totalSessions, totalAdditions, totalDeletions, lastUpdated };
  }, [actualWorktrees, getWorktreeStats]);

  return (
    <div className="mb-2">
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-1 py-1',
          'hover:bg-muted/30 transition-colors'
        )}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="flex flex-1 items-center gap-1.5 text-left min-w-0"
        >
          {isCollapsed ? (
            <RiArrowRightSLine className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <RiArrowDownSLine className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className={cn(
            'flex-1 truncate text-base font-medium',
            isActive ? 'text-foreground' : 'text-muted-foreground'
          )}>
            {projectLabel}
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted/50 transition-all"
              onClick={(e) => e.stopPropagation()}
            >
              <RiMore2Line className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px]">
            {hasLegacy && onMigrateWorktrees && (
              <DropdownMenuItem onClick={onMigrateWorktrees}>
                <RiFolderTransferLine className="mr-1.5 h-4 w-4" />
                Migrate Worktrees
              </DropdownMenuItem>
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

        {isRepo && onOpenBranchPicker && (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenBranchPicker();
                }}
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted/50 transition-all"
                aria-label="Browse branches"
              >
                <RiGitRepositoryLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Browse branches</TooltipContent>
          </Tooltip>
        )}

        {isRepo && onNewWorktreeSession && (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewWorktreeSession();
                }}
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                aria-label="New worktree session"
              >
                <RiAddLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New worktree session</TooltipContent>
          </Tooltip>
        )}
      </div>

      {isCollapsed && projectStats.totalSessions > 0 && (
        <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground ml-5">
          <span className="flex items-center gap-1">
            <RiChat4Line className="h-3 w-3" />
            {projectStats.totalSessions}
          </span>
          {(projectStats.totalAdditions > 0 || projectStats.totalDeletions > 0) && (
            <span className="flex items-center gap-0.5">
              <span className="text-[color:var(--status-success)]">+{projectStats.totalAdditions}</span>
              <span>/</span>
              <span className="text-destructive">-{projectStats.totalDeletions}</span>
            </span>
          )}
          {projectStats.lastUpdated && (
            <span className="text-muted-foreground/70">
              {formatRelativeTime(projectStats.lastUpdated)}
            </span>
          )}
        </div>
      )}

      {!isCollapsed && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-border/50 pl-2">
          {actualWorktrees.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground/70 italic">
              No worktrees yet
            </div>
          ) : (
            actualWorktrees.map((worktree) => {
              const worktreePath = normalizePath(worktree.path);
              const isWorktreeActive = worktreePath === activeWorktreePath;
              const stats = getWorktreeStats(worktree.path);
              const isEditingThis = editingWorktreePath === worktreePath;
              const savedLabel = worktreePath ? worktreeLabels.get(worktreePath) : undefined;
              const displayLabel = savedLabel ?? (worktree.branch || worktree.label || 'worktree');
              
              const isAutoReviewEnabled = autoReviewDirectory !== null && worktreePath === autoReviewDirectory;
              
              return (
                <WorktreeItem
                  key={worktree.path}
                  worktree={{ ...worktree, label: displayLabel }}
                  isActive={isWorktreeActive}
                  isMain={false}
                  stats={stats}
                  onSelect={() => onSelectWorktree(worktree.path)}
                  onClose={onCloseWorktree ? () => onCloseWorktree(worktree.path) : undefined}
                  onRename={worktreePath ? () => onStartRename(worktreePath, displayLabel) : undefined}
                  onOpenInFinder={onOpenInFinder ? () => onOpenInFinder(worktree.path) : undefined}
                  isEditing={isEditingThis}
                  editValue={isEditingThis ? editValue : undefined}
                  onEditChange={onEditChange}
                  onSaveRename={onSaveRename}
                  onCancelRename={onCancelRename}
                  isAutoReviewEnabled={isAutoReviewEnabled}
                />
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

interface WorktreeSidebarProps {
  mobileVariant?: boolean;
}

export const WorktreeSidebar: React.FC<WorktreeSidebarProps> = () => {
  const projects = useProjectsStore((s) => s.projects);
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const removeProject = useProjectsStore((s) => s.removeProject);
  const setActiveProject = useProjectsStore((s) => s.setActiveProject);
  
  const availableWorktreesByProject = useSessionStore((s) => s.availableWorktreesByProject);
  const sessionsByDirectory = useSessionStore((s) => s.sessionsByDirectory);
  const sessionActivityPhase = useSessionStore((s) => s.sessionActivityPhase);
  
  const currentDirectory = useDirectoryStore((s) => s.currentDirectory);
  const setDirectory = useDirectoryStore((s) => s.setDirectory);
  
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isSettingsOpen = useUIStore((s) => s.isSettingsDialogOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsDialogOpen);
  const activeSettingsTab = useUIStore((s) => s.activeSettingsTab);
  const setActiveSettingsTab = useUIStore((s) => s.setActiveSettingsTab);
  const sidebarMode = useUIStore((s) => s.sidebarMode);
  const setSidebarMode = useUIStore((s) => s.setSidebarMode);
  const focusedSessionId = useUIStore((s) => s.focusedSessionId);
  const setFocusedSessionId = useUIStore((s) => s.setFocusedSessionId);
  
  const sessions = useSessionStore((s) => s.sessions);

  const autoReviewDirectory = useAutoReviewStore((s) => s.activeDirectory);
  const normalizedAutoReviewDirectory = useMemo(() => normalizePath(autoReviewDirectory), [autoReviewDirectory]);

  const isVSCode = useMemo(() => isVSCodeRuntime(), []);
  
  const settingsSections = useMemo(() => {
    let sections = SIDEBAR_SECTIONS.filter(s => s.id !== 'sessions');
    if (isVSCode) {
      sections = sections.filter(s => s.id !== 'git-identities');
    }
    const openChamberSection = sections.find(s => s.id === 'settings');
    const otherSections = sections.filter(s => s.id !== 'settings');
    return openChamberSection ? [openChamberSection, ...otherSections] : sections;
  }, [isVSCode]);

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [projectRepoStatus, setProjectRepoStatus] = useState<Map<string, boolean>>(new Map());
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [editingWorktreePath, setEditingWorktreePath] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [worktreeLabels, setWorktreeLabels] = useState<Map<string, string>>(() => {
    try {
      const saved = localStorage.getItem('oc.worktree.labels');
      return saved ? new Map(JSON.parse(saved)) : new Map();
    } catch {
      return new Map();
    }
  });

  const [isDesktopRuntime] = useState(() => {
    if (typeof window === 'undefined') return false;
    return typeof window.opencodeDesktop !== 'undefined';
  });

  const [projectLegacyStatus, setProjectLegacyStatus] = useState<Map<string, boolean>>(new Map());

  React.useEffect(() => {
    let cancelled = false;
    projects.forEach((project) => {
      const path = normalizePath(project.path);
      if (!path || projectRepoStatus.has(project.id)) return;
      
      checkIsGitRepository(path)
        .then((isRepo) => {
          if (!cancelled) {
            setProjectRepoStatus((prev) => new Map(prev).set(project.id, isRepo));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProjectRepoStatus((prev) => new Map(prev).set(project.id, false));
          }
        });
    });
    return () => { cancelled = true; };
  }, [projects, projectRepoStatus]);

  React.useEffect(() => {
    let cancelled = false;
    projects.forEach((project) => {
      const path = normalizePath(project.path);
      const isRepo = projectRepoStatus.get(project.id);
      if (!path || !isRepo || projectLegacyStatus.has(project.id)) return;
      
      hasLegacyWorktrees(path)
        .then((hasLegacy) => {
          if (!cancelled) {
            setProjectLegacyStatus((prev) => new Map(prev).set(project.id, hasLegacy));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setProjectLegacyStatus((prev) => new Map(prev).set(project.id, false));
          }
        });
    });
    return () => { cancelled = true; };
  }, [projects, projectRepoStatus, projectLegacyStatus]);

  const loadSessions = useSessionStore((s) => s.loadSessions);

  const handleMigrateWorktrees = useCallback(async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    
    const path = normalizePath(project.path);
    if (!path) return;
    
    toast.loading('Migrating worktrees...', { id: 'migrate-worktrees' });
    
    try {
      const result = await migrateWorktreesToGlobalLocation(path);
      
      if (result.success) {
        const count = result.migrated.filter(m => m.success).length;
        toast.success(`Migrated ${count} worktree${count === 1 ? '' : 's'}`, { 
          id: 'migrate-worktrees',
          description: result.targetDirectory ? `To: ${result.targetDirectory}` : undefined,
        });
        setProjectLegacyStatus((prev) => new Map(prev).set(projectId, false));
        loadSessions();
      } else {
        const failed = result.migrated.filter(m => !m.success);
        toast.error('Migration failed', { 
          id: 'migrate-worktrees',
          description: failed.length > 0 ? `${failed.length} worktree(s) failed to migrate` : result.error,
        });
      }
    } catch (error) {
      toast.error('Migration failed', { 
        id: 'migrate-worktrees',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [projects, loadSessions]);

  const activeWorktreePath = useMemo(() => {
    return normalizePath(currentDirectory);
  }, [currentDirectory]);

  const getWorktreeStats = useCallback((worktreePath: string): WorktreeStats => {
    const normalizedPath = normalizePath(worktreePath);
    if (!normalizedPath) {
      return { sessionCount: 0, additions: 0, deletions: 0, lastUpdated: null, isStreaming: false };
    }

    const directorySessions = sessionsByDirectory.get(normalizedPath) ?? [];
    
    let additions = 0;
    let deletions = 0;
    let lastUpdated: number | null = null;
    let isStreaming = false;

    directorySessions.forEach((session: Session) => {
      additions += session.summary?.additions ?? 0;
      deletions += session.summary?.deletions ?? 0;
      
      const updated = session.time?.updated ?? session.time?.created;
      if (updated && (!lastUpdated || updated > lastUpdated)) {
        lastUpdated = updated;
      }

      const phase = sessionActivityPhase?.get(session.id);
      if (phase === 'busy' || phase === 'cooldown') {
        isStreaming = true;
      }
    });

    return {
      sessionCount: directorySessions.length,
      additions,
      deletions,
      lastUpdated,
      isStreaming,
    };
  }, [sessionsByDirectory, sessionActivityPhase]);

  const toggleProject = useCallback((projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleSelectWorktree = useCallback((projectId: string, worktreePath: string) => {
    if (projectId !== activeProjectId) {
      setActiveProject(projectId);
    }
    setDirectory(worktreePath, { showOverlay: false });
  }, [activeProjectId, setActiveProject, setDirectory]);

  const handleCloseProject = useCallback((projectId: string) => {
    removeProject(projectId);
    toast.success('Project closed');
  }, [removeProject]);

  const handleAddProject = useCallback(() => {
    if (isDesktopRuntime && window.opencodeDesktop?.requestDirectoryAccess) {
      window.opencodeDesktop
        .requestDirectoryAccess('')
        .then((result) => {
          if (result.success && result.path) {
            const added = useProjectsStore.getState().addProject(result.path, { id: result.projectId });
            if (!added) {
              toast.error('Failed to add project');
            }
          } else if (result.error && result.error !== 'Directory selection cancelled') {
            toast.error('Failed to select directory', { description: result.error });
          }
        })
        .catch(() => {
          toast.error('Failed to select directory');
        });
    } else {
      sessionEvents.requestDirectoryDialog();
    }
  }, [isDesktopRuntime]);



  const handleNewWorktreeSession = useCallback((projectId: string) => {
    if (projectId !== activeProjectId) {
      setActiveProject(projectId);
    }
    createWorktreeSession();
  }, [activeProjectId, setActiveProject]);

  const handleCloseWorktree = useCallback((worktreePath: string) => {
    const normalizedPath = normalizePath(worktreePath);
    if (!normalizedPath) return;

    // Find the worktree metadata from availableWorktreesByProject
    let worktreeMetadata: WorktreeMetadata | null = null;
    for (const [, worktrees] of availableWorktreesByProject.entries()) {
      const found = worktrees.find(w => normalizePath(w.path) === normalizedPath);
      if (found) {
        worktreeMetadata = found;
        break;
      }
    }

    if (!worktreeMetadata) {
      // Worktree not found in tracked worktrees, just show a message
      toast.error('Worktree not found');
      return;
    }

    // Find sessions linked to this worktree
    const linkedSessions = sessions.filter(session => {
      const sessionDir = normalizePath(session.directory ?? null);
      return sessionDir === normalizedPath;
    });

    // Trigger the delete dialog via sessionEvents
    sessionEvents.requestDelete({
      sessions: linkedSessions,
      mode: 'worktree',
      worktree: worktreeMetadata,
    });
  }, [availableWorktreesByProject, sessions]);

  const handleOpenInFinder = useCallback(async (worktreePath: string) => {
    const normalizedPath = normalizePath(worktreePath);
    if (!normalizedPath) return;

    if (isDesktopRuntime && window.opencodeDesktop?.openExternal) {
      const result = await window.opencodeDesktop.openExternal(`file://${normalizedPath}`);
      if (!result.success) {
        toast.error('Failed to open folder');
      }
    } else {
      try {
        const response = await fetch('/api/fs/reveal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: normalizedPath }),
        });
        
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to open folder');
        }
      } catch (error) {
        toast.error('Failed to open folder', {
          description: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }, [isDesktopRuntime]);

  const handleOpenBranchPicker = useCallback(() => {
    setBranchPickerOpen(true);
  }, []);

  const handleStartRename = useCallback((worktreePath: string, currentLabel: string) => {
    const savedLabel = worktreeLabels.get(worktreePath);
    setEditingWorktreePath(worktreePath);
    setEditValue(savedLabel ?? currentLabel);
  }, [worktreeLabels]);

  const handleSaveRename = useCallback(() => {
    if (!editingWorktreePath || !editValue.trim()) {
      setEditingWorktreePath(null);
      setEditValue('');
      return;
    }

    setWorktreeLabels((prev) => {
      const next = new Map(prev);
      next.set(editingWorktreePath, editValue.trim());
      try {
        localStorage.setItem('oc.worktree.labels', JSON.stringify([...next]));
      } catch {
        // Ignore storage errors
      }
      return next;
    });

    setEditingWorktreePath(null);
    setEditValue('');
    toast.success('Worktree renamed');
  }, [editingWorktreePath, editValue]);

  const handleCancelRename = useCallback(() => {
    setEditingWorktreePath(null);
    setEditValue('');
  }, []);

  const handleEditChange = useCallback((value: string) => {
    setEditValue(value);
  }, []);

  const normalizedProjects = useMemo(() => {
    return projects.map((p) => ({
      ...p,
      normalizedPath: normalizePath(p.path),
    })).filter((p) => p.normalizedPath) as Array<{
      id: string;
      path: string;
      label?: string;
      normalizedPath: string;
    }>;
  }, [projects]);

  const handleSelectSettingsTab = useCallback((tab: SidebarSection) => {
    setActiveSettingsTab(tab);
  }, [setActiveSettingsTab]);

  const renderSettingsView = () => (
    <div className="flex flex-col h-full">
      <div className="flex h-12 min-h-12 items-center justify-between px-3 border-b border-border/50">
        <button
          type="button"
          onClick={() => setSettingsOpen(false)}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RiArrowLeftLine className="h-4 w-4" />
          <span>Settings</span>
        </button>
      </div>

      <ScrollableOverlay className="flex-1 overflow-y-auto p-2">
        {settingsSections.map(({ id, label, icon: Icon }) => {
          const isActive = activeSettingsTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => handleSelectSettingsTab(id)}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">{label}</span>
            </button>
          );
        })}
      </ScrollableOverlay>
    </div>
  );

  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);
  
  const handleSelectSession = useCallback((sessionId: string) => {
    setFocusedSessionId(sessionId);
    setCurrentSession(sessionId);
  }, [setFocusedSessionId, setCurrentSession]);

  const sortedSessions = useMemo(() => {
    return [...sessions].sort((a, b) => {
      const aTime = a.time?.updated ?? a.time?.created ?? 0;
      const bTime = b.time?.updated ?? b.time?.created ?? 0;
      return bTime - aTime;
    });
  }, [sessions]);

  const renderSidebarHeader = () => (
    <div className="flex h-12 min-h-12 items-center justify-between px-3 border-b border-border/50">
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={toggleSidebar}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <RiSideBarLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Close Sidebar</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <span>
                {sidebarMode === 'projects' ? 'Projects' : sidebarMode === 'sessions' ? 'Sessions' : 'GitHub'}
              </span>
              <RiArrowDownSLine className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            <DropdownMenuRadioGroup value={sidebarMode} onValueChange={(v) => setSidebarMode(v as 'projects' | 'sessions' | 'github')}>
              <DropdownMenuRadioItem value="projects">Projects</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="sessions">Sessions</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="github">GitHub</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {sidebarMode === 'projects' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleAddProject}
              className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              <RiAddLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Add Project</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  const renderSessionsView = () => (
    <div className="flex flex-col h-full">
      {renderSidebarHeader()}

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={toggleCommandPalette}
          className="flex w-full items-center gap-2 px-2.5 py-2 rounded border border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:border-muted-foreground/40 transition-all"
        >
          <RiSearchLine className="h-4 w-4" />
          <span className="flex-1 text-left text-sm">Search...</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            {getModifierLabel()}K
          </kbd>
        </button>
      </div>

      <ScrollableOverlay className="flex-1 overflow-y-auto p-2">
        {sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <RiChat4Line className="h-10 w-10 text-muted-foreground/50 mb-3" />
            <p className="text-sm font-medium text-muted-foreground mb-1">No sessions yet</p>
            <p className="text-xs text-muted-foreground/70">Start a conversation to create a session</p>
          </div>
        ) : (
          sortedSessions.map((session) => {
            const isActive = focusedSessionId === session.id;
            const sessionTime = session.time?.updated ?? session.time?.created;
            const phase = sessionActivityPhase?.get(session.id);
            const isStreaming = phase === 'busy' || phase === 'cooldown';
            
            return (
              <button
                key={session.id}
                type="button"
                onClick={() => handleSelectSession(session.id)}
                className={cn(
                  'group flex w-full flex-col gap-0.5 rounded-md px-2 py-2 text-left mb-1',
                  'transition-colors',
                  isActive
                    ? 'bg-primary/10'
                    : 'hover:bg-muted/50'
                )}
              >
                <div className="flex items-center gap-2">
                  <RiChat4Line className={cn(
                    'h-4 w-4 shrink-0',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  <span className={cn(
                    'flex-1 truncate text-sm',
                    isActive ? 'text-primary font-medium' : 'text-foreground'
                  )}>
                    {session.title || 'Untitled'}
                  </span>
                  {isStreaming && (
                    <GridLoader size="xs" className="text-primary shrink-0" />
                  )}
                </div>
                {sessionTime && (
                  <span className="text-xs text-muted-foreground/70 pl-6">
                    {formatRelativeTime(sessionTime)}
                  </span>
                )}
              </button>
            );
          })
        )}
      </ScrollableOverlay>
    </div>
  );

  if (isSettingsOpen) {
    return renderSettingsView();
  }

  if (sidebarMode === 'sessions') {
    return renderSessionsView();
  }

  if (sidebarMode === 'github') {
    return <GitHubReposSidebar />;
  }

  if (normalizedProjects.length === 0) {
    return (
      <div className="flex flex-col h-full">
        {renderSidebarHeader()}
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={toggleCommandPalette}
            className="flex w-full items-center gap-2 px-2.5 py-2 rounded border border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:border-muted-foreground/40 transition-all"
          >
            <RiSearchLine className="h-4 w-4" />
            <span className="flex-1 text-left text-sm">Search...</span>
            <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              {getModifierLabel()}K
            </kbd>
          </button>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
          <RiFolder6Line className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No projects yet</p>
          <p className="text-xs text-muted-foreground/70 mb-4">Add a project to get started</p>
          <button
            type="button"
            onClick={handleAddProject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
          >
            <RiAddLine className="h-4 w-4" />
            Add Project
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {renderSidebarHeader()}

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={toggleCommandPalette}
          className="flex w-full items-center gap-2 px-2.5 py-2 rounded border border-muted-foreground/25 text-muted-foreground hover:text-foreground hover:bg-muted/40 hover:border-muted-foreground/40 transition-all"
        >
          <RiSearchLine className="h-4 w-4" />
          <span className="flex-1 text-left text-sm">Search...</span>
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/50 bg-muted/30 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            {getModifierLabel()}K
          </kbd>
        </button>
      </div>

      <ScrollableOverlay className="flex-1 overflow-y-auto p-2">
        {normalizedProjects.map((project) => {
          const worktrees = availableWorktreesByProject.get(project.normalizedPath) ?? [];
          const isActive = project.id === activeProjectId;
          const isCollapsed = collapsedProjects.has(project.id);
          const isRepo = projectRepoStatus.get(project.id) ?? false;

          return (
            <ProjectSection
              key={project.id}
              project={project}
              isActive={isActive}
              worktrees={worktrees}
              activeWorktreePath={activeWorktreePath}
              isCollapsed={isCollapsed}
              onToggleCollapse={() => toggleProject(project.id)}
              onSelectWorktree={(path) => handleSelectWorktree(project.id, path)}
              onClose={() => handleCloseProject(project.id)}
              onCloseWorktree={handleCloseWorktree}
              onOpenInFinder={handleOpenInFinder}
              onNewWorktreeSession={() => handleNewWorktreeSession(project.id)}
              onOpenBranchPicker={handleOpenBranchPicker}
              onMigrateWorktrees={() => handleMigrateWorktrees(project.id)}
              isRepo={isRepo}
              hasLegacy={projectLegacyStatus.get(project.id) ?? false}
              getWorktreeStats={getWorktreeStats}
              editingWorktreePath={editingWorktreePath}
              editValue={editValue}
              onStartRename={handleStartRename}
              onEditChange={handleEditChange}
              onSaveRename={handleSaveRename}
              onCancelRename={handleCancelRename}
              worktreeLabels={worktreeLabels}
              autoReviewDirectory={normalizedAutoReviewDirectory}
            />
          );
        })}
      </ScrollableOverlay>

      <BranchPickerDialog
        open={branchPickerOpen}
        onOpenChange={setBranchPickerOpen}
        projects={normalizedProjects}
        activeProjectId={activeProjectId}
      />
    </div>
  );
};
