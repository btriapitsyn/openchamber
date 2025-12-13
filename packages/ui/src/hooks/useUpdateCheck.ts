import { useEffect, useState, useCallback } from 'react';
import {
  checkForDesktopUpdates,
  downloadDesktopUpdate,
  restartToApplyUpdate,
  isDesktopRuntime,
  type UpdateInfo,
  type UpdateProgress,
} from '@/lib/desktop';

export type UpdateState = {
  checking: boolean;
  available: boolean;
  downloading: boolean;
  downloaded: boolean;
  info: UpdateInfo | null;
  progress: UpdateProgress | null;
  error: string | null;
};

export type UseUpdateCheckReturn = UpdateState & {
  checkForUpdates: () => Promise<void>;
  downloadUpdate: () => Promise<void>;
  restartToUpdate: () => Promise<void>;
  dismiss: () => void;
};

interface MockUpdateConfig {
  currentVersion?: string;
  newVersion?: string;
}

// Set window.__OPENCHAMBER_MOCK_UPDATE__ = { currentVersion: '1.0.3', newVersion: '1.0.8' } to test with real changelog
declare global {
  interface Window {
    __OPENCHAMBER_MOCK_UPDATE__?: boolean | MockUpdateConfig;
  }
}

const getMockConfig = (): MockUpdateConfig | null => {
  if (typeof window === 'undefined') return null;
  const mock = window.__OPENCHAMBER_MOCK_UPDATE__;
  if (!mock) return null;
  if (mock === true) return { currentVersion: '1.0.3', newVersion: '1.0.8' };
  return mock;
};

const createMockUpdate = (config: MockUpdateConfig): UpdateState => ({
  checking: false,
  available: true,
  downloading: false,
  downloaded: false,
  info: {
    available: true,
    version: config.newVersion ?? '99.0.0-test',
    currentVersion: config.currentVersion ?? '0.0.0',
    body: undefined,
  },
  progress: null,
  error: null,
});

const shouldMockUpdate = (): boolean => {
  return getMockConfig() !== null;
};

export const useUpdateCheck = (checkOnMount = true): UseUpdateCheckReturn => {
  const [state, setState] = useState<UpdateState>({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    info: null,
    progress: null,
    error: null,
  });

  // Only check mock mode once at startup - no polling
  const [mockMode] = useState(shouldMockUpdate);
  const [mockState, setMockState] = useState<UpdateState | null>(() => {
    if (shouldMockUpdate()) {
      const config = getMockConfig();
      return config ? createMockUpdate(config) : null;
    }
    return null;
  });

  const checkForUpdates = useCallback(async () => {
    if (mockMode) {
      const config = getMockConfig();
      if (config) {
        const mockUpdate = createMockUpdate(config);
        mockUpdate.info = {
          ...mockUpdate.info!,
          body: `## [${config.newVersion}] - 2025-01-01\n- Mock update for UI testing`,
        };
        setMockState(mockUpdate);
      }
      return;
    }
    if (!isDesktopRuntime()) {
      return;
    }

    setState((prev) => ({ ...prev, checking: true, error: null }));

    try {
      const info = await checkForDesktopUpdates();
      setState((prev) => ({
        ...prev,
        checking: false,
        available: info?.available ?? false,
        info,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        checking: false,
        error: error instanceof Error ? error.message : 'Failed to check for updates',
      }));
    }
  }, [mockMode]);

  const downloadUpdate = useCallback(async () => {
    if (mockMode) {
      setMockState((prev) => prev ? { ...prev, downloading: true } : prev);
      let progress = 0;
      const interval = setInterval(() => {
        progress += 20;
        setMockState((prev) => prev ? {
          ...prev,
          progress: { downloaded: progress * 1000, total: 100000 }
        } : prev);
        if (progress >= 100) {
          clearInterval(interval);
          setMockState((prev) => prev ? {
            ...prev,
            downloading: false,
            downloaded: true,
            progress: null,
          } : prev);
        }
      }, 500);
      return;
    }

    if (!isDesktopRuntime() || !state.available) {
      return;
    }

    setState((prev) => ({ ...prev, downloading: true, error: null, progress: null }));

    try {
      await downloadDesktopUpdate((progress) => {
        setState((prev) => ({ ...prev, progress }));
      });
      setState((prev) => ({ ...prev, downloading: false, downloaded: true }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : 'Failed to download update',
      }));
    }
  }, [mockMode, state.available]);

  const restartToUpdate = useCallback(async () => {
    if (mockMode) {
      return;
    }

    if (!isDesktopRuntime() || !state.downloaded) {
      return;
    }

    try {
      await restartToApplyUpdate();
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to restart',
      }));
    }
  }, [mockMode, state.downloaded]);

  const dismiss = useCallback(() => {
    if (mockMode) {
      setMockState(null);
      return;
    }
    setState((prev) => ({ ...prev, available: false, downloaded: false, info: null }));
  }, [mockMode]);

  useEffect(() => {
    if (checkOnMount && (isDesktopRuntime() || mockMode)) {
      const timer = setTimeout(() => {
        checkForUpdates();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [checkOnMount, checkForUpdates, mockMode]);

  const currentState = (mockMode && mockState) ? mockState : state;

  return {
    ...currentState,
    checkForUpdates,
    downloadUpdate,
    restartToUpdate,
    dismiss,
  };
};
