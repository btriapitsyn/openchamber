import React from 'react';
import {
  RiAlertLine,
  RiCheckLine,
  RiCloseLine,
  RiHourglassLine,
  RiLoader4Line,
  RiPauseLine,
  RiPlayLine,
  RiRefreshLine,
  RiShieldLine,
  RiSkipForwardLine,
  RiStopLine,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { ModelSelector } from '@/components/sections/agents/ModelSelector';
import { AgentSelector } from '@/components/multirun/AgentSelector';
import type { AgentLoopInstance, AgentLoopStatus, WorkpackageStatus } from '@/types/agentloop';

const statusConfig: Record<WorkpackageStatus, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: RiHourglassLine, label: 'Pending', color: 'text-foreground-muted' },
  running: { icon: RiLoader4Line, label: 'Running', color: 'text-primary' },
  completed: { icon: RiCheckLine, label: 'Done', color: 'text-status-success' },
  failed: { icon: RiCloseLine, label: 'Failed', color: 'text-destructive' },
  skipped: { icon: RiSkipForwardLine, label: 'Skipped', color: 'text-foreground-muted' },
};

/** Human-readable label + color for the overall loop status shown in the header */
const loopStatusDisplay: Record<AgentLoopStatus, { label: string; color: string }> = {
  idle: { label: 'Idle', color: 'text-foreground-muted' },
  running: { label: 'Running', color: 'text-primary' },
  paused: { label: 'Paused', color: 'text-foreground-muted' },
  completed: { label: 'Done', color: 'text-status-success' },
  stopped: { label: 'Stopped', color: 'text-foreground-muted' },
  error: { label: 'Error', color: 'text-destructive' },
};

interface AgentLoopStatusViewProps {
  loopId: string;
}

/**
 * Displays the todo-list overview for an active agent loop.
 * Shows workpackage statuses and controls for the loop.
 */
