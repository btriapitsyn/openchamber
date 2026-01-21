import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';

export const useSessionDeepLink = () => {
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let sessionId: string | null = null;
    try {
      const params = new URLSearchParams(window.location.search);
      sessionId = params.get('session');
    } catch {
      return;
    }

    if (!sessionId || sessionId.trim().length === 0) {
      return;
    }

    const run = async () => {
      try {
        useUIStore.getState().setActiveMainTab('chat');
        await setCurrentSession(sessionId as string);
      } finally {
        try {
          const url = new URL(window.location.href);
          url.searchParams.delete('session');
          window.history.replaceState({}, '', url.toString());
        } catch {
          // ignore
        }
      }
    };

    void run();
  }, [setCurrentSession]);
};
