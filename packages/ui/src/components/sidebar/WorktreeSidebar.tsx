import React, { useCallback, useMemo, useState } from 'react';
import type { Session } from '@opencode-ai/sdk/v2';
import {
  RiAddLine,
  RiArrowDownSLine,
  RiArrowRightSLine,
  RiCloseLine,
  RiFolder6Line,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiMore2Line,
  RiChat4Line,
  RiSearchLine,
} from '@remixicon/react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { GridLoader } from '@/components/ui/grid-loader';
import { cn, formatDirectoryName, getModifierLabel } from '@/lib/utils';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useUIStore } from '@/stores/useUIStore';
import { sessionEvents } from '@/lib/sessionEvents';
import { checkIsGitRepository } from '@/lib/gitApi';
import { createWorktreeSession } from '@/lib/worktreeSessionCreator';
import { BranchPickerDialog } from '@/components/session/BranchPickerDialog';
import type { WorktreeMetadata } from '@/types/worktree';

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
}

const WorktreeItem: React.FC<WorktreeItemProps> = ({
  worktree,
  isActive,
  isMain,
  stats,
  onSelect,
}) => {
  const label = isMain ? 'main' : (worktree.branch || worktree.label || 'worktree');
  const hasChanges = stats.additions > 0 || stats.deletions > 0;
  
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left',
        'transition-colors',
        isActive
          ? 'bg-primary/10'
          : 'hover:bg-muted/50'
      )}
    >
      <div className="flex items-center gap-2">
        <RiGitBranchLine className={cn(
          'h-4 w-4 shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground'
        )} />
        <span className={cn(
          'flex-1 truncate text-sm',
          isActive ? 'text-primary font-medium' : 'text-foreground'
        )}>
          {label}
        </span>
        {stats.isStreaming && (
          <GridLoader size="xs" className="text-primary shrink-0" />
        )}
        {worktree.status?.isDirty && !stats.isStreaming && (
          <span className="h-2 w-2 rounded-full bg-warning shrink-0" title="Uncommitted changes" />
        )}
      </div>
      
      {(stats.sessionCount > 0 || hasChanges) && (
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
    </button>
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
  onNewWorktreeSession?: () => void;
  onOpenBranchPicker?: () => void;
  isRepo: boolean;
  getWorktreeStats: (worktreePath: string) => WorktreeStats;
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
  onNewWorktreeSession,
  onOpenBranchPicker,
  isRepo,
  getWorktreeStats,
}) => {
  const projectLabel = project.label || formatDirectoryName(project.path);
  const normalizedProjectPath = project.normalizedPath;
  
  const mainWorktree: WorktreeMetadata = useMemo(() => ({
    path: project.path,
    projectDirectory: project.path,
    branch: 'main',
    label: 'main',
  }), [project.path]);

  const allWorktrees = useMemo(() => {
    if (!isRepo) return [mainWorktree];
    const nonMain = worktrees.filter(w => normalizePath(w.path) !== normalizedProjectPath);
    return [mainWorktree, ...nonMain];
  }, [isRepo, worktrees, mainWorktree, normalizedProjectPath]);

  const projectStats = useMemo(() => {
    let totalSessions = 0;
    let totalAdditions = 0;
    let totalDeletions = 0;
    let lastUpdated: number | null = null;

    allWorktrees.forEach(wt => {
      const stats = getWorktreeStats(wt.path);
      totalSessions += stats.sessionCount;
      totalAdditions += stats.additions;
      totalDeletions += stats.deletions;
      if (stats.lastUpdated && (!lastUpdated || stats.lastUpdated > lastUpdated)) {
        lastUpdated = stats.lastUpdated;
      }
    });

    return { totalSessions, totalAdditions, totalDeletions, lastUpdated };
  }, [allWorktrees, getWorktreeStats]);

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
          <RiFolder6Line className={cn(
            'h-4 w-4 shrink-0',
            isActive ? 'text-primary' : 'text-muted-foreground'
          )} />
          <span className={cn(
            'flex-1 truncate text-sm font-medium',
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
          <DropdownMenuContent align="end" className="min-w-[140px]">
            <DropdownMenuItem
              onClick={onClose}
              className="text-destructive focus:text-destructive"
            >
              <RiCloseLine className="mr-1.5 h-4 w-4" />
              Close Project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isRepo && onNewWorktreeSession && (
          <Tooltip delayDuration={700}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onNewWorktreeSession();
                }}
                className="h-6 w-6 flex items-center justify-center rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-muted/50 transition-all"
                aria-label="New worktree session"
              >
                <RiGitBranchLine className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">New worktree session</TooltipContent>
          </Tooltip>
        )}

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
          {allWorktrees.map((worktree) => {
            const worktreePath = normalizePath(worktree.path);
            const isWorktreeActive = worktreePath === activeWorktreePath;
            const isMain = worktreePath === normalizedProjectPath;
            const stats = getWorktreeStats(worktree.path);
            
            return (
              <WorktreeItem
                key={worktree.path}
                worktree={worktree}
                isActive={isWorktreeActive}
                isMain={isMain}
                stats={stats}
                onSelect={() => onSelectWorktree(worktree.path)}
              />
            );
          })}
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

  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());
  const [projectRepoStatus, setProjectRepoStatus] = useState<Map<string, boolean>>(new Map());
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  const [isDesktopRuntime] = useState(() => {
    if (typeof window === 'undefined') return false;
    return typeof window.opencodeDesktop !== 'undefined';
  });

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

  const handleOpenBranchPicker = useCallback(() => {
    setBranchPickerOpen(true);
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

  if (normalizedProjects.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex h-12 items-center justify-between px-3 border-b border-border/50">
          <span className="text-sm font-medium text-muted-foreground">Projects</span>
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
        </div>
        <div className="px-2 pt-2">
          <button
            type="button"
            onClick={toggleCommandPalette}
            className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
      <div className="flex h-12 items-center justify-between px-3 border-b border-border/50">
        <span className="text-sm font-medium text-muted-foreground">Projects</span>
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
      </div>

      <div className="px-2 pt-2">
        <button
          type="button"
          onClick={toggleCommandPalette}
          className="flex w-full items-center gap-2 px-2 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
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
              onNewWorktreeSession={() => handleNewWorktreeSession(project.id)}
              onOpenBranchPicker={handleOpenBranchPicker}
              isRepo={isRepo}
              getWorktreeStats={getWorktreeStats}
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
