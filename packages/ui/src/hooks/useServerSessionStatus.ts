import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

interface SessionState {
  status: 'idle' | 'busy' | 'retry';
  lastUpdateAt: number;
  metadata?: {
    attempt?: number;
    message?: string;
    next?: number;
  };
}

interface SessionAttentionState {
  needsAttention: boolean;
  lastUserMessageAt: number | null;
  lastStatusChangeAt: number;
  status: 'idle' | 'busy' | 'retry';
  isViewed: boolean;
}

interface ServerSnapshotResponse {
  statusSessions: Record<string, SessionState>;
  attentionSessions: Record<string, SessionAttentionState>;
  serverTime: number;
}

const IMMEDIATE_POLL_DELAY_MS = 150;
const FOLLOW_UP_POLL_DELAY_MS = 1100;

// Ref to be accessed from outside (e.g., useEventStream) for triggering immediate poll
let triggerImmediatePollRef: (() => void) | null = null;

// Global function to trigger immediate poll from outside React
export const triggerSessionStatusPoll = () => {
  if (triggerImmediatePollRef) {
    triggerImmediatePollRef();
  }
};

/**
 * Hook to synchronize session status and attention state from server.
 *
 * Architecture: server maintains authoritative state, client applies snapshots.
 * SSE remains the primary transport; snapshots repair missed updates.
 */
