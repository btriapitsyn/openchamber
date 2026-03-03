import React from 'react';
import { RiPlayLine } from '@remixicon/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { WorkpackageFile } from '@/types/agentloop';

interface PlanViewerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workpackageFile: WorkpackageFile;
  onImplement?: () => void;
  isImplementing?: boolean;
}

/**
 * Modal that displays a workpackage plan in a readable format.
 */
export const PlanViewerDialog: React.FC<PlanViewerDialogProps> = ({
  open,
  onOpenChange,
  workpackageFile,
  onImplement,
  isImplementing,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="typography-heading-sm text-foreground">
            {workpackageFile.name}
          </DialogTitle>
          <p className="typography-meta text-foreground-muted mt-0.5">
            {workpackageFile.workpackages.length} task{workpackageFile.workpackages.length !== 1 ? 's' : ''}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {workpackageFile.workpackages.map((wp, idx) => (
            <div key={wp.id} className="border border-border rounded-md">
              <div className="flex items-start gap-2 px-3 py-2 border-b border-border bg-surface-subtle/40">
                <span className="typography-meta text-foreground-muted shrink-0 mt-px">
                  {idx + 1}.
                </span>
                <div className="min-w-0">
                  <p className="typography-label text-foreground truncate">{wp.title}</p>
                  <p className="typography-meta text-foreground-muted font-mono">{wp.id}</p>
                </div>
              </div>
              <p className="px-3 py-2 typography-meta text-foreground-muted whitespace-pre-wrap">
                {wp.description}
              </p>
            </div>
          ))}
        </div>

        {onImplement && (
          <DialogFooter className="px-5 py-3 border-t border-border">
            <Button
              size="sm"
              className="gap-1.5"
              disabled={isImplementing}
              onClick={() => {
                onOpenChange(false);
                onImplement();
              }}
            >
              <RiPlayLine className="h-3.5 w-3.5" />
              {isImplementing ? 'Starting…' : 'Implement'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};
