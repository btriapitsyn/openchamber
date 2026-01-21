import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';

type SessionStatusPayload = {
  type: 'idle' | 'busy' | 'retry';
  attempt?: number;
  message?: string;
  next?: number;
};

export const useSessionStatusBootstrap = () => {
  React.useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Use global status to detect busy sessions across all directories,
        // including sessions started externally (e.g., via CLI) before UI opened
        const statusMap = await opencodeClient.getGlobalSessionStatus();
        if (cancelled || !statusMap) return;

        const phases = new Map<string, 'idle' | 'busy' | 'cooldown'>();
        Object.entries(statusMap).forEach(([sessionId, raw]) => {
          if (!sessionId || !raw) return;
          const status = raw as SessionStatusPayload;
          const phase: 'idle' | 'busy' | 'cooldown' =
            status.type === 'busy' || status.type === 'retry' ? 'busy' : 'idle';
          phases.set(sessionId, phase);
        });

        if (phases.size > 0) {
          useSessionStore.setState({ sessionActivityPhase: phases });
        }
      } catch { /* ignored */ }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);
};