export const AgentLoopStatusView: React.FC<AgentLoopStatusViewProps> = ({ loopId }) => {
  const loop = useAgentLoopStore((s) => s.loops.get(loopId));
  const { pauseLoop, resumeLoop, skipCurrent, stopLoop, updateLoopConfig } = useAgentLoopStore();
  const setCurrentSession = useSessionStore((s) => s.setCurrentSession);

  if (!loop) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="typography-body text-foreground-muted">Agent loop not found</p>
      </div>
    );
  }

  const completedCount = loop.workpackages.filter((wp) => wp.status === 'completed').length;
  const totalCount = loop.workpackages.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const isErrored = loop.status === 'error';
  const isStopped = loop.status === 'stopped';
  const isTerminal = loop.status === 'completed' || loop.status === 'stopped' || loop.status === 'error';
  const statusDisplay = loopStatusDisplay[loop.status];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="typography-heading-lg text-foreground">{loop.name}</h2>
            <p className="typography-meta text-foreground-muted mt-0.5">
              {completedCount}/{totalCount} tasks completed ·{' '}
              <span className={statusDisplay.color}>{statusDisplay.label}</span>
            </p>
            <div className="flex items-center gap-1 mt-1 typography-meta text-foreground-muted">
              <RiShieldLine className="h-3 w-3 shrink-0" />
              <span>Sub-sessions run with all permissions allowed</span>
            </div>
          </div>
          <LoopControls loop={loop} onPause={pauseLoop} onResume={resumeLoop} onSkip={skipCurrent} onStop={stopLoop} />
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 w-full rounded-full bg-border overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              isErrored ? 'bg-destructive' : loop.status === 'completed' ? 'bg-status-success' : 'bg-primary',
            )}
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Manually stopped banner */}
      {isStopped && (
        <div className="flex items-start gap-2 border-b border-border bg-surface-subtle px-4 py-3" role="status">
          <RiStopLine className="mt-0.5 h-4 w-4 shrink-0 text-foreground-muted" />
          <p className="typography-body text-foreground-muted">This loop was manually stopped by the user. Remaining tasks were skipped.</p>
        </div>
      )}

      {/* Loop-level error banner */}
      {isErrored && loop.error && (
        <div className="flex items-start gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-3" role="alert">
          <RiAlertLine className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="typography-body text-destructive">{loop.error}</p>
        </div>
      )}

      {/* Model & Agent configuration */}
      {!isTerminal && (
        <div className="border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="typography-meta text-foreground-muted shrink-0">Model</span>
              <ModelSelector
                providerId={loop.providerID}
                modelId={loop.modelID}
                onChange={(providerID, modelID) => updateLoopConfig(loopId, { providerID, modelID })}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="typography-meta text-foreground-muted shrink-0">Agent</span>
              <AgentSelector
                value={loop.agent ?? ''}
                onChange={(agent) => updateLoopConfig(loopId, { agent: agent || undefined })}
                className="max-w-50 typography-meta text-foreground"
              />
            </div>
          </div>
          <p className="typography-micro text-foreground-muted mt-1.5">Changes apply to new sessions only</p>
        </div>
      )}

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-border">
          {loop.workpackages.map((wp, idx) => {
            const config = statusConfig[wp.status];
            const Icon = config.icon;
            const isRunning = wp.status === 'running';
            const hasSession = Boolean(wp.sessionId);
            const retryCount = wp.retryCount ?? 0;

            return (
              <div
                key={wp.id}
                className={cn(
                  'flex items-start gap-3 px-4 py-3',
                  isRunning && 'bg-accent/5',
                  hasSession && 'cursor-pointer hover:bg-interactive-hover',
                )}
                onClick={() => {
                  if (wp.sessionId) {
                    setCurrentSession(wp.sessionId);
                  }
                }}
                role={hasSession ? 'button' : undefined}
                tabIndex={hasSession ? 0 : undefined}
                onKeyDown={(e) => {
                  if (hasSession && wp.sessionId && (e.key === 'Enter' || e.key === ' ')) {
                    e.preventDefault();
                    setCurrentSession(wp.sessionId);
                  }
                }}
              >
                {/* Status icon */}
                <div className={cn('mt-0.5 shrink-0', config.color)}>
                  <Icon className={cn('h-4 w-4', isRunning && 'animate-spin')} />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="typography-meta text-foreground-muted shrink-0">
                      {idx + 1}.
                    </span>
                    <span
                      className={cn(
                        'typography-label truncate',
                        wp.status === 'completed' ? 'text-foreground-muted line-through' : 'text-foreground',
                      )}
                      aria-label={wp.status === 'completed' ? `${wp.title} (completed)` : wp.title}
                    >
                      {wp.title}
                    </span>
                    <span className={cn('typography-meta shrink-0', config.color)}>
                      {config.label}
                    </span>
                    {retryCount > 0 && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full bg-destructive/10 px-1.5 py-0.5 typography-meta text-destructive shrink-0"
                        title={`Restarted ${retryCount} time${retryCount > 1 ? 's' : ''} due to stalling`}
                      >
                        <RiRefreshLine className="h-3 w-3" />
                        {retryCount}
                      </span>
                    )}
                  </div>
                  {wp.error && (
                    <p className="mt-1 typography-meta text-destructive truncate">
                      {wp.error}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface LoopControlsProps {
  loop: AgentLoopInstance;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
  onSkip: (id: string) => void;
  onStop: (id: string) => void;
}

const LoopControls: React.FC<LoopControlsProps> = ({
  loop,
  onPause,
  onResume,
  onSkip,
  onStop,
}) => {
  if (loop.status === 'completed' || loop.status === 'stopped' || loop.status === 'error') {
    return null;
  }

  return (
    <div className="flex items-center gap-1">
      {loop.status === 'running' && (
        <>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onPause(loop.id)}
            aria-label="Pause loop"
          >
            <RiPauseLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onSkip(loop.id)}
            aria-label="Skip current task"
          >
            <RiSkipForwardLine className="h-4 w-4" />
          </Button>
        </>
      )}
      {loop.status === 'paused' && (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onResume(loop.id)}
          aria-label="Resume loop"
        >
          <RiPlayLine className="h-4 w-4" />
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onStop(loop.id)}
        aria-label="Stop loop"
      >
        <RiStopLine className="h-4 w-4" />
      </Button>
    </div>
  );
};
