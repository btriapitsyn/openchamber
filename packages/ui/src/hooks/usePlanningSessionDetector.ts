import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';

/**
 * Detects [Plan] sessions from the loaded session list and re-registers them
 * in the agent loop store after a page refresh.
 *
 * Mount this once at the app level alongside useAgentLoopWatcher.
 */
export function usePlanningSessionDetector(): void {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionStatus = useSessionStore((s) => s.sessionStatus);
  const planningSessions = useAgentLoopStore((s) => s.planningSessions);
  const registerOrRefreshPlanningSession = useAgentLoopStore(
    (s) => s.registerOrRefreshPlanningSession,
  );

  // Track which session IDs we've already registered so we don't keep re-calling
  const registeredRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    for (const session of sessions) {
      const title = session.title ?? '';
      if (!title.startsWith('[Plan]')) continue;

      const existing = planningSessions.get(session.id);

      // Already tracked in a terminal state — nothing to do
      if (existing && existing.status !== 'planning') continue;

      // Already registered and session is still running as 'planning' — skip
      if (existing && existing.status === 'planning' && registeredRef.current.has(session.id)) continue;

      // Not yet registered (or stale) — register it
      registeredRef.current.add(session.id);
      const statusEntry = sessionStatus?.get(session.id);
      const isBusy =
        statusEntry?.type === 'busy' || statusEntry?.type === 'retry';

      void registerOrRefreshPlanningSession(session.id, title, isBusy);
    }
  }, [sessions, sessionStatus, planningSessions, registerOrRefreshPlanningSession]);
}
