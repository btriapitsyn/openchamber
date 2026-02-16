import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { VSCodeLayout } from '@/components/layout/VSCodeLayout';
import { AgentManagerView } from '@/components/views/agent-manager';
import { FireworksProvider } from '@/contexts/FireworksContext';
import { Toaster } from '@/components/ui/sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MemoryDebugPanel } from '@/components/ui/MemoryDebugPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMenuActions } from '@/hooks/useMenuActions';
import { useSessionStatusBootstrap } from '@/hooks/useSessionStatusBootstrap';
import { useServerSessionStatus } from '@/hooks/useServerSessionStatus';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';
import { useRouter } from '@/hooks/useRouter';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { GitPollingProvider } from '@/hooks/useGitPolling';
import { useConfigStore } from '@/stores/useConfigStore';
import { hasModifier } from '@/lib/utils';
import { authenticateWithBiometrics, getBiometricStatus, isDesktopLocalOriginActive, isDesktopShell, isMobileRuntime, isNativeMobileApp, isTauriShell } from '@/lib/desktop';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useInstancesStore } from '@/stores/useInstancesStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT, DEFAULT_UI_FONT, UI_FONT_OPTION_MAP } from '@/lib/fontOptions';
import { ConfigUpdateOverlay } from '@/components/ui/ConfigUpdateOverlay';
import { AboutDialog } from '@/components/ui/AboutDialog';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { VoiceProvider } from '@/components/voice';
import { useUIStore } from '@/stores/useUIStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import type { RuntimeAPIs } from '@/lib/api/types';

const AboutDialogWrapper: React.FC = () => {
  const { isAboutDialogOpen, setAboutDialogOpen } = useUIStore();
  return (
    <AboutDialog
      open={isAboutDialogOpen}
      onOpenChange={setAboutDialogOpen}
    />
  );
};

type AppProps = {
  apis: RuntimeAPIs;
};

