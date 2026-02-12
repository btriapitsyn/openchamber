import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui';
import {
  RiCheckLine,
  RiCloseLine,
  RiDeleteBinLine,
  RiGitBranchLine,
  RiLoader4Line,
  RiPencilLine,
  RiSearchLine,
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { deleteGitBranch, getGitBranches, git, renameBranch } from '@/lib/gitApi';
import type { GitBranch, GitWorktreeInfo } from '@/lib/api/types';

export interface BranchPickerProject {
  id: string;
  path: string;
  normalizedPath: string;
  label?: string;
}

interface BranchPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: BranchPickerProject | null;
}

const displayProjectName = (project: BranchPickerProject): string =>
  project.label || project.normalizedPath.split('/').pop() || project.normalizedPath;

export function BranchPickerDialog({ open, onOpenChange, project }: BranchPickerDialogProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const [branches, setBranches] = React.useState<GitBranch | null>(null);
  const [worktrees, setWorktrees] = React.useState<GitWorktreeInfo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [deletingBranch, setDeletingBranch] = React.useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState<string | null>(null);
  const [forceDeleteBranch, setForceDeleteBranch] = React.useState<string | null>(null);
  const [editingBranch, setEditingBranch] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');
  const [renamingBranchKey, setRenamingBranchKey] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!project) return;
    setLoading(true);
    setError(null);
    try {
      const [b, w] = await Promise.all([
        getGitBranches(project.path),
        git.worktree.list(project.path),
      ]);
      setBranches(b);
      setWorktrees(w);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setBranches(null);
      setWorktrees([]);
    } finally {
      setLoading(false);
    }
  }, [project]);

  React.useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setConfirmingDelete(null);
      setForceDeleteBranch(null);
      setEditingBranch(null);
      setEditValue('');
      setRenamingBranchKey(null);
      return;
    }
    void refresh();
  }, [open, refresh]);

  const filterBranches = (list: string[], query: string): string[] => {
    if (!query.trim()) return list;
    const lower = query.toLowerCase();
    return list.filter((b) => b.toLowerCase().includes(lower));
  };

  const beginRename = React.useCallback((branchName: string) => {
    setEditingBranch(branchName);
    setEditValue(branchName);
  }, []);

  const cancelRename = React.useCallback(() => {
    setEditingBranch(null);
    setEditValue('');
    setRenamingBranchKey(null);
  }, []);

  const cancelDelete = React.useCallback(() => {
    setConfirmingDelete(null);
    setForceDeleteBranch(null);
  }, []);

  const commitRename = React.useCallback(async (oldName: string) => {
    if (!project) return;
    const newName = editValue.trim();
    if (!newName || newName === oldName) {
      cancelRename();
      return;
    }

    setRenamingBranchKey(oldName);
    try {
      const result = await renameBranch(project.path, oldName, newName);
      if (!result?.success) {
        throw new Error('Rename rejected');
      }
      await refresh();
      cancelRename();
      toast.success('Branch renamed', { description: `${oldName} -> ${newName}` });
    } catch (err) {
      toast.error('Failed to rename branch', {
        description: err instanceof Error ? err.message : 'Rename failed',
      });
      setRenamingBranchKey(null);
    }
  }, [project, editValue, refresh, cancelRename]);

  const handleDeleteBranch = React.useCallback(async (branchName: string) => {
    if (!project) return;
    setDeletingBranch(branchName);
    try {
      const force = forceDeleteBranch === branchName;
      const result = await deleteGitBranch(project.path, { branch: branchName, force });
      if (!result?.success) {
        throw new Error('Delete rejected');
      }
      await refresh();
      toast.success('Branch deleted', { description: branchName });
      setConfirmingDelete(null);
      setForceDeleteBranch(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Delete failed';
      // If branch isn't merged, prompt for force delete on next confirm.
      if (/not fully merged/i.test(message) && forceDeleteBranch !== branchName) {
        setForceDeleteBranch(branchName);
        toast.error('Branch not merged', {
          description: 'Confirm again to force delete',
        });
      } else {
        toast.error('Failed to delete branch', { description: message });
      }
    } finally {
      setDeletingBranch(null);
    }
  }, [project, refresh, forceDeleteBranch]);

  const worktreeBranches = new Set(worktrees.map((w) => w.branch).filter(Boolean));
  const allBranches = branches?.all || [];
  const filteredBranches = filterBranches(allBranches, searchQuery);
  const localBranches = filteredBranches.filter((b) => !b.startsWith('remotes/'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[70vh] flex flex-col overflow-hidden gap-3">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <RiGitBranchLine className="h-5 w-5" />
            Manage Branches
          </DialogTitle>
          <DialogDescription>
            {project ? `Local branches for ${displayProjectName(project)}` : 'Select a project'}
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
            {!project ? (
              <div className="text-center py-8 text-muted-foreground">No project selected</div>
            ) : loading ? (
              <div className="px-2 py-2 text-muted-foreground text-sm">Loading branches...</div>
            ) : error ? (
              <div className="px-2 py-2 text-destructive text-sm">{error}</div>
            ) : localBranches.length === 0 ? (
              <div className="px-2 py-2 text-muted-foreground text-sm">
                {searchQuery ? 'No matching branches' : 'No branches found'}
              </div>
            ) : (
              localBranches.map((branchName) => {
                const details = branches?.branches[branchName];
                const isCurrent = Boolean(details?.current);
                const isDeleting = deletingBranch === branchName;
                const isRenaming = renamingBranchKey === branchName;
                const hasAttachedWorktree = worktreeBranches.has(branchName);
                const isEditing = editingBranch === branchName;
                const isConfirming = confirmingDelete === branchName;
                const isForceDelete = forceDeleteBranch === branchName;

                const disableDelete = Boolean(isCurrent || hasAttachedWorktree || isDeleting || isRenaming || isEditing);
                const disableRename = Boolean(hasAttachedWorktree || isDeleting || isRenaming || isEditing);

                return (
                  <div
                    key={branchName}
                    className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-interactive-hover/30 rounded-md overflow-hidden"
                  >
                    <RiGitBranchLine className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isEditing ? (
                          <form
                            className="flex w-full items-center min-w-0"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void commitRename(branchName);
                            }}
                          >
                            <input
                              value={editValue}
                              onChange={(event) => setEditValue(event.target.value)}
                              className="flex-1 min-w-0 h-5 bg-transparent text-sm leading-none outline-none placeholder:text-muted-foreground"
                              autoFocus
                              placeholder="Rename branch"
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelRename();
                                }
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void commitRename(branchName);
                                }
                              }}
                            />
                          </form>
                        ) : (
                          <span className={cn('text-sm truncate', isCurrent && 'font-medium text-primary')}>
                            {branchName}
                          </span>
                        )}

                        {isCurrent && (
                          <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                            current
                          </span>
                        )}

                        {hasAttachedWorktree && !isEditing && (
                          <span className="text-xs bg-muted/40 text-muted-foreground px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap">
                            worktree
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {details?.commit ? (
                          <span className="font-mono">{details.commit.slice(0, 7)}</span>
                        ) : null}
                        {typeof details?.ahead === 'number' && details.ahead > 0 ? (
                          <span className="text-[color:var(--status-success)]">↑{details.ahead}</span>
                        ) : null}
                        {typeof details?.behind === 'number' && details.behind > 0 ? (
                          <span className="text-[color:var(--status-warning)]">↓{details.behind}</span>
                        ) : null}
                      </div>
                    </div>

                    {!isEditing && !isConfirming ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Tooltip delayDuration={700}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => beginRename(branchName)}
                              disabled={disableRename}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-interactive-hover/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                              aria-label="Rename"
                            >
                              <RiPencilLine className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {hasAttachedWorktree ? 'Rename (remove worktree first)' : 'Rename'}
                          </TooltipContent>
                        </Tooltip>

                        <Tooltip delayDuration={700}>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setConfirmingDelete(branchName)}
                              disabled={disableDelete}
                              className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                              aria-label="Delete"
                            >
                              {isDeleting ? (
                                <RiLoader4Line className="h-4 w-4 animate-spin" />
                              ) : (
                                <RiDeleteBinLine className="h-4 w-4" />
                              )}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="left">
                            {isCurrent
                              ? 'Delete (current branch)'
                              : hasAttachedWorktree
                                ? 'Delete (remove worktree first)'
                                : 'Delete'}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ) : null}

                    {isEditing ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => void commitRename(branchName)}
                          disabled={isRenaming}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-interactive-hover/40 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                          aria-label="Confirm rename"
                        >
                          {isRenaming ? (
                            <RiLoader4Line className="h-4 w-4 animate-spin" />
                          ) : (
                            <RiCheckLine className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-interactive-hover/40 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Cancel rename"
                        >
                          <RiCloseLine className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}

                    {!isEditing && isConfirming ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className={cn(
                          'text-xs mr-1',
                          isForceDelete ? 'text-destructive' : 'text-muted-foreground'
                        )}>
                          {isForceDelete ? 'Force delete?' : 'Delete?'}
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleDeleteBranch(branchName)}
                          disabled={isDeleting}
                          className={cn(
                            'inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:opacity-50',
                            isForceDelete
                              ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                              : 'hover:bg-destructive/10 text-muted-foreground hover:text-destructive'
                          )}
                          aria-label="Confirm delete"
                        >
                          {isDeleting ? (
                            <RiLoader4Line className="h-4 w-4 animate-spin" />
                          ) : (
                            <RiCheckLine className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={cancelDelete}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-interactive-hover/40 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Cancel delete"
                        >
                          <RiCloseLine className="h-4 w-4" />
                        </button>
                      </div>
                    ) : null}
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
