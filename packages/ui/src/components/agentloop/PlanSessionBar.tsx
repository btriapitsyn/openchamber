import React from 'react';
import {
  RiCheckLine,
  RiErrorWarningLine,
  RiLoader4Line,
  RiPlayLine,
  RiFileTextLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';
import { useUIStore } from '@/stores/useUIStore';
import { PlanViewerDialog } from './PlanViewerDialog';

interface PlanSessionBarProps {
  sessionId: string;
}

/**
 * Slim banner rendered above the chat input when the current session is a
 * planning session.  Shows status, and once the plan is ready, exposes
 * "View Plan" and "Implement" action buttons.
 */
export const PlanSessionBar: React.FC<PlanSessionBarProps> = ({ sessionId }) => {
  const ps = useAgentLoopStore((s) => s.planningSessions.get(sessionId));
  const dismissPlanningSession = useAgentLoopStore((s) => s.dismissPlanningSession);
  const openAgentLoopLauncherWithPrefill = useUIStore((s) => s.openAgentLoopLauncherWithPrefill);
  const [viewerOpen, setViewerOpen] = React.useState(false);

  if (!ps) return null;

  const handleImplement = () => {
    if (!ps.workpackageFile) return;
    openAgentLoopLauncherWithPrefill({
      workpackageFile: ps.workpackageFile,
      providerID: ps.providerID || undefined,
      modelID: ps.modelID || undefined,
      agent: ps.agent,
    });
    dismissPlanningSession(sessionId);
  };

  return (
    <>
      <div
        className={cn(
          'flex items-center gap-2 border-t border-border px-4 py-2 text-sm',
          'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80',
        )}
      >
        {/* Status icon + label */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {ps.status === 'planning' || ps.status === 'validating' ? (
            <RiLoader4Line className="h-3.5 w-3.5 animate-spin text-accent shrink-0" />
          ) : ps.status === 'done' ? (
            <RiCheckLine className="h-3.5 w-3.5 text-success shrink-0" />
          ) : (
            <RiErrorWarningLine className="h-3.5 w-3.5 text-destructive shrink-0" />
          )}
          <span className={cn(
            'typography-meta truncate',
            ps.status === 'done' ? 'text-foreground' : 'text-foreground-muted',
          )}>
            {ps.status === 'planning'
              ? 'Generating plan…'
              : ps.status === 'validating'
              ? 'Validating plan…'
              : ps.status === 'done'
              ? `Plan ready: "${ps.workpackageFile?.name ?? ''}" — ${ps.workpackageFile?.workpackages.length ?? 0} tasks`
              : `Plan failed: ${ps.error ?? 'unknown error'}`}
          </span>
        </div>

        {/* Actions — only shown when plan is ready */}
        {ps.status === 'done' && (
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setViewerOpen(true)}
            >
              <RiFileTextLine className="h-3.5 w-3.5" />
              View plan
            </Button>
            <Button
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={handleImplement}
            >
              <RiPlayLine className="h-3.5 w-3.5" />
              Implement
            </Button>
          </div>
        )}
      </div>

      {ps.workpackageFile && (
        <PlanViewerDialog
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          workpackageFile={ps.workpackageFile}
          onImplement={handleImplement}
          isImplementing={false}
        />
      )}
    </>
  );
};
