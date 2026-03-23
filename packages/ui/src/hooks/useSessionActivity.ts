

import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

// Mirrors OpenCode SessionStatus: busy|retry|idle.
export type SessionActivityPhase = 'idle' | 'busy' | 'retry';

export interface SessionActivityResult {

  phase: SessionActivityPhase;

  isWorking: boolean;

  isBusy: boolean;

  // Kept for backward compatibility; always false with server session.status.
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
    if (!sessionId || !state.sessionStatus) {
      return 'idle' as SessionActivityPhase;
    }
    const status = state.sessionStatus.get(sessionId);
    return (status?.type ?? 'idle') as SessionActivityPhase;
  });

  return React.useMemo<SessionActivityResult>(() => {
    if (phase === 'idle') {
      return IDLE_RESULT;
    }
    const isBusy = phase === 'busy';
    // No cooldown in server session.status; treat retry as working.
    const isCooldown = false;
    return {
      phase,
      isWorking: phase === 'busy' || phase === 'retry',
      isBusy,
      isCooldown,
    };
  }, [phase]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  return useSessionActivity(currentSessionId);
}
