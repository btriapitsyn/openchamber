import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';

interface SessionState {
  status: 'idle' | 'busy' | 'retry';
  lastUpdateAt: number;
  lastEventId: string;
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

interface ServerStatusResponse {
  sessions: Record<string, SessionState>;
  serverTime: number;
}

interface ServerAttentionResponse {
  sessions: Record<string, SessionAttentionState>;
  serverTime: number;
}

const POLL_INTERVAL_MS = 10000; // 10 seconds
const IMMEDIATE_POLL_DELAY_MS = 500; // 500ms for immediate poll after notification

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
 * Architecture: Server maintains authoritative state, client only queries.
 * This eliminates dependency on SSE event delivery for status updates.
 */
export function useServerSessionStatus() {
  const isPollingRef = React.useRef(false);
  const lastPollTimeRef = React.useRef(0);
  const timeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const fetchSessionStatus = React.useCallback(async (immediate = false) => {
    const now = Date.now();
    if (!immediate && now - lastPollTimeRef.current < 1000) {
      return;
    }

    // Prevent concurrent polls
    if (isPollingRef.current) {
      return;
    }

    isPollingRef.current = true;
    lastPollTimeRef.current = now;

    try {
      // Fetch both status and attention state in parallel
      const [statusResponse, attentionResponse] = await Promise.all([
        fetch('/api/sessions/status', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
        fetch('/api/sessions/attention', {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
      ]);

      if (!statusResponse.ok) {
        console.warn('[useServerSessionStatus] Failed to fetch session status:', statusResponse.status);
        return;
      }

      const statusData: ServerStatusResponse = await statusResponse.json();
      const attentionData: ServerAttentionResponse = attentionResponse.ok 
        ? await attentionResponse.json() 
        : { sessions: {}, serverTime: Date.now() };

      // Update the session store with server state
      const currentStatuses = useSessionStore.getState().sessionStatus || new Map();
      const newStatuses = new Map(currentStatuses);

      for (const [sessionId, state] of Object.entries(statusData.sessions)) {
        const existing = newStatuses.get(sessionId);

        // Only update if server state is newer or different
        if (!existing || existing.status !== state.status) {
          newStatuses.set(sessionId, {
            type: state.status,
            confirmedAt: state.lastUpdateAt,
            attempt: state.metadata?.attempt,
            message: state.metadata?.message,
            next: state.metadata?.next,
          });
        }
      }

      // Check for sessions that are no longer in server state (treat as idle)
      for (const [sessionId, currentStatus] of newStatuses) {
        if ((currentStatus.type === 'busy' || currentStatus.type === 'retry') &&
            !statusData.sessions[sessionId]) {
          // Session was busy but not in server state anymore -> mark as idle
          newStatuses.set(sessionId, {
            type: 'idle',
            confirmedAt: Date.now(),
          });
        }
      }

      // Update attention state from server
      const currentAttentionStates = useSessionStore.getState().sessionAttentionStates || new Map();
      const newAttentionStates = new Map(currentAttentionStates);
      let attentionStatesChanged = false;

      for (const [sessionId, attentionState] of Object.entries(attentionData.sessions)) {
        const existing = newAttentionStates.get(sessionId);
        const serverState = attentionState as SessionAttentionState;

        if (!existing || serverState.lastStatusChangeAt >= existing.lastStatusChangeAt) {
          newAttentionStates.set(sessionId, serverState);
          attentionStatesChanged = true;
        }
      }

      // Remove attention states for sessions that no longer exist
      for (const sessionId of newAttentionStates.keys()) {
        const inStatus = !!statusData.sessions[sessionId];
        const inAttention = !!attentionData.sessions[sessionId];
        if (!inStatus && !inAttention) {
          newAttentionStates.delete(sessionId);
          attentionStatesChanged = true;
        }
      }

      // Only update store if something actually changed
      const statusChanged = newStatuses !== currentStatuses;
      if (statusChanged || attentionStatesChanged) {
        useSessionStore.setState({
          sessionStatus: statusChanged ? newStatuses : undefined,
          sessionAttentionStates: attentionStatesChanged ? new Map(newAttentionStates) : undefined,
        });
      }

      if (process.env.NODE_ENV === 'development') {
        console.debug('[useServerSessionStatus] Updated session statuses from server:', {
          statusCount: Object.keys(statusData.sessions).length,
          attentionCount: Object.keys(attentionData.sessions).length,
          serverTime: statusData.serverTime,
        });
      }
    } catch (error) {
      console.warn('[useServerSessionStatus] Error fetching session status:', error);
    } finally {
      isPollingRef.current = false;
    }
  }, []);

  // Start polling when component mounts
  React.useEffect(() => {
    // Initial fetch
    void fetchSessionStatus(true);

    // Set up interval polling
    const intervalId = setInterval(() => {
      void fetchSessionStatus();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [fetchSessionStatus]);

  // Handle visibility change: poll immediately when tab becomes visible
  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Small delay to let the browser settle
        timeoutRef.current = setTimeout(() => {
          void fetchSessionStatus(true);
        }, 100);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchSessionStatus]);

  // Function to trigger immediate poll (e.g., after receiving notification)
  const triggerImmediatePoll = React.useCallback(() => {
    // Clear any pending timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Schedule immediate poll with small delay to batch rapid calls
    timeoutRef.current = setTimeout(() => {
      void fetchSessionStatus(true);
    }, IMMEDIATE_POLL_DELAY_MS);
  }, [fetchSessionStatus]);

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
