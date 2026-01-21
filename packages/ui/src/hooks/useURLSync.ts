import { useEffect } from 'react';
import { useURLState, useURLActions } from '@/stores/useURLStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useUIStore } from '@/stores/useUIStore';
import { useRouterContext } from '@/lib/router';

export function useURLSync() {
  const { isRouterActive } = useRouterContext();
  const urlState = useURLState();
  const { setURLState, syncFromURL } = useURLActions();
  const { currentSessionId, setCurrentSession, sessions } = useSessionStore();
  const { activeMainTab, setActiveMainTab } = useUIStore();

  const urlSessionId = (urlState as { sessionId: string | null }).sessionId;
  const urlTab = (urlState as { tab: 'chat' | 'git' | 'diff' | 'terminal' | 'files' }).tab;
  const urlDirectory = (urlState as { directory: string | null }).directory;

  useEffect(() => {
    if (!isRouterActive) {
      return;
    }

    syncFromURL();
  }, [isRouterActive, syncFromURL]);

  useEffect(() => {
    if (!isRouterActive) {
      return;
    }

    if (urlSessionId && urlSessionId !== currentSessionId) {
      const sessionExists = sessions.some((s) => s.id === urlSessionId);
      if (sessionExists) {
        setCurrentSession(urlSessionId);
      }
    }
  }, [isRouterActive, urlSessionId, currentSessionId, setCurrentSession, sessions]);

  useEffect(() => {
    if (!isRouterActive) {
      return;
    }

    if (urlTab && urlTab !== activeMainTab) {
      setActiveMainTab(urlTab);
    }
  }, [isRouterActive, urlTab, activeMainTab, setActiveMainTab]);

  useEffect(() => {
    if (!isRouterActive) {
      return;
    }

    if (currentSessionId && currentSessionId !== urlSessionId) {
      setURLState({ sessionId: currentSessionId });
    }
  }, [isRouterActive, currentSessionId, urlSessionId, setURLState]);

  useEffect(() => {
    if (!isRouterActive) {
      return;
    }

    if (activeMainTab && activeMainTab !== urlTab) {
      setURLState({ tab: activeMainTab });
    }
  }, [isRouterActive, activeMainTab, urlTab, setURLState]);
}
