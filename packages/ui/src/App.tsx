import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { VSCodeLayout } from '@/components/layout/VSCodeLayout';
import { AgentManagerView } from '@/components/views/agent-manager';
import { FireworksProvider } from '@/contexts/FireworksContext';
import { Toaster } from '@/components/ui/sonner';
import { MemoryDebugPanel } from '@/components/ui/MemoryDebugPanel';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useEventStream } from '@/hooks/useEventStream';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMenuActions } from '@/hooks/useMenuActions';
import { useMessageSync } from '@/hooks/useMessageSync';
import { useSessionStatusBootstrap } from '@/hooks/useSessionStatusBootstrap';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';
import { useSessionDeepLink } from '@/hooks/useSessionDeepLink';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { GitPollingProvider } from '@/hooks/useGitPolling';
import { useConfigStore } from '@/stores/useConfigStore';
import { hasModifier } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { opencodeClient } from '@/lib/opencode/client';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT, DEFAULT_UI_FONT, UI_FONT_OPTION_MAP } from '@/lib/fontOptions';
import { ConfigUpdateOverlay } from '@/components/ui/ConfigUpdateOverlay';
import { AboutDialog } from '@/components/ui/AboutDialog';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { isCliAvailable } from '@/lib/desktop';
import { useUIStore } from '@/stores/useUIStore';
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
  const { uiFont, monoFont } = useFontPreferences();
  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => apis.runtime.isDesktop);
  const [isVSCodeRuntime, setIsVSCodeRuntime] = React.useState<boolean>(() => apis.runtime.isVSCode);
  const [cliAvailable, setCliAvailable] = React.useState<boolean>(() => {
    if (!apis.runtime.isDesktop) return true;
    return isCliAvailable();
  });

  React.useEffect(() => {
    setIsDesktopRuntime(apis.runtime.isDesktop);
    setIsVSCodeRuntime(apis.runtime.isVSCode);
  }, [apis.runtime.isDesktop, apis.runtime.isVSCode]);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

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
    const init = async () => {
      // VS Code runtime bootstraps config + sessions after the managed OpenCode instance reports "connected".
      // Doing the default initialization here can race with startup and lead to one-shot failures.
      if (isVSCodeRuntime) {
        return;
      }
      await initializeApp();
    };

    init();
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

  useEventStream();

  usePushVisibilityBeacon();

  useSessionDeepLink();

  useKeyboardShortcuts();

  const handleToggleMemoryDebug = React.useCallback(() => {
    setShowMemoryDebug(prev => !prev);
  }, []);

  useMenuActions(handleToggleMemoryDebug);

  useMessageSync();

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

  const handleCliAvailable = React.useCallback(() => {
    setCliAvailable(true);
    window.location.reload();
  }, []);

  if (isDesktopRuntime && !cliAvailable) {
    return (
      <ErrorBoundary>
        <div className={`h-full text-foreground bg-transparent`}>
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
            <div className={`h-full text-foreground ${isDesktopRuntime ? 'bg-transparent' : 'bg-background'}`}>
              <MainLayout />
              <Toaster />
              <ConfigUpdateOverlay />
              <AboutDialogWrapper />
              {showMemoryDebug && (
                <MemoryDebugPanel onClose={() => setShowMemoryDebug(false)} />
              )}
            </div>
          </FireworksProvider>
        </GitPollingProvider>
      </RuntimeAPIProvider>
    </ErrorBoundary>
  );
}

export default App;
