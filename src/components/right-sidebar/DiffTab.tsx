import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { getGitStatus, checkIsGitRepository, type GitStatus } from '@/lib/gitApi';
import { GitDiff, ArrowsClockwise } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export const DiffTab: React.FC = () => {
  const { currentSessionId, sessions } = useSessionStore();
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const currentDirectory = (currentSession as any)?.directory;
  const [isGitRepo, setIsGitRepo] = React.useState(false);
  const [status, setStatus] = React.useState<GitStatus | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load git status
  const loadGitStatus = React.useCallback(async () => {
    if (!currentDirectory) return;

    setIsLoading(true);
    setError(null);

    try {
      const isRepo = await checkIsGitRepository(currentDirectory);
      setIsGitRepo(isRepo);

      if (!isRepo) {
        setStatus(null);
        return;
      }

      const statusData = await getGitStatus(currentDirectory);
      setStatus(statusData);

      // Clear selection if selected file no longer exists
      if (selectedFile && !statusData.files.some(f => f.path === selectedFile)) {
        setSelectedFile(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load git status';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [currentDirectory, selectedFile]);

  // Load on mount and directory change
  React.useEffect(() => {
    loadGitStatus();
  }, [loadGitStatus]);

  const getFileStatusLabel = (index: string, workingDir: string): string => {
    if (index === 'M') return 'Modified';
    if (index === 'A') return 'Added';
    if (index === 'D') return 'Deleted';
    if (index === '?') return 'Untracked';
    if (index === 'R') return 'Renamed';
    return 'Changed';
  };

  const getFileStatusColor = (index: string): string => {
    if (index === 'M') return 'text-yellow-600 dark:text-yellow-400';
    if (index === 'A') return 'text-green-600 dark:text-green-400';
    if (index === 'D') return 'text-red-600 dark:text-red-400';
    if (index === '?') return 'text-gray-600 dark:text-gray-400';
    if (index === 'R') return 'text-blue-600 dark:text-blue-400';
    return 'text-muted-foreground';
  };

  const changedFiles = status?.files || [];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header with refresh */}
      <div className="flex h-8 items-center gap-2 bg-background/95 px-1.5">
        <GitDiff size={14} />
        <span className="flex-1 text-xs font-medium">
          {changedFiles.length} {changedFiles.length === 1 ? 'file' : 'files'} changed
        </span>
        <button
          onClick={loadGitStatus}
          disabled={isLoading || !currentDirectory}
          className="rounded-md p-1 hover:bg-sidebar-hover disabled:opacity-50"
          title="Refresh"
        >
          <ArrowsClockwise size={14} className={cn(isLoading && 'animate-spin')} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {!currentDirectory ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No directory selected
          </div>
        ) : isLoading && !status ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Loading file changes...
          </div>
        ) : !isGitRepo ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            Not a git repository
          </div>
        ) : error && !status ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <button
              onClick={loadGitStatus}
              className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : changedFiles.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
            No changes detected
          </div>
        ) : (
          <div className="divide-y">
            {changedFiles.map((file, index) => (
              <div
                key={index}
                onClick={() => setSelectedFile(file.path === selectedFile ? null : file.path)}
                className={cn(
                  'cursor-pointer px-3 py-2.5 transition-colors hover:bg-sidebar-hover',
                  selectedFile === file.path && 'bg-sidebar-accent'
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs font-semibold',
                      getFileStatusColor(file.index)
                    )}
                  >
                    {file.index}
                  </span>
                  <span className="flex-1 truncate text-sm" title={file.path}>
                    {file.path}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {getFileStatusLabel(file.index, file.working_dir)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Selected file details */}
      {selectedFile && (
        <div className="border-t bg-sidebar-accent p-3">
          <div className="text-xs text-muted-foreground">Selected file:</div>
          <div className="mt-1 truncate text-sm font-medium" title={selectedFile}>
            {selectedFile}
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Diff viewing coming soon...
          </div>
        </div>
      )}
    </div>
  );
};
