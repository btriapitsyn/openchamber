import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useAgentLoopStore } from '@/stores/useAgentLoopStore';
import type { Session } from '@opencode-ai/sdk/v2';

/**
 * Detects [Loop] sessions from the loaded session list and re-registers them
 * in the agent loop store after a page refresh.
 *
 * Mount this once at the app level alongside useAgentLoopWatcher.
 */
export function useLoopSessionDetector(): void {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionStatus = useSessionStore((s) => s.sessionStatus);
  const loops = useAgentLoopStore((s) => s.loops);
  const registerOrRefreshLoopSession = useAgentLoopStore(
    (s) => s.registerOrRefreshLoopSession,
  );

  // Track which parent session IDs we've already registered so we don't re-call
  const registeredRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!sessions || sessions.length === 0) return;

    // Find [Loop] parent sessions
    const loopParents: Session[] = [];
    for (const session of sessions) {
      const title = session.title ?? '';
      if (!title.startsWith('[Loop]')) continue;
      loopParents.push(session);
    }

    if (loopParents.length === 0) return;

    for (const parent of loopParents) {
      // Already registered — skip
      if (registeredRef.current.has(parent.id)) continue;

      // Already tracked in the store — skip
      let alreadyTracked = false;
      for (const loop of loops.values()) {
        if (loop.parentSessionId === parent.id) {
          alreadyTracked = true;
          break;
        }
      }
      if (alreadyTracked) {
        registeredRef.current.add(parent.id);
        continue;
      }

      registeredRef.current.add(parent.id);

      // Find child sessions whose parentID matches this loop parent
      const children: { id: string; title: string; isBusy: boolean }[] = [];
      for (const session of sessions) {
        const parentID = (session as Session & { parentID?: string | null }).parentID;
        if (parentID !== parent.id) continue;
        const statusEntry = sessionStatus?.get(session.id);
        const isBusy =
          statusEntry?.type === 'busy' || statusEntry?.type === 'retry';
        children.push({ id: session.id, title: session.title ?? '', isBusy });
      }

      void registerOrRefreshLoopSession(parent.id, parent.title ?? '', children);
    }
  }, [sessions, sessionStatus, loops, registerOrRefreshLoopSession]);
}
