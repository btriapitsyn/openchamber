import React from 'react';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useSessionStatus, useSessionMessages, useSessionPermissions } from '@/sync/sync-context';

// Mirrors OpenCode SessionStatus: busy|retry|idle.
export type SessionActivityPhase = 'idle' | 'busy' | 'retry';

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

/**
 * Determines if a session is actively working.
 * Checks session_status AND incomplete assistant messages as fallback.
 * Returns idle when permissions are pending (permission indicator takes priority).
 */
export function useSessionActivity(sessionId: string | null | undefined): SessionActivityResult {
  const status = useSessionStatus(sessionId ?? '');
  const messages = useSessionMessages(sessionId ?? '');
  const permissions = useSessionPermissions(sessionId ?? '');

  return React.useMemo<SessionActivityResult>(() => {
    if (!sessionId) return IDLE_RESULT;

    // Permissions pending → idle (permission indicator takes priority)
    if (permissions.length > 0) return IDLE_RESULT;

    const phase: SessionActivityPhase = (status?.type ?? 'idle') as SessionActivityPhase;

    // Incomplete assistant message fallback — catches cases where status event is delayed
    let hasPendingAssistant = false;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'assistant' && typeof (m as { time?: { completed?: number } }).time?.completed !== 'number') {
        hasPendingAssistant = true;
        break;
      }
    }

    const statusWorking = phase !== 'idle';
    const isWorking = statusWorking || hasPendingAssistant;

    if (!isWorking) return IDLE_RESULT;

    return {
      phase: statusWorking ? phase : 'busy',
      isWorking: true,
      isBusy: phase === 'busy' || (!statusWorking && hasPendingAssistant),
      isCooldown: false,
    };
  }, [sessionId, status, messages, permissions]);
}

export function useCurrentSessionActivity(): SessionActivityResult {
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  return useSessionActivity(currentSessionId);
}
