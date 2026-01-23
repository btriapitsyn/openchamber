import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

import { Input } from '@/components/ui/input';
import {
  RiGitBranchLine,
  RiSearchLine,
  RiFolderLine,
  RiAddLine,
  RiArrowRightSLine,
  RiLoader4Line,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { getGitBranches, listGitWorktrees } from '@/lib/gitApi';
import type { GitBranch, GitWorktreeInfo } from '@/lib/api/types';
import { createWorktreeSessionForBranch } from '@/lib/worktreeSessionCreator';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

interface Project {
  id: string;
  path: string;
  normalizedPath: string;
  label?: string;
}

interface BranchPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  activeProjectId: string | null;
}

interface ProjectBranchData {
  branches: GitBranch | null;
  worktrees: GitWorktreeInfo[];
  loading: boolean;
  error: string | null;
}

export function BranchPickerDialog({
  open,
  onOpenChange,
  projects,
  activeProjectId,
}: BranchPickerDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [projectData, setProjectData] = React.useState<Map<string, ProjectBranchData>>(new Map());
  const [expandedProjects, setExpandedProjects] = React.useState<Set<string>>(new Set());
  const [creatingWorktree, setCreatingWorktree] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }

    const activeProject = projects.find(p => p.id === activeProjectId);
    if (activeProject) {
      setExpandedProjects(new Set([activeProject.id]));
    }

    projects.forEach(async (project) => {
      setProjectData(prev => {
        const next = new Map(prev);
        next.set(project.id, { branches: null, worktrees: [], loading: true, error: null });
        return next;
      });

      try {
        const [branches, worktrees] = await Promise.all([
          getGitBranches(project.path),
          listGitWorktrees(project.path),
        ]);

        setProjectData(prev => {
          const next = new Map(prev);
          next.set(project.id, { branches, worktrees, loading: false, error: null });
          return next;
        });
      } catch (err) {
        setProjectData(prev => {
          const next = new Map(prev);
          next.set(project.id, {
            branches: null,
            worktrees: [],
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load',
          });
          return next;
        });
      }
    });
  }, [open, projects, activeProjectId]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleCreateWorktree = async (project: Project, branchName: string) => {
    const key = `${project.id}:${branchName}`;
    setCreatingWorktree(key);

    try {
      await createWorktreeSessionForBranch(project.path, branchName);
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to create worktree:', err);
    } finally {
      setCreatingWorktree(null);
    }
  };

  const filterBranches = (branches: string[], query: string): string[] => {
    if (!query.trim()) return branches;
    const lowerQuery = query.toLowerCase();
    return branches.filter(b => b.toLowerCase().includes(lowerQuery));
  };

  const gitRepoProjects = projects.filter(p => {
    const data = projectData.get(p.id);
    return data && !data.error && (data.loading || data.branches);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <RiGitBranchLine className="h-5 w-5" />
            Branches & Worktrees
          </DialogTitle>
          <DialogDescription>
            Start a new worktree session from any local branch
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex-shrink-0">
          <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search branches..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="space-y-1">
            {gitRepoProjects.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No git repositories found
              </div>
            ) : (
              gitRepoProjects.map((project) => {
                const data = projectData.get(project.id);
                const isExpanded = expandedProjects.has(project.id);
                const branches = data?.branches;
                const worktrees = data?.worktrees || [];
                const worktreeBranches = new Set(worktrees.map(w => w.branch).filter(Boolean));

                const allBranches = branches?.all || [];
                const filteredBranches = filterBranches(allBranches, searchQuery);
                const localBranches = filteredBranches
                  .filter(b => !b.startsWith('remotes/'))
                  .filter(b => !worktreeBranches.has(b));

                return (
                  <div key={project.id} className="rounded-md">
                    <button
                      type="button"
                      onClick={() => toggleProject(project.id)}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/30 transition-colors rounded-md"
                    >
                      <RiArrowRightSLine
                        className={cn(
                          'h-4 w-4 text-muted-foreground transition-transform',
                          isExpanded && 'rotate-90'
                        )}
                      />
                      <RiFolderLine className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm truncate flex-1 text-left">
                        {project.label || project.normalizedPath.split('/').pop() || project.normalizedPath}
                      </span>
                      {data?.loading && (
                        <RiLoader4Line className="h-4 w-4 text-muted-foreground animate-spin" />
                      )}
                      {branches && (
                        <span className="text-xs text-muted-foreground">
                          {localBranches.length} branches
                        </span>
                      )}
                    </button>
                    {isExpanded && (
                      <div className="mt-1 space-y-1 pl-6">
                        {data?.loading ? (
                          <div className="px-2 py-2 text-muted-foreground text-sm">
                            Loading branches...
                          </div>
                        ) : data?.error ? (
                          <div className="px-2 py-2 text-destructive text-sm">
                            {data.error}
                          </div>
                        ) : localBranches.length === 0 ? (
                          <div className="px-2 py-2 text-muted-foreground text-sm">
                            {searchQuery ? 'No matching branches' : 'No branches found'}
                          </div>
                        ) : (
                          localBranches.map((branchName) => {
                            const branchDetails = branches?.branches[branchName];
                            const isCurrent = branchDetails?.current;
                            const isCreating = creatingWorktree === `${project.id}:${branchName}`;

                            return (
                              <div
                                key={branchName}
                                className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-muted/30 rounded-md overflow-hidden"
                              >
                                <RiGitBranchLine className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                <div className="flex-1 min-w-0 overflow-hidden">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className={cn(
                                      'text-sm truncate',
                                      isCurrent && 'font-medium text-primary'
                                    )}>
                                      {branchName}
                                    </span>
                                    {isCurrent && (
                                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                                        current
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    {branchDetails?.commit && (
                                      <span className="font-mono">
                                        {branchDetails.commit.slice(0, 7)}
                                      </span>
                                    )}
                                    {branchDetails?.ahead !== undefined && branchDetails.ahead > 0 && (
                                      <span className="text-[color:var(--status-success)]">
                                        ↑{branchDetails.ahead}
                                      </span>
                                    )}
                                    {branchDetails?.behind !== undefined && branchDetails.behind > 0 && (
                                      <span className="text-[color:var(--status-warning)]">
                                        ↓{branchDetails.behind}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={() => handleCreateWorktree(project, branchName)}
                                      disabled={isCreating}
                                      className="inline-flex h-7 px-2 items-center justify-center text-xs rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors disabled:opacity-50 flex-shrink-0"
                                    >
                                      {isCreating ? (
                                        <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <>
                                          <RiAddLine className="h-3.5 w-3.5 mr-1" />
                                          Worktree
                                        </>
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left">
                                    Create worktree for this branch
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
