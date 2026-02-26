import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';

/** How often the heartbeat monitor checks for stalled subsessions */
const HEARTBEAT_CHECK_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Hook that monitors session status transitions and:
 * 1. Advances agent loops when a child session finishes (busy/retry → idle).
 * 2. Triggers JSON extraction/validation for planning sessions that finish.
 * 3. Records heartbeat activity for running subsessions.
 * 4. Periodically checks for stalled subsessions and triggers restart/error.
 *
 * Mount this once at the app level (e.g. inside MainLayout or App).
 */
export function useAgentLoopWatcher(): void {
  // Track the previous status per session to detect transitions
  const prevStatusRef = React.useRef<Map<string, string>>(new Map());

  const sessionStatus = useSessionStore((s) => s.sessionStatus);
  const onSessionCompleted = useAgentLoopStore((s) => s.onSessionCompleted);
  const onPlanningSessionCompleted = useAgentLoopStore((s) => s.onPlanningSessionCompleted);
  const recordHeartbeat = useAgentLoopStore((s) => s.recordHeartbeat);
  const checkForStalledSessions = useAgentLoopStore((s) => s.checkForStalledSessions);
  const loops = useAgentLoopStore((s) => s.loops);
  const planningSessions = useAgentLoopStore((s) => s.planningSessions);

  // --- Transition detection + heartbeat recording ---
  React.useEffect(() => {
    if (!sessionStatus) return;

    // Build a set of session IDs we care about
    const watchedSessionIds = new Set<string>();

    // Agent loop child sessions
    for (const loop of loops.values()) {
      if (loop.status !== 'running') continue;
      for (const wp of loop.workpackages) {
        if (wp.sessionId && wp.status === 'running') {
          watchedSessionIds.add(wp.sessionId);
        }
      }
    }

    // Planning sessions that are actively generating
    for (const ps of planningSessions.values()) {
      if (ps.status === 'planning') {
        watchedSessionIds.add(ps.sessionId);
      }
    }

    if (watchedSessionIds.size === 0) return;

    // Check for transitions
    const prev = prevStatusRef.current;
    for (const sessionId of watchedSessionIds) {
      const currentStatus = sessionStatus.get(sessionId);
      const currentType = currentStatus?.type ?? 'idle';
      const prevType = prev.get(sessionId);

      // Detect busy/retry → idle transition (skip if no previous status recorded)
      if (
        prevType !== undefined &&
        (prevType === 'busy' || prevType === 'retry') &&
        currentType === 'idle'
      ) {
        if (planningSessions.has(sessionId)) {
          void onPlanningSessionCompleted(sessionId);
        } else {
          onSessionCompleted(sessionId);
        }
      }

      // Record heartbeat on status type transitions (busy↔retry) — these indicate
      // real server-side activity, unlike polling refreshes that just update timestamps.
      if (
        prevType !== undefined &&
        prevType !== currentType &&
        (currentType === 'busy' || currentType === 'retry')
      ) {
        recordHeartbeat(sessionId);
      }
    }

    // Update previous status snapshot
    const nextPrev = new Map<string, string>();
    for (const sessionId of watchedSessionIds) {
      const currentStatus = sessionStatus.get(sessionId);
      nextPrev.set(sessionId, currentStatus?.type ?? 'idle');
    }
    prevStatusRef.current = nextPrev;
  }, [sessionStatus, loops, planningSessions, onSessionCompleted, onPlanningSessionCompleted, recordHeartbeat]);

  // --- Periodic heartbeat stall check ---
  const hasRunningLoops = React.useMemo(() => {
    for (const loop of loops.values()) {
      if (loop.status === 'running') return true;
    }
    return false;
  }, [loops]);

  React.useEffect(() => {
    if (!hasRunningLoops) return;

    const intervalId = setInterval(() => {
      checkForStalledSessions();
    }, HEARTBEAT_CHECK_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [hasRunningLoops, checkForStalledSessions]);
}
