import React from 'react';
import { useURLActions, type MainTab } from '@/stores/useURLStore';

interface NavigateOptions {
  tab?: MainTab;
  directory?: string;
}

export function useNavigation() {
  const { setURLState } = useURLActions();

  const navigateToSession = React.useCallback((sessionId: string, options: NavigateOptions = {}) => {
    setURLState({
      sessionId,
      tab: options.tab,
      directory: options.directory || null,
    });
  }, [setURLState]);

  const copySessionLink = React.useCallback((sessionId: string, options: NavigateOptions = {}) => {
    const params = new URLSearchParams(window.location.search);

    if (options.tab && options.tab !== 'chat') {
      params.set('tab', options.tab);
    }

    if (options.directory) {
      params.set('directory', options.directory);
    }

    const url = `${window.location.origin}/session/${sessionId}${params.toString() ? `?${params.toString()}` : ''}`;

    if (typeof navigator.clipboard !== 'undefined') {
      navigator.clipboard.writeText(url).catch((error) => {
        console.error('Failed to copy link:', error);
      });
    }

    return url;
  }, []);

  const navigateToSettings = React.useCallback(() => {
    window.location.href = '/settings';
  }, []);

  const navigateToHome = React.useCallback(() => {
    window.location.href = '/';
  }, []);

  return {
    navigateToSession,
    copySessionLink,
    navigateToSettings,
    navigateToHome,
  };
}