function App({ apis }: AppProps) {
  const { initializeApp, isInitialized, isConnected } = useConfigStore();
  const { error, clearError, loadSessions } = useSessionStore();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const isSwitchingDirectory = useDirectoryStore((state) => state.isSwitchingDirectory);
  const [showMemoryDebug, setShowMemoryDebug] = React.useState(false);
  const [connectionCheckCompleted, setConnectionCheckCompleted] = React.useState<boolean>(() => apis.runtime.isVSCode);
  const [isRetryingConnection, setIsRetryingConnection] = React.useState(false);
  const { uiFont, monoFont } = useFontPreferences();
  const refreshGitHubAuthStatus = useGitHubAuthStore((state) => state.refreshStatus);
  const [isVSCodeRuntime, setIsVSCodeRuntime] = React.useState<boolean>(() => apis.runtime.isVSCode);
  const [showCliOnboarding, setShowCliOnboarding] = React.useState(false);
  const instances = useInstancesStore((state) => state.instances);
  const currentInstanceId = useInstancesStore((state) => state.currentInstanceId);
  const setCurrentInstance = useInstancesStore((state) => state.setCurrentInstance);
  const touchInstance = useInstancesStore((state) => state.touchInstance);
  const isDeviceLoginOpen = useUIStore((state) => state.isDeviceLoginOpen);
  const setDeviceLoginOpen = useUIStore((state) => state.setDeviceLoginOpen);
  const biometricLockEnabled = useUIStore((state) => state.biometricLockEnabled);
  const setBiometricLockEnabled = useUIStore((state) => state.setBiometricLockEnabled);
  const appReadyDispatchedRef = React.useRef(false);
  const [biometricRequired, setBiometricRequired] = React.useState(false);
  const [biometricBusy, setBiometricBusy] = React.useState(false);

  React.useEffect(() => {
    setIsVSCodeRuntime(apis.runtime.isVSCode);
  }, [apis.runtime.isVSCode]);

  React.useEffect(() => {
    setConnectionCheckCompleted(isVSCodeRuntime);
  }, [isVSCodeRuntime]);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  React.useEffect(() => {
    void refreshGitHubAuthStatus(apis.github, { force: true });
  }, [apis.github, refreshGitHubAuthStatus]);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const uiStack = UI_FONT_OPTION_MAP[uiFont]?.stack ?? UI_FONT_OPTION_MAP[DEFAULT_UI_FONT].stack;
    const monoStack = CODE_FONT_OPTION_MAP[monoFont]?.stack ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT].stack;

    root.style.setProperty('--font-sans', uiStack);
    root.style.setProperty('--font-heading', uiStack);
    root.style.setProperty('--font-family-sans', uiStack);
    root.style.setProperty('--font-mono', monoStack);
    root.style.setProperty('--font-family-mono', monoStack);
    root.style.setProperty('--ui-regular-font-weight', '400');

    if (document.body) {
      document.body.style.fontFamily = uiStack;
    }
  }, [uiFont, monoFont]);

  React.useEffect(() => {
    if (isInitialized) {
      const hideInitialLoading = () => {
        const loadingElement = document.getElementById('initial-loading');
        if (loadingElement) {
          loadingElement.classList.add('fade-out');

          setTimeout(() => {
            loadingElement.remove();
          }, 300);
        }
      };

      const timer = setTimeout(hideInitialLoading, 150);
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      const loadingElement = document.getElementById('initial-loading');
      if (loadingElement && !isInitialized) {
        loadingElement.classList.add('fade-out');
        setTimeout(() => {
          loadingElement.remove();
        }, 300);
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [isInitialized]);

  React.useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (isVSCodeRuntime) {
        if (!cancelled) {
          setConnectionCheckCompleted(true);
        }
        return;
      }

      if (!cancelled) {
        setConnectionCheckCompleted(false);
      }

      await initializeApp();

      if (!cancelled) {
        setConnectionCheckCompleted(true);
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, [initializeApp, isVSCodeRuntime]);

  React.useEffect(() => {
    if (isSwitchingDirectory) {
      return;
    }

    const syncDirectoryAndSessions = async () => {
      // VS Code runtime loads sessions via VSCodeLayout bootstrap to avoid startup races.
      if (isVSCodeRuntime) {
        return;
      }

      if (!isConnected) {
        return;
      }
      opencodeClient.setDirectory(currentDirectory);

      await loadSessions();
    };

    syncDirectoryAndSessions();
  }, [currentDirectory, isSwitchingDirectory, loadSessions, isConnected, isVSCodeRuntime]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isInitialized || isSwitchingDirectory) return;
    if (appReadyDispatchedRef.current) return;
    appReadyDispatchedRef.current = true;
    (window as unknown as { __openchamberAppReady?: boolean }).__openchamberAppReady = true;
    window.dispatchEvent(new Event('openchamber:app-ready'));
  }, [isInitialized, isSwitchingDirectory]);

  useEventStream();

  // Server-authoritative session status polling
  // Replaces SSE-dependent status updates with reliable HTTP polling
  useServerSessionStatus();

  usePushVisibilityBeacon();

  useRouter();

  useKeyboardShortcuts();

  const handleToggleMemoryDebug = React.useCallback(() => {
    setShowMemoryDebug(prev => !prev);
  }, []);

  useMenuActions(handleToggleMemoryDebug);

  const settingsAutoCreateWorktree = useConfigStore((state) => state.settingsAutoCreateWorktree);
  React.useEffect(() => {
    if (!isDesktopShell() || !isTauriShell()) {
      return;
    }
    const tauri = (window as unknown as { __TAURI__?: { core?: { invoke?: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__;
    if (typeof tauri?.core?.invoke !== 'function') {
      return;
    }

    void tauri.core.invoke('desktop_set_auto_worktree_menu', { enabled: settingsAutoCreateWorktree });
  }, [settingsAutoCreateWorktree]);



  useSessionStatusBootstrap();
  useSessionAutoCleanup();

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (hasModifier(e) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        setShowMemoryDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  React.useEffect(() => {
    if (error) {

      setTimeout(() => clearError(), 5000);
    }
  }, [error, clearError]);

  React.useEffect(() => {
    if (!isDesktopShell() || !isDesktopLocalOriginActive()) {
      return;
    }

    let cancelled = false;
    const run = async () => {
      try {
        const res = await fetch('/health', { method: 'GET' });
        if (!res.ok) return;
        const data = (await res.json().catch(() => null)) as null | { openCodeRunning?: unknown; lastOpenCodeError?: unknown };
        if (!data || cancelled) return;
        const openCodeRunning = data.openCodeRunning === true;
        const err = typeof data.lastOpenCodeError === 'string' ? data.lastOpenCodeError : '';
        const cliMissing =
          !openCodeRunning &&
          /ENOENT|spawn\s+opencode|Unable\s+to\s+locate\s+the\s+opencode\s+CLI|OpenCode\s+CLI\s+not\s+found|opencode(\.exe)?\s+not\s+found|env:\s*(node|bun):\s*No\s+such\s+file\s+or\s+directory|(node|bun):\s*No\s+such\s+file\s+or\s+directory/i.test(err);
        setShowCliOnboarding(cliMissing);
      } catch {
        // ignore
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCliAvailable = React.useCallback(() => {
    setShowCliOnboarding(false);
    window.location.reload();
  }, []);

  const handleRetryConnection = React.useCallback(async () => {
    setIsRetryingConnection(true);
    try {
      await initializeApp();
      setConnectionCheckCompleted(true);
    } finally {
      setIsRetryingConnection(false);
    }
  }, [initializeApp]);

  const sortedInstances = React.useMemo(() => {
    return [...instances].sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0));
  }, [instances]);

  const alternativeInstances = React.useMemo(() => {
    return sortedInstances.filter((instance) => instance.id !== currentInstanceId);
  }, [currentInstanceId, sortedInstances]);

  const handleSwitchInstance = React.useCallback((instanceId: string) => {
    if (!instanceId || instanceId === currentInstanceId) {
      return;
    }
    setCurrentInstance(instanceId);
    touchInstance(instanceId);
    window.location.reload();
  }, [currentInstanceId, setCurrentInstance, touchInstance]);

  const showConnectionRecoveryDialog = connectionCheckCompleted
    && !isVSCodeRuntime
    && !isConnected
    && !isDeviceLoginOpen;

  const isMobileShellRuntime = React.useMemo(() => isMobileRuntime(), []);

  const requestBiometricUnlock = React.useCallback(async () => {
    if (!isNativeMobileApp() || !biometricLockEnabled) {
      setBiometricRequired(false);
      return true;
    }

    setBiometricBusy(true);
    try {
      const status = await getBiometricStatus();
      if (!status.isAvailable) {
        setBiometricRequired(true);
        return false;
      }

      const authenticated = await authenticateWithBiometrics('Unlock OpenChamber', {
        allowDeviceCredential: true,
        title: 'Unlock OpenChamber',
        subtitle: 'Authenticate to continue',
        confirmationRequired: false,
      });
      setBiometricRequired(!authenticated);
      return authenticated;
    } finally {
      setBiometricBusy(false);
    }
  }, [biometricLockEnabled]);

  React.useEffect(() => {
    if (!isNativeMobileApp() || !biometricLockEnabled) {
      setBiometricRequired(false);
      return;
    }
    void requestBiometricUnlock();
  }, [biometricLockEnabled, requestBiometricUnlock]);

  const connectionRecoveryDialog = showConnectionRecoveryDialog ? (
    <Dialog open={showConnectionRecoveryDialog} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Connection required</DialogTitle>
          <DialogDescription>
            Unable to reach `{opencodeClient.getBaseUrl()}`. Retry, switch to another saved instance, or connect a new one.
          </DialogDescription>
        </DialogHeader>

        {alternativeInstances.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {alternativeInstances.slice(0, 4).map((instance) => (
              <Button
                key={instance.id}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSwitchInstance(instance.id)}
              >
                {instance.label || instance.origin}
              </Button>
            ))}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setDeviceLoginOpen(true);
            }}
          >
            {isMobileShellRuntime ? 'Connect Another Instance' : 'Add Instance'}
          </Button>
          <Button type="button" onClick={() => void handleRetryConnection()} disabled={isRetryingConnection}>
            {isRetryingConnection ? 'Retrying...' : 'Retry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  const biometricLockDialog = biometricRequired ? (
    <Dialog open={biometricRequired} onOpenChange={() => {}}>
      <DialogContent className="max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Unlock OpenChamber</DialogTitle>
          <DialogDescription>
            Biometric verification is required to access this app.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setBiometricLockEnabled(false);
              setBiometricRequired(false);
            }}
          >
            Disable lock
          </Button>
          <Button type="button" onClick={() => void requestBiometricUnlock()} disabled={biometricBusy}>
            {biometricBusy ? 'Checking...' : 'Unlock'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ) : null;

  if (showCliOnboarding) {
    return (
      <ErrorBoundary>
        <div className="h-full text-foreground bg-transparent">
          <OnboardingScreen onCliAvailable={handleCliAvailable} />
        </div>
      </ErrorBoundary>
    );
  }

  // VS Code runtime - simplified layout without git/terminal views
  if (isVSCodeRuntime) {
    // Check if this is the Agent Manager panel
    const panelType = typeof window !== 'undefined' 
      ? (window as { __OPENCHAMBER_PANEL_TYPE__?: 'chat' | 'agentManager' }).__OPENCHAMBER_PANEL_TYPE__ 
      : 'chat';
    
    if (panelType === 'agentManager') {
      return (
        <ErrorBoundary>
          <RuntimeAPIProvider apis={apis}>
            <div className="h-full text-foreground bg-background">
              <AgentManagerView />
              <Toaster />
              {connectionRecoveryDialog}
            </div>
          </RuntimeAPIProvider>
        </ErrorBoundary>
      );
    }
    
    return (
      <ErrorBoundary>
        <RuntimeAPIProvider apis={apis}>
          <FireworksProvider>
            <div className="h-full text-foreground bg-background">
              <VSCodeLayout />
              <Toaster />
              {connectionRecoveryDialog}
            </div>
          </FireworksProvider>
        </RuntimeAPIProvider>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <RuntimeAPIProvider apis={apis}>
        <GitPollingProvider>
          <FireworksProvider>
            <VoiceProvider>
              <div className="h-full text-foreground bg-background">
              <MainLayout />
              <Toaster />
              <ConfigUpdateOverlay />
              <AboutDialogWrapper />
                {showMemoryDebug && (
                  <MemoryDebugPanel onClose={() => setShowMemoryDebug(false)} />
                )}
              {connectionRecoveryDialog}
              {biometricLockDialog}
            </div>
          </VoiceProvider>
          </FireworksProvider>
        </GitPollingProvider>
      </RuntimeAPIProvider>
    </ErrorBoundary>
  );
}

export default App;
