import React from 'react';
import { RiAddLine, RiCloseLine, RiDeleteBinLine, RiInformationLine } from '@remixicon/react';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { checkIsGitRepository } from '@/lib/gitApi';
import { getWorktreeSetupCommands, saveWorktreeSetupCommands } from '@/lib/openchamberConfig';
import { listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import { sessionEvents } from '@/lib/sessionEvents';
import type { WorktreeMetadata } from '@/types/worktree';
import { formatPathForDisplay } from '@/lib/utils';

export const WorktreeSectionContent: React.FC = () => {
  const activeProject = useProjectsStore((state) => state.getActiveProject());

  const projectPath = activeProject?.path ?? null;

  const { sessions, getWorktreeMetadata } = useSessionStore();
  const homeDirectory = useDirectoryStore((state) => state.homeDirectory);

  const [setupCommands, setSetupCommands] = React.useState<string[]>([]);
  const [isLoadingCommands, setIsLoadingCommands] = React.useState(false);
  const [isGitRepoLocal, setIsGitRepoLocal] = React.useState<boolean | null>(null);
  const [availableWorktrees, setAvailableWorktrees] = React.useState<WorktreeMetadata[]>([]);
  const [isLoadingWorktrees, setIsLoadingWorktrees] = React.useState(false);

  const projectRef = React.useMemo(() => {
    if (!activeProject?.id || !projectPath) {
      return null;
    }
    return { id: activeProject.id, path: projectPath };
  }, [activeProject?.id, projectPath]);

  const refreshWorktrees = React.useCallback(async () => {
    if (!projectRef || isGitRepoLocal === false) return;

    try {
      const worktrees = await listProjectWorktrees(projectRef);
      setAvailableWorktrees(worktrees);
    } catch {
      // Ignore errors
    }
  }, [projectRef, isGitRepoLocal]);

  // Load repo info
  React.useEffect(() => {
    if (!projectPath) return;

    let cancelled = false;
    setIsGitRepoLocal(null);

    (async () => {
      try {
        const repoStatus = await checkIsGitRepository(projectPath);
        if (cancelled) return;
        setIsGitRepoLocal(repoStatus);
      } catch {
        // Ignore errors
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectPath]);

  // Load existing worktrees
  React.useEffect(() => {
    if (!projectRef) {
      setAvailableWorktrees([]);
      setIsLoadingWorktrees(false);
      return;
    }

    if (isGitRepoLocal === false) {
      setAvailableWorktrees([]);
      setIsLoadingWorktrees(false);
      return;
    }

    let cancelled = false;
    setIsLoadingWorktrees(true);
    setAvailableWorktrees([]);

    (async () => {
      try {
        const worktrees = await listProjectWorktrees(projectRef);
        if (cancelled) return;
        setAvailableWorktrees(worktrees);
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setIsLoadingWorktrees(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectRef, isGitRepoLocal]);

  // Load setup commands
  React.useEffect(() => {
    if (!projectRef) return;

    let cancelled = false;
    setIsLoadingCommands(true);

    (async () => {
      try {
        const commands = await getWorktreeSetupCommands(projectRef);
        if (!cancelled) {
          setSetupCommands(commands.length > 0 ? commands : ['']);
        }
      } catch {
        if (!cancelled) {
          setSetupCommands(['']);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingCommands(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectRef]);

  const handleSetupCommandChange = React.useCallback((index: number, value: string) => {
    setSetupCommands((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }, []);

  const handleAddCommand = React.useCallback(() => {
    setSetupCommands((prev) => [...prev, '']);
  }, []);

  const persistSetupCommands = React.useCallback(async (commands: string[]) => {
    if (!projectRef) return;
    const filtered = commands.filter((cmd) => cmd.trim().length > 0);
    await saveWorktreeSetupCommands(projectRef, filtered);
  }, [projectRef]);

  const handleRemoveCommand = React.useCallback((index: number) => {
    setSetupCommands((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Keep at least 1 row in UI, but persist empty config when all removed.
      void persistSetupCommands(next);
      return next.length > 0 ? next : [''];
    });
  }, [persistSetupCommands]);

  // Save setup commands on blur
  const handleCommandBlur = React.useCallback(() => {
    void persistSetupCommands(setupCommands);
  }, [persistSetupCommands, setupCommands]);

  // Delete worktree handler
  const handleDeleteWorktree = React.useCallback((worktree: WorktreeMetadata) => {
    const normalize = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '');
    const normalizedWorktreePath = normalize(worktree.path);

    // Find sessions linked to this worktree by:
    // 1. Worktree metadata path match
    // 2. Session directory match
    const directSessions = sessions.filter((session) => {
      // Check worktree metadata
      const metadata = getWorktreeMetadata(session.id);
      if (metadata?.path && normalize(metadata.path) === normalizedWorktreePath) {
        return true;
      }

      // Check session directory
      const sessionDir = (session as { directory?: string }).directory;
      if (sessionDir) {
        const normalizedSessionDir = normalize(sessionDir);
        if (normalizedSessionDir === normalizedWorktreePath) {
          return true;
        }
      }

      return false;
    });

    // Build a set of session IDs that are directly linked
    const directSessionIds = new Set(directSessions.map((s) => s.id));

    // Find all subsessions recursively
    const findSubsessions = (parentIds: Set<string>): typeof sessions => {
      const subsessions = sessions.filter((session) => {
        const parentID = (session as { parentID?: string | null }).parentID;
        return parentID && parentIds.has(parentID);
      });
      if (subsessions.length === 0) {
        return [];
      }
      const subsessionIds = new Set(subsessions.map((s) => s.id));
      return [...subsessions, ...findSubsessions(subsessionIds)];
    };

    const allSubsessions = findSubsessions(directSessionIds);

    // Dedupe sessions (in case same session matched both ways)
    const seenIds = new Set<string>();
    const allSessions = [...directSessions, ...allSubsessions].filter((session) => {
      if (seenIds.has(session.id)) {
        return false;
      }
      seenIds.add(session.id);
      return true;
    });

    sessionEvents.requestDelete({
      sessions: allSessions,
      mode: 'worktree',
      worktree,
    });
  }, [sessions, getWorktreeMetadata]);



  // Refresh worktrees when sessions change (after deletion)
  const sessionsKey = React.useMemo(() => sessions.map(s => s.id).join(','), [sessions]);
  React.useEffect(() => {
    if (isGitRepoLocal && projectPath) {
      refreshWorktrees();
    }
  }, [sessionsKey, isGitRepoLocal, projectPath, refreshWorktrees]);

  if (!projectPath) {
    return (
      <p className="typography-meta text-muted-foreground">
        Select a project to manage worktrees.
      </p>
    );
  }

  if (isGitRepoLocal === false) {
    return (
      <p className="typography-meta text-muted-foreground">
        Worktree settings are only available for Git repositories.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Setup commands */}
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="typography-ui-header font-semibold text-foreground">Setup commands</h3>
          <p className="typography-meta text-muted-foreground">
            Run automatically inside the new worktree directory when a worktree is created.
            <br />
            Use <code className="font-mono text-xs bg-sidebar-accent/50 px-1 rounded">$ROOT_PROJECT_PATH</code> for the project root.
          </p>
        </div>

        {isLoadingCommands ? (
          <p className="typography-meta text-muted-foreground">Loading...</p>
        ) : (
          <div className="space-y-2">
            {setupCommands.map((command, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={command}
                  onChange={(e) => handleSetupCommandChange(index, e.target.value)}
                  onBlur={handleCommandBlur}
                  placeholder="e.g., bun install"
                  className="flex-1 font-mono text-xs"
                />
                  <button
                    type="button"
                    onClick={() => {
                    handleRemoveCommand(index);
                    }}
                    className="flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                    aria-label="Remove command"
                  >
                  <RiCloseLine className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddCommand}
              className="flex items-center gap-1.5 typography-meta text-muted-foreground hover:text-foreground transition-colors"
            >
              <RiAddLine className="h-3.5 w-3.5" />
              Add command
            </button>
          </div>
        )}
      </div>

      {/* Existing worktrees */}
      <div className="space-y-4 border-t border-border/40 pt-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="typography-ui-header font-semibold text-foreground">Existing worktrees</h3>
            <Tooltip delayDuration={1000}>
              <TooltipTrigger asChild>
                <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
              </TooltipTrigger>
              <TooltipContent sideOffset={8} className="max-w-xs">
                Worktrees live outside the repo (OpenCode-managed). Deleting a worktree also removes linked sessions.
              </TooltipContent>
            </Tooltip>
          </div>
          <p className="typography-meta text-muted-foreground">
            Manage worktrees for this project
          </p>
        </div>

        {isLoadingWorktrees ? (
          <p className="typography-meta text-muted-foreground">Loading worktrees...</p>
        ) : availableWorktrees.length === 0 ? (
          <p className="typography-meta text-muted-foreground/70">
            No worktrees found for this project
          </p>
        ) : (
          <div className="space-y-1">
            {availableWorktrees.map((worktree) => (
              <div
                key={worktree.path}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent/30 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="typography-meta text-foreground truncate min-w-0">
                      {worktree.label || worktree.branch || 'Detached HEAD'}
                    </p>
                    <span className="typography-micro text-muted-foreground/60 px-1.5 py-[1px] rounded bg-sidebar-accent/40 flex-shrink-0 self-center leading-none">
                      OpenCode
                    </span>
                  </div>
                  <p className="typography-micro text-muted-foreground/60 truncate">
                    {formatPathForDisplay(worktree.path, homeDirectory)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteWorktree(worktree)}
                  className="flex-shrink-0 flex h-7 w-7 items-center justify-center rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  aria-label={`Delete worktree ${worktree.branch || worktree.label}`}
                >
                  <RiDeleteBinLine className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
