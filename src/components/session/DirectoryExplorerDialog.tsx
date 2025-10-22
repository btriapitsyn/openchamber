import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DirectoryTree } from './DirectoryTree';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';
import { formatPathForDisplay } from '@/lib/utils';
import { toast } from 'sonner';

interface DirectoryExplorerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DirectoryExplorerDialog: React.FC<DirectoryExplorerDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentDirectory, homeDirectory, setDirectory } = useDirectoryStore();
  const [pendingPath, setPendingPath] = React.useState<string | null>(null);
  const [hasUserSelection, setHasUserSelection] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const { isDesktop, requestAccess, startAccessing } = useFileSystemAccess();

  React.useEffect(() => {
    if (open) {
      setPendingPath(null);
      setHasUserSelection(false);
      setIsConfirming(false);
    }
  }, [open]);

  const formattedPendingPath = React.useMemo(() => {
    if (!pendingPath) {
      return 'Select a directory';
    }
    return formatPathForDisplay(pendingPath, homeDirectory);
  }, [pendingPath, homeDirectory]);

  const handleClose = React.useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  const finalizeSelection = React.useCallback(async (targetPath: string) => {
    if (!targetPath || isConfirming) {
      return;
    }
    if (targetPath === currentDirectory) {
      handleClose();
      return;
    }
    setIsConfirming(true);
    try {
      let resolvedPath = targetPath;

      if (isDesktop) {
        const accessResult = await requestAccess(targetPath);
        if (!accessResult.success) {
          toast.error('Unable to access directory', {
            description: accessResult.error || 'Desktop denied directory access.',
          });
          return;
        }
        resolvedPath = accessResult.path ?? targetPath;

        const startResult = await startAccessing(resolvedPath);
        if (!startResult.success) {
          toast.error('Failed to open directory', {
            description: startResult.error || 'Desktop could not grant file access.',
          });
          return;
        }
      }

      setDirectory(resolvedPath);
      handleClose();
    } catch (error) {
      toast.error('Failed to select directory', {
        description: error instanceof Error ? error.message : 'Unknown error occurred.',
      });
    } finally {
      setIsConfirming(false);
    }
  }, [
    currentDirectory,
    handleClose,
    isDesktop,
    requestAccess,
    setDirectory,
    startAccessing,
    isConfirming,
  ]);

  const handleConfirm = React.useCallback(async () => {
    if (!pendingPath) {
      return;
    }
    await finalizeSelection(pendingPath);
  }, [finalizeSelection, pendingPath]);

  const handleSelectPath = React.useCallback((path: string) => {
    setPendingPath(path);
    setHasUserSelection(true);
  }, []);

  const handleDoubleClickPath = React.useCallback(async (path: string) => {
    setPendingPath(path);
    setHasUserSelection(true);
    await finalizeSelection(path);
  }, [
    finalizeSelection,
  ]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select project directory</DialogTitle>
          <DialogDescription>
            Choose the working directory used for sessions, commands, and OpenCode operations.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-border/40 bg-sidebar/60 px-3 py-2">
            <span className="typography-micro text-muted-foreground">Currently selected</span>
            <div
              className="typography-ui-label font-medium text-foreground truncate"
              title={formatPathForDisplay(currentDirectory, homeDirectory)}
            >
              {formatPathForDisplay(currentDirectory, homeDirectory)}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border/40 bg-sidebar/70 p-2">
              <DirectoryTree
                variant="inline"
                currentPath={pendingPath ?? ''}
                onSelectPath={handleSelectPath}
                onDoubleClickPath={handleDoubleClickPath}
                className="h-[440px]"
                selectionBehavior="deferred"
              />
            </div>

            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-border/40 bg-sidebar/60 px-3 py-2">
                <span className="typography-micro text-muted-foreground">Selected directory</span>
                <div
                  className="typography-ui-label font-medium text-foreground truncate"
                  title={pendingPath ? formattedPendingPath : undefined}
                >
                  {formattedPendingPath}
                </div>
              </div>
              <div className="rounded-xl border border-dashed border-border/40 bg-sidebar/40 px-3 py-2">
                <p className="typography-meta text-muted-foreground">
                  Use the tree to browse, pin frequently used locations, or create a new directory.
                  Select a folder, then confirm to update the working directory for OpenChamber.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isConfirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming || !hasUserSelection || !pendingPath}
          >
            {isConfirming ? 'Applying...' : 'Use Selected Directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
