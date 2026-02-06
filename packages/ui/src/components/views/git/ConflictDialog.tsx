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
import { RiAlertLine, RiTerminalBoxLine } from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictFiles?: string[];
  directory: string;
  operation: 'merge' | 'rebase';
  onAbort: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  open,
  onOpenChange,
  conflictFiles = [],
  directory,
  operation,
  onAbort,
}) => {
  const openNewSessionDraft = useSessionStore((state) => state.openNewSessionDraft);

  const handleResolveInNewSession = () => {
    // Open new session in the directory with conflicts
    openNewSessionDraft({ directoryOverride: directory });
    onOpenChange(false);
  };

  const handleAbort = () => {
    onAbort();
    onOpenChange(false);
  };

  const handleContinueLater = () => {
    onOpenChange(false);
  };

  const operationLabel = operation === 'merge' ? 'Merge' : 'Rebase';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RiAlertLine className="size-5 text-[var(--status-warning)]" />
            <DialogTitle>{operationLabel} Conflicts Detected</DialogTitle>
          </div>
          <DialogDescription>
            The {operation} operation resulted in conflicts that need to be resolved.
          </DialogDescription>
        </DialogHeader>

        {conflictFiles.length > 0 && (
          <div className="space-y-2">
            <p className="typography-meta text-muted-foreground">
              Conflicted files:
            </p>
            <div className="bg-[var(--surface-elevated)] rounded-lg p-3 max-h-32 overflow-y-auto">
              <ul className="space-y-1">
                {conflictFiles.map((file, index) => (
                  <li
                    key={index}
                    className="typography-micro text-foreground font-mono truncate"
                    title={file}
                  >
                    {file}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleContinueLater}
          >
            Continue Later
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAbort}
          >
            Abort {operationLabel}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleResolveInNewSession}
            className="gap-1.5"
          >
            <RiTerminalBoxLine className="size-4" />
            Resolve in New Session
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
