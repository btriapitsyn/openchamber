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
import { Toggle } from '@/components/ui/toggle';
import { DirectoryTree } from './DirectoryTree';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useFileSystemAccess } from '@/hooks/useFileSystemAccess';
import { cn, formatPathForDisplay } from '@/lib/utils';
import { toast } from 'sonner';
import { RiCheckboxBlankLine, RiCheckboxLine } from '@remixicon/react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { useDeviceInfo } from '@/lib/device';

const SHOW_HIDDEN_STORAGE_KEY = 'directoryTreeShowHidden';

interface DirectoryExplorerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DirectoryExplorerDialog: React.FC<DirectoryExplorerDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { currentDirectory, homeDirectory, setDirectory, isHomeReady } = useDirectoryStore();
  const [pendingPath, setPendingPath] = React.useState<string | null>(null);
  const [hasUserSelection, setHasUserSelection] = React.useState(false);
  const [isConfirming, setIsConfirming] = React.useState(false);
  const [showHidden, setShowHidden] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') {
      return false;
    }
    try {
      const stored = window.localStorage.getItem(SHOW_HIDDEN_STORAGE_KEY);
      if (stored === 'true') {
        return true;
      }
      if (stored === 'false') {
        return false;
      }
    } catch {
      // Ignore storage read errors
    }
    return false;
  });
  const { isDesktop, requestAccess, startAccessing } = useFileSystemAccess();
  const { isMobile } = useDeviceInfo();

  React.useEffect(() => {
    if (open) {
      setPendingPath(null);
      setHasUserSelection(false);
      setIsConfirming(false);
    }
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      return;
    }
    if (!hasUserSelection && !pendingPath && homeDirectory && isHomeReady) {
      setPendingPath(homeDirectory);
      setHasUserSelection(true);
    }
  }, [open, hasUserSelection, pendingPath, homeDirectory, isHomeReady]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(SHOW_HIDDEN_STORAGE_KEY, showHidden ? 'true' : 'false');
    } catch {
      // Ignore storage write errors
    }
  }, [showHidden]);

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
      <DialogContent
        className={cn(
          'flex w-full max-w-[min(640px,100vw)] max-h-[calc(100vh-32px)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[80vh] sm:max-w-4xl sm:p-6',
          isMobile && 'pwa-compact'
        )}
      >
        <DialogHeader
          className={cn(
            'flex-shrink-0 px-4 pb-3 pt-[calc(var(--oc-safe-area-top,0px)+0.5rem)] sm:px-0 sm:pb-4 sm:pt-[calc(var(--oc-safe-area-top,0px)+0px)]',
            isMobile && 'pb-2'
          )}
        >
          <DialogTitle>Select project directory</DialogTitle>
          <DialogDescription className="hidden sm:block">
            Choose the working directory used for sessions, commands, and OpenCode operations.
          </DialogDescription>
        </DialogHeader>

        <ScrollableOverlay
          outerClassName="flex-1 min-h-0 overflow-hidden"
          className="directory-dialog-body px-2.5 pb-2.5 sm:px-0 sm:pb-0"
        >
          <div className="rounded-xl border border-border/40 bg-sidebar/60 px-3 py-2 sm:px-4 sm:py-3">
            <span className="typography-micro text-muted-foreground">Currently selected</span>
            <div
              className="typography-ui-label font-medium text-foreground truncate"
              title={formatPathForDisplay(currentDirectory, homeDirectory)}
            >
              {formatPathForDisplay(currentDirectory, homeDirectory)}
            </div>
          </div>

          <div className="directory-grid mt-2 grid gap-2 grid-cols-1 sm:mt-4 sm:gap-4 sm:grid-cols-[minmax(260px,340px)_minmax(0,1fr)]">
            <div className="rounded-xl border border-border/40 bg-sidebar/70 p-1.5 sm:p-2 sm:h-auto">
              <DirectoryTree
                variant="inline"
                currentPath={pendingPath ?? currentDirectory}
                onSelectPath={handleSelectPath}
                onDoubleClickPath={handleDoubleClickPath}
                className="min-h-[280px] h-[55vh] sm:h-[440px]"
                selectionBehavior="deferred"
                showHidden={showHidden}
                rootDirectory={isHomeReady ? homeDirectory : null}
                isRootReady={isHomeReady}
              />
            </div>

            <div className="flex flex-col gap-2.5 sm:gap-3">
              <div className="rounded-xl border border-border/40 bg-sidebar/60 px-3 py-2 sm:px-4 sm:py-3">
                <span className="typography-micro text-muted-foreground">Selected directory</span>
                <div
                  className="typography-ui-label font-medium text-foreground truncate"
                  title={pendingPath ? formattedPendingPath : undefined}
                >
                  {formattedPendingPath}
                </div>
              </div>
              <Toggle
                pressed={showHidden}
                onPressedChange={(value) => setShowHidden(Boolean(value))}
                variant="outline"
                className="w-full justify-start gap-2 rounded-xl border-border/40 bg-sidebar/60 px-3 py-2 text-foreground min-w-0 h-auto sm:px-4 sm:py-3"
              >
                {showHidden ? (
                  <RiCheckboxLine className="h-4 w-4" />
                ) : (
                  <RiCheckboxBlankLine className="h-4 w-4" />
                )}
                Show hidden directories
              </Toggle>
              <div className="hidden rounded-xl border border-dashed border-border/40 bg-sidebar/40 px-3 py-2 sm:block sm:px-4 sm:py-3">
                <p className="typography-meta text-muted-foreground">
                  Use the tree to browse, pin frequently used locations, or create a new directory.
                  Select a folder, then confirm to update the working directory for OpenChamber.
                </p>
              </div>
            </div>
          </div>
        </ScrollableOverlay>

        <DialogFooter
          className={cn(
            'sticky bottom-0 flex w-full flex-shrink-0 flex-col gap-2 border-t border-border/40 bg-sidebar px-4 py-3 sm:static sm:flex-row sm:justify-end sm:gap-2 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0',
            isMobile && 'gap-1 px-3 py-2'
          )}
        >
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isConfirming}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isConfirming || !hasUserSelection || !pendingPath}
            className="w-full sm:w-auto"
          >
            {isConfirming ? 'Applying...' : 'Use Selected Directory'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
