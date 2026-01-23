

import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

export type SessionActivityPhase = 'idle' | 'busy' | 'cooldown';

export interface SessionActivityResult {

  phase: SessionActivityPhase;

  isWorking: boolean;

  isBusy: boolean;

  isCooldown: boolean;
}

const IDLE_RESULT: SessionActivityResult = {
  phase: 'idle',
  isWorking: false,
  isBusy: false,
  isCooldown: false,
};

export function useSessionActivity(sessionId: string | null | undefined): SessionActivityResult {

  const phase = useSessionStore((state) => {
    if (!sessionId || !state.sessionActivityPhase) {
      return 'idle' as SessionActivityPhase;
    }
    return state.sessionActivityPhase.get(sessionId) ?? ('idle' as SessionActivityPhase);
  });

  return React.useMemo<SessionActivityResult>(() => {
    if (phase === 'idle') {
      return IDLE_RESULT;
    }
    const isBusy = phase === 'busy';
    const isCooldown = phase === 'cooldown';
    return {
      phase,
      isWorking: isBusy || isCooldown,
      isBusy,
      isCooldown,
    };
  }, [phase]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  return useSessionActivity(currentSessionId);
}

/**
 * Check if any session in a directory is currently active (busy or cooldown).
 * Uses efficient per-session selection to avoid cascading re-renders.
 */
export function useDirectoryHasActiveSession(
  sessionIds: string[] | null | undefined
): boolean {
  // Subscribe to just the phases of the given sessions
  const hasActive = useSessionStore((state) => {
    if (!sessionIds || sessionIds.length === 0 || !state.sessionActivityPhase) {
      return false;
    }
    for (const id of sessionIds) {
      const phase = state.sessionActivityPhase.get(id);
      if (phase === 'busy' || phase === 'cooldown') {
        return true;
      }
    }
    return false;
  });

  return hasActive;
}
