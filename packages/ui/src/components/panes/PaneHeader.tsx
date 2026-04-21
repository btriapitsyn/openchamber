import React from 'react';
import { RiCloseLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useSessionUIStore, type PaneSide } from '@/sync/session-ui-store';
import { useSessions } from '@/sync/sync-context';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PaneSessionInfo } from './PaneSessionInfo';

type Props = {
  pane: PaneSide;
  sessionId: string | null;
  isFocused: boolean;
  showClose: boolean;
};

export const PaneHeader: React.FC<Props> = ({ pane, sessionId, isFocused, showClose }) => {
  const sessions = useSessions();
  const closePane = useSessionUIStore((s) => s.closePane);
  const newSessionDraft = useSessionUIStore((s) => s.newSessionDraft);
  const focusedPane = useSessionUIStore((s) => s.focusedPane);
  const draftOpenForThisPane = newSessionDraft?.open && focusedPane === pane;

  const session = React.useMemo(
    () => (sessionId ? sessions.find((s) => s.id === sessionId) ?? null : null),
    [sessions, sessionId],
  );

  const title = draftOpenForThisPane
    ? (newSessionDraft?.title ?? 'New session')
    : (session?.title ?? 'No session');

  return (
    <div
      className={cn(
        'relative flex items-center gap-2 px-3 py-0.5 border-b border-b-border/60 flex-shrink-0 select-none transition-colors',
        isFocused ? 'bg-background' : 'bg-background/60',
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span
          className={cn(
            'typography-ui-label truncate leading-tight',
            isFocused ? 'text-foreground' : 'text-muted-foreground',
          )}
          title={title}
        >
          {title}
        </span>
        <PaneSessionInfo sessionId={sessionId} />
      </div>
      {showClose ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closePane(pane);
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex-shrink-0"
              aria-label={`Close ${pane} pane`}
            >
              <RiCloseLine className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={4}>
            <p>Close pane</p>
          </TooltipContent>
        </Tooltip>
      ) : null}
      {/* Focus accent: thin colored bar at the bottom edge of the focused pane header. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-x-0 -bottom-px h-[2px] bg-primary transition-opacity duration-150',
          isFocused ? 'opacity-100' : 'opacity-0',
        )}
      />
    </div>
  );
};