export function useServerSessionStatus() {
  const isSyncingRef = React.useRef(false);
  const hasPendingImmediateSyncRef = React.useRef(false);
  const lastSyncAtRef = React.useRef(0);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const followUpTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const fetchSessionStatus = React.useCallback(async (immediate = false) => {
    const now = Date.now();
    if (!immediate && now - lastSyncAtRef.current < 1000) {
      return;
    }

    // Prevent concurrent syncs; if an immediate sync is requested while running,
    // queue one more pass right after current request settles.
    if (isSyncingRef.current) {
      if (immediate) {
        hasPendingImmediateSyncRef.current = true;
      }
      return;
    }

    isSyncingRef.current = true;
    lastSyncAtRef.current = now;

    try {
      const snapshotResponse = await fetch('/api/sessions/snapshot', {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });

      if (!snapshotResponse.ok) {
        console.warn('[useServerSessionStatus] Failed to fetch session snapshot:', snapshotResponse.status);
        return;
      }

      const snapshotData: ServerSnapshotResponse = await snapshotResponse.json();
      const statusSessions = snapshotData.statusSessions ?? {};
      const attentionSessions = snapshotData.attentionSessions ?? {};

      // Update the session store with server state
      const currentStatuses = useSessionStore.getState().sessionStatus || new Map();
      let newStatuses: Map<string, { type: 'idle' | 'busy' | 'retry'; confirmedAt?: number; attempt?: number; message?: string; next?: number }> | null = null;
      const ensureStatusesMap = () => {
        if (!newStatuses) {
          newStatuses = new Map(currentStatuses);
        }
        return newStatuses;
      };

      for (const [sessionId, state] of Object.entries(statusSessions)) {
        const existing = currentStatuses.get(sessionId);
        const hasChanged =
          !existing ||
          existing.type !== state.status ||
          existing.attempt !== state.metadata?.attempt ||
          existing.message !== state.metadata?.message ||
          existing.next !== state.metadata?.next ||
          existing.confirmedAt !== state.lastUpdateAt;

        // Only update if server state is different
        if (hasChanged) {
          ensureStatusesMap().set(sessionId, {
            type: state.status,
            confirmedAt: state.lastUpdateAt,
            attempt: state.metadata?.attempt,
            message: state.metadata?.message,
            next: state.metadata?.next,
          });
        }
      }

      // Check for sessions that are no longer in server state (treat as idle)
      for (const [sessionId, currentStatus] of (newStatuses ?? currentStatuses)) {
        if ((currentStatus.type === 'busy' || currentStatus.type === 'retry') &&
            !statusSessions[sessionId]) {
          // Session was busy but not in server state anymore -> mark as idle
          ensureStatusesMap().set(sessionId, {
            type: 'idle',
            confirmedAt: Date.now(),
          });
        }
      }

      // Update attention state from server
      const currentAttentionStates = useSessionStore.getState().sessionAttentionStates || new Map();
      let newAttentionStates: Map<string, SessionAttentionState> | null = null;
      const ensureAttentionMap = () => {
        if (!newAttentionStates) {
          newAttentionStates = new Map(currentAttentionStates);
        }
        return newAttentionStates;
      };
      let attentionStatesChanged = false;

      for (const [sessionId, attentionState] of Object.entries(attentionSessions)) {
        const existing = currentAttentionStates.get(sessionId);
        const serverState = attentionState as SessionAttentionState;
        const hasChanged =
          !existing ||
          existing.needsAttention !== serverState.needsAttention ||
          existing.lastUserMessageAt !== serverState.lastUserMessageAt ||
          existing.lastStatusChangeAt !== serverState.lastStatusChangeAt ||
          existing.status !== serverState.status ||
          existing.isViewed !== serverState.isViewed;

        if (hasChanged) {
          ensureAttentionMap().set(sessionId, serverState);
          attentionStatesChanged = true;
        }
      }

      // Remove attention states for sessions that no longer exist
      for (const sessionId of (newAttentionStates ?? currentAttentionStates).keys()) {
        const inStatus = !!statusSessions[sessionId];
        const inAttention = !!attentionSessions[sessionId];
        if (!inStatus && !inAttention) {
          ensureAttentionMap().delete(sessionId);
          attentionStatesChanged = true;
        }
      }

      // Only update store if something actually changed
      const statusChanged = newStatuses !== null;
      if (statusChanged || attentionStatesChanged) {
        useSessionStore.setState({
          ...(statusChanged && newStatuses ? { sessionStatus: newStatuses } : {}),
          ...(attentionStatesChanged && newAttentionStates ? { sessionAttentionStates: newAttentionStates } : {}),
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.debug('[useServerSessionStatus] Updated session statuses from server:', {
          statusCount: Object.keys(statusSessions).length,
          attentionCount: Object.keys(attentionSessions).length,
          serverTime: snapshotData.serverTime,
        });
      }
    } catch (error) {
      console.warn('[useServerSessionStatus] Error fetching session status:', error);
    } finally {
      isSyncingRef.current = false;
      if (hasPendingImmediateSyncRef.current) {
        hasPendingImmediateSyncRef.current = false;
        setTimeout(() => {
          void fetchSessionStatus(true);
        }, 120);
      }
    }
  }, []);

  // Function to trigger immediate snapshot sync from external modules
  const triggerImmediatePoll = React.useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    if (followUpTimeoutRef.current) {
      clearTimeout(followUpTimeoutRef.current);
    }

    // Schedule immediate sync with small delay to batch rapid calls
    timeoutRef.current = setTimeout(() => {
      void fetchSessionStatus(true);
    }, IMMEDIATE_POLL_DELAY_MS);

    // Run one follow-up sync after short settle period to catch delayed
    // server status transitions that happen right after reconnect/restore.
    followUpTimeoutRef.current = setTimeout(() => {
      void fetchSessionStatus(true);
    }, FOLLOW_UP_POLL_DELAY_MS);
  }, [fetchSessionStatus]);

  // Initial snapshot sync on mount
  React.useEffect(() => {
    void fetchSessionStatus(true);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (followUpTimeoutRef.current) {
        clearTimeout(followUpTimeoutRef.current);
      }
    };
  }, [fetchSessionStatus]);

  // Sync snapshot when tab becomes visible
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerImmediatePoll();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerImmediatePoll]);

  // Update the ref for external access
  React.useEffect(() => {
    triggerImmediatePollRef = triggerImmediatePoll;
    return () => {
      triggerImmediatePollRef = null;
    };
  }, [triggerImmediatePoll]);

  return {
    fetchSessionStatus,
    triggerImmediatePoll,
  };
}

// Export ref accessor for external modules
export const getTriggerImmediatePoll = () => triggerImmediatePollRef;

export default useServerSessionStatus;
