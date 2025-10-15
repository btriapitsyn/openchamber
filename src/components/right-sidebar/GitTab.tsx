import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import {
  getGitStatus,
  getGitBranches,
  createGitCommit,
  gitPush,
  gitPull,
  gitFetch,
  checkoutBranch,
  createBranch,
  checkIsGitRepository,
  type GitStatus,
  type GitBranch,
} from '@/lib/gitApi';
import {
  GitBranch as GitBranchIcon,
  ArrowUp,
  ArrowDown,
  ArrowsClockwise,
  Plus,
  Check,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const GitTab: React.FC = () => {
  const { currentSessionId, sessions } = useSessionStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentDirectory = (currentSession as any)?.directory;
  const [isGitRepo, setIsGitRepo] = React.useState(false);
  const [status, setStatus] = React.useState<GitStatus | null>(null);
  const [branches, setBranches] = React.useState<GitBranch | null>(null);
  const [commitMessage, setCommitMessage] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load git status and branches
  const loadGitData = React.useCallback(async () => {
    if (!currentDirectory) return;

    setIsLoading(true);
    setError(null);

    try {
      const isRepo = await checkIsGitRepository(currentDirectory);
      setIsGitRepo(isRepo);

      if (!isRepo) {
        setStatus(null);
        setBranches(null);
        return;
      }

      const [statusData, branchesData] = await Promise.all([
        getGitStatus(currentDirectory),
        getGitBranches(currentDirectory),
      ]);

      setStatus(statusData);
      setBranches(branchesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load git data';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [currentDirectory]);

  // Load on mount and directory change
  React.useEffect(() => {
    loadGitData();
  }, [loadGitData]);

  const handleCommit = async () => {
    if (!currentDirectory || !commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    setIsLoading(true);
    try {
      await createGitCommit(currentDirectory, commitMessage.trim(), true);
      toast.success('Commit created successfully');
      setCommitMessage('');
      await loadGitData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create commit';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePush = async () => {
    if (!currentDirectory) return;

    setIsLoading(true);
    try {
      await gitPush(currentDirectory);
      toast.success('Pushed successfully');
      await loadGitData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to push';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePull = async () => {
    if (!currentDirectory) return;

    setIsLoading(true);
    try {
      const result = await gitPull(currentDirectory);
      toast.success(`Pulled ${result.files.length} file(s)`);
      await loadGitData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to pull';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetch = async () => {
    if (!currentDirectory) return;

    setIsLoading(true);
    try {
      await gitFetch(currentDirectory);
      toast.success('Fetched successfully');
      await loadGitData();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch';
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with actions */}
      <div className="flex h-8 items-center gap-1 bg-background/95 px-1.5">
        <button
          onClick={handleFetch}
          disabled={isLoading || !currentDirectory}
          className="rounded-md p-1 hover:bg-sidebar-hover disabled:opacity-50"
          title="Fetch from remote"
        >
          <ArrowsClockwise size={14} />
        </button>
        <button
          onClick={handlePull}
          disabled={isLoading || !currentDirectory}
          className="rounded-md p-1 hover:bg-sidebar-hover disabled:opacity-50"
          title="Pull from remote"
        >
          <ArrowDown size={14} />
        </button>
        <button
          onClick={handlePush}
          disabled={isLoading || !currentDirectory}
          className="rounded-md p-1 hover:bg-sidebar-hover disabled:opacity-50"
          title="Push to remote"
        >
          <ArrowUp size={14} />
        </button>
        <div className="flex-1" />
        <button
          onClick={loadGitData}
          disabled={isLoading || !currentDirectory}
          className="rounded-md p-1 hover:bg-sidebar-hover disabled:opacity-50"
          title="Refresh"
        >
          <ArrowsClockwise size={14} className={cn(isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {!currentDirectory ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            No directory selected
          </div>
        ) : isLoading && !status ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Loading git data...
          </div>
        ) : !isGitRepo ? (
          <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
            Not a git repository
          </div>
        ) : error && !status ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={loadGitData}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
        {/* Current branch */}
        {branches && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <GitBranchIcon size={16} />
              <span>Branch</span>
            </div>
            <div className="rounded-md bg-sidebar-accent px-3 py-2 text-sm">
              {branches.current}
            </div>
          </div>
        )}

        {/* Status summary */}
        {status && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">Status</div>
            <div className="space-y-1 text-sm">
              {status.ahead > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ArrowUp size={14} />
                  <span>{status.ahead} ahead</span>
                </div>
              )}
              {status.behind > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <ArrowDown size={14} />
                  <span>{status.behind} behind</span>
                </div>
              )}
              {status.isClean && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <Check size={14} />
                  <span>Working tree clean</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Changed files */}
        {status && status.files.length > 0 && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">
              Changes ({status.files.length})
            </div>
            <div className="space-y-1">
              {status.files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 rounded-md bg-sidebar-accent px-2 py-1.5 text-xs"
                >
                  <span
                    className={cn(
                      'w-5 font-mono font-semibold',
                      file.index === 'M' && 'text-yellow-600 dark:text-yellow-400',
                      file.index === 'A' && 'text-green-600 dark:text-green-400',
                      file.index === 'D' && 'text-red-600 dark:text-red-400',
                      file.index === '?' && 'text-gray-600 dark:text-gray-400'
                    )}
                  >
                    {file.index}
                  </span>
                  <span className="flex-1 truncate" title={file.path}>
                    {file.path}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Commit section */}
        {status && !status.isClean && (
          <div className="mb-4">
            <div className="mb-2 text-sm font-medium">Commit</div>
            <div className="space-y-2">
              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="Commit message..."
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
                rows={3}
                disabled={isLoading}
              />
              <button
                onClick={handleCommit}
                disabled={isLoading || !commitMessage.trim()}
                className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                Commit All Changes
              </button>
            </div>
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
};
