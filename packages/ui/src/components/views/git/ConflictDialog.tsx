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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { RiAlertLine, RiSparklingLine, RiLoader4Line, RiArrowDownSLine, RiChat1Line, RiAddLine } from '@remixicon/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useMessageStore } from '@/stores/messageStore';
import { useUIStore } from '@/stores/useUIStore';
import { toast } from '@/components/ui';
import { getConflictDetails, type MergeConflictDetails } from '@/lib/gitApi';

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conflictFiles?: string[];
  directory: string;
  operation: 'merge' | 'rebase';
  onAbort: () => void;
  onClearState?: () => void;
}

export const ConflictDialog: React.FC<ConflictDialogProps> = ({
  open,
  onOpenChange,
  conflictFiles = [],
  directory,
  operation,
  onAbort,
  onClearState,
}) => {
  const openNewSessionDraft = useSessionStore((state) => state.openNewSessionDraft);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const setActiveMainTab = useUIStore((state) => state.setActiveMainTab);

  const [isLoading, setIsLoading] = React.useState(false);
  const [conflictDetails, setConflictDetails] = React.useState<MergeConflictDetails | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Fetch conflict details when dialog opens
  React.useEffect(() => {
    if (!open || !directory) return;

    setIsLoading(true);
    setLoadError(null);
    setConflictDetails(null);

    getConflictDetails(directory)
      .then((details) => {
        setConflictDetails(details);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load conflict details';
        setLoadError(message);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [open, directory]);

  const buildConflictContext = React.useCallback((): {
    visibleText: string;
    instructionsText: string;
    payloadText: string;
  } | null => {
    if (!conflictDetails) return null;

    const operationLabel = operation === 'merge' ? 'merge' : 'rebase';
    const headRef = conflictDetails.headInfo || (operation === 'merge' ? 'MERGE_HEAD' : 'REBASE_HEAD');

    const visibleText = `Resolve ${operationLabel} conflicts while preserving the intent of changes from ${headRef}. After resolving, report whether the ${operationLabel} can be completed.`;

    const instructionsText = `Git ${operationLabel} operation is in progress with conflicts.
- Directory: ${directory}
- Operation: ${operation}
- Head Info: ${conflictDetails.headInfo || 'N/A'}

Goal:
- Resolve all conflicts in the working directory.
- Preserve the intent of changes from both sides.
- After edits, indicate whether I can complete the ${operationLabel} (e.g., git merge --continue or git rebase --continue).
`;

    const payloadText = `${operationLabel} conflict context (JSON)\n${JSON.stringify(
      {
        directory,
        operation: conflictDetails.operation,
        headInfo: conflictDetails.headInfo,
        statusPorcelain: conflictDetails.statusPorcelain,
        unmergedFiles: conflictDetails.unmergedFiles,
        diff: conflictDetails.diff,
      },
      null,
      2
    )}`;

    return { visibleText, instructionsText, payloadText };
  }, [conflictDetails, directory, operation]);

  const handleAbort = () => {
    onAbort();
    onOpenChange(false);
  };

  const handleContinueLater = () => {
    onClearState?.();
    onOpenChange(false);
  };

  const handleResolveWithAI = async (useNewSession: boolean) => {
    const context = buildConflictContext();
    if (!context) {
      toast.error('No conflict details available');
      return;
    }

    if (useNewSession) {
      // Open new session with the conflict context as initial prompt
      openNewSessionDraft({
        directoryOverride: directory,
        initialPrompt: context.visibleText,
      });
      onClearState?.();
      onOpenChange(false);
      return;
    }

    // Use current session
    if (!currentSessionId) {
      toast.error('No active session', { description: 'Open a chat session first or use "New Session".' });
      return;
    }

    const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore.getState();
    const lastUsedProvider = useMessageStore.getState().lastUsedProvider;
    const providerID = currentProviderId || lastUsedProvider?.providerID;
    const modelID = currentModelId || lastUsedProvider?.modelID;

    if (!providerID || !modelID) {
      toast.error('No model selected');
      return;
    }

    setActiveMainTab('chat');

    void useMessageStore
      .getState()
      .sendMessage(
        context.visibleText,
        providerID,
        modelID,
        currentAgentName ?? undefined,
        currentSessionId,
        undefined,
        null,
        [
          { text: context.instructionsText, synthetic: true },
          { text: context.payloadText, synthetic: true },
        ],
        currentVariant
      )
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e);
        toast.error('Failed to send message', { description: message });
      });

    onClearState?.();
    onOpenChange(false);
  };

  const operationLabel = operation === 'merge' ? 'Merge' : 'Rebase';
  const displayFiles = conflictDetails?.unmergedFiles || conflictFiles;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RiAlertLine className="size-5 text-[var(--status-warning)]" />
            <DialogTitle>{operationLabel} Conflicts Detected</DialogTitle>
          </div>
          <DialogDescription>
            The {operation} operation resulted in conflicts that need to be resolved.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-4 text-muted-foreground">
            <RiLoader4Line className="size-4 animate-spin" />
            <span className="typography-meta">Loading conflict details...</span>
          </div>
        )}

        {loadError && (
          <div className="rounded-lg bg-[var(--status-error-bg)] p-3 text-[var(--status-error)] typography-meta">
            Error loading details: {loadError}
          </div>
        )}

        {displayFiles.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="typography-meta text-muted-foreground">Conflicted files:</p>
              <span className="typography-micro px-1.5 py-0.5 rounded bg-[var(--surface-elevated)] text-muted-foreground">
                {displayFiles.length}
              </span>
            </div>
            <div className="bg-[var(--surface-elevated)] rounded-lg p-3 max-h-40 overflow-y-auto">
              <ul className="space-y-1">
                {displayFiles.map((file, index) => (
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

        {conflictDetails?.headInfo && (
          <div className="space-y-1">
            <p className="typography-meta text-muted-foreground">Head information:</p>
            <p className="typography-micro text-foreground font-mono bg-[var(--surface-elevated)] rounded px-2 py-1 truncate">
              {conflictDetails.headInfo}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" onClick={handleContinueLater}>
            Continue Later
          </Button>
          <Button variant="outline" size="sm" onClick={handleAbort}>
            Abort {operationLabel}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="default"
                size="sm"
                disabled={isLoading || !conflictDetails}
                className="gap-1.5"
              >
                {isLoading ? (
                  <RiLoader4Line className="size-4 animate-spin" />
                ) : (
                  <RiSparklingLine className="size-4" />
                )}
                Resolve with AI
                <RiArrowDownSLine className="size-4 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => void handleResolveWithAI(false)}
                disabled={!currentSessionId}
                className="gap-2"
              >
                <RiChat1Line className="size-4" />
                Use Current Session
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => void handleResolveWithAI(true)}
                className="gap-2"
              >
                <RiAddLine className="size-4" />
                Start New Session
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
