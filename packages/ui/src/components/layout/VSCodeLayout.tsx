import React from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { ChatView, SettingsView } from '@/components/views';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { McpDropdown } from '@/components/mcp/McpDropdown';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { RiAddLine, RiArrowLeftLine, RiRobot2Line, RiSettings3Line } from '@remixicon/react';

// Width threshold for mobile vs desktop layout in settings
const MOBILE_WIDTH_THRESHOLD = 550;

type VSCodeView = 'sessions' | 'chat' | 'settings';

export const VSCodeLayout: React.FC = () => {
  const runtimeApis = useRuntimeAPIs();

  const viewMode = React.useMemo<'sidebar' | 'editor'>(() => {
    const configured =
      typeof window !== 'undefined'
        ? (window as unknown as { __VSCODE_CONFIG__?: { viewMode?: unknown } }).__VSCODE_CONFIG__?.viewMode
        : null;
    return configured === 'editor' ? 'editor' : 'sidebar';
  }, []);

  const initialSessionId = React.useMemo<string | null>(() => {
    const configured =
      typeof window !== 'undefined'
        ? (window as unknown as { __VSCODE_CONFIG__?: { initialSessionId?: unknown } }).__VSCODE_CONFIG__?.initialSessionId
        : null;
    if (typeof configured === 'string' && configured.trim().length > 0) {
      return configured.trim();
    }
    return null;
  }, []);

  const hasAppliedInitialSession = React.useRef(false);

  const [currentView, setCurrentView] = React.useState<VSCodeView>('chat');
  const [containerWidth, setContainerWidth] = React.useState<number>(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);

  const activeSessionTitle = React.useMemo(() => {
    if (!currentSessionId) {
      return null;
    }
    return sessions.find((session) => session.id === currentSessionId)?.title || 'Session';
  }, [currentSessionId, sessions]);
  const newSessionDraftOpen = useSessionStore((state) => Boolean(state.newSessionDraft?.open));
  const openNewSessionDraft = useSessionStore((state) => state.openNewSessionDraft);
  const [connectionStatus, setConnectionStatus] = React.useState<'connecting' | 'connected' | 'error' | 'disconnected'>(
    () => (typeof window !== 'undefined'
      ? (window as { __OPENCHAMBER_CONNECTION__?: { status?: string } }).__OPENCHAMBER_CONNECTION__?.status as
        'connecting' | 'connected' | 'error' | 'disconnected' | undefined
      : 'connecting') || 'connecting'
  );
  const configInitialized = useConfigStore((state) => state.isInitialized);
  const initializeConfig = useConfigStore((state) => state.initializeApp);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const loadMessages = useSessionStore((state) => state.loadMessages);
  const messages = useSessionStore((state) => state.messages);
  const [hasInitializedOnce, setHasInitializedOnce] = React.useState<boolean>(() => configInitialized);
  const [isInitializing, setIsInitializing] = React.useState<boolean>(false);
  const lastBootstrapAttemptAt = React.useRef<number>(0);

  // Navigate to chat when a session is selected
  React.useEffect(() => {
    if (currentSessionId) {
      setCurrentView('chat');
    }
  }, [currentSessionId]);

  React.useEffect(() => {
    const vscodeApi = runtimeApis.vscode;
    if (!vscodeApi) {
      return;
    }

    void vscodeApi.executeCommand('openchamber.setActiveSession', currentSessionId, activeSessionTitle);
  }, [activeSessionTitle, currentSessionId, runtimeApis.vscode]);

  // If the active session disappears (e.g., deleted), show a new chat view
  React.useEffect(() => {
    if (viewMode === 'editor') {
      return;
    }

    if (!currentSessionId && !newSessionDraftOpen) {
      openNewSessionDraft();
    }
  }, [currentSessionId, newSessionDraftOpen, openNewSessionDraft, viewMode]);

  const handleBackToSessions = React.useCallback(() => {
    setCurrentView('sessions');
  }, []);


  // Listen for connection status changes
  React.useEffect(() => {
    // Catch up with the latest status even if the extension posted the connection message
    // before this component registered the event listener.
    const current =
      (typeof window !== 'undefined'
        ? (window as { __OPENCHAMBER_CONNECTION__?: { status?: string } }).__OPENCHAMBER_CONNECTION__?.status
        : undefined) as 'connecting' | 'connected' | 'error' | 'disconnected' | undefined;
    if (current === 'connected' || current === 'connecting' || current === 'error' || current === 'disconnected') {
      setConnectionStatus(current);
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string; error?: string }>).detail;
      const status = detail?.status;
      if (status === 'connected' || status === 'connecting' || status === 'error' || status === 'disconnected') {
        setConnectionStatus(status);
      }
    };
    window.addEventListener('openchamber:connection-status', handler as EventListener);
    return () => window.removeEventListener('openchamber:connection-status', handler as EventListener);
  }, []);

  // Listen for navigation events from VS Code extension title bar buttons
  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ view?: string }>).detail;
      const view = detail?.view;
      if (view === 'settings') {
        setCurrentView('settings');
      } else if (view === 'chat') {
        setCurrentView('chat');
      } else if (view === 'sessions') {
        setCurrentView('sessions');
      }
    };
    window.addEventListener('openchamber:navigate', handler as EventListener);
    return () => window.removeEventListener('openchamber:navigate', handler as EventListener);
  }, []);

  // Bootstrap config and sessions when connected
  React.useEffect(() => {
    const runBootstrap = async () => {
      if (isInitializing || hasInitializedOnce || connectionStatus !== 'connected') {
        return;
      }
      const now = Date.now();
      if (now - lastBootstrapAttemptAt.current < 750) {
        return;
      }
      lastBootstrapAttemptAt.current = now;
      setIsInitializing(true);
      try {
        const debugEnabled = (() => {
          if (typeof window === 'undefined') return false;
          try {
            return window.localStorage.getItem('openchamber_stream_debug') === '1';
          } catch {
            return false;
          }
        })();

        if (debugEnabled) console.log('[OpenChamber][VSCode][bootstrap] attempt', { configInitialized });
        if (!configInitialized) {
          await initializeConfig();
        }
        const configState = useConfigStore.getState();
        // If OpenCode is still warming up, the initial provider/agent loads can fail and be swallowed by retries.
        // Only mark bootstrap complete when core datasets are present so we keep retrying on cold starts.
        if (!configState.isInitialized || !configState.isConnected || configState.providers.length === 0 || configState.agents.length === 0) {
          return;
        }
        await loadSessions();
        const sessionsError = useSessionStore.getState().error;
        if (debugEnabled) console.log('[OpenChamber][VSCode][bootstrap] post-load', {
          providers: configState.providers.length,
          agents: configState.agents.length,
          sessions: useSessionStore.getState().sessions.length,
          sessionsError,
        });
        if (typeof sessionsError === 'string' && sessionsError.length > 0) {
          return;
        }
        setHasInitializedOnce(true);
      } catch {
        // Ignore bootstrap failures
      } finally {
        setIsInitializing(false);
      }
    };
    void runBootstrap();
  }, [connectionStatus, configInitialized, hasInitializedOnce, initializeConfig, isInitializing, loadSessions]);

  React.useEffect(() => {
    if (viewMode !== 'editor') {
      return;
    }
    if (hasAppliedInitialSession.current) {
      return;
    }
    if (!initialSessionId) {
      return;
    }
    if (!hasInitializedOnce || connectionStatus !== 'connected') {
      return;
    }
    if (!sessions.some((session) => session.id === initialSessionId)) {
      return;
    }

    hasAppliedInitialSession.current = true;
    void useSessionStore.getState().setCurrentSession(initialSessionId);
  }, [connectionStatus, hasInitializedOnce, initialSessionId, sessions, viewMode]);

  // Hydrate messages when viewing chat
  React.useEffect(() => {
    const hydrateMessages = async () => {
      if (!hasInitializedOnce || connectionStatus !== 'connected' || currentView !== 'chat' || newSessionDraftOpen) {
        return;
      }

      if (!currentSessionId) {
        return;
      }

      const hasMessages = messages.has(currentSessionId) && (messages.get(currentSessionId)?.length || 0) > 0;
      if (!hasMessages) {
        try {
          await loadMessages(currentSessionId);
        } catch { /* ignored */ }
      }
    };

    void hydrateMessages();
  }, [connectionStatus, currentSessionId, currentView, hasInitializedOnce, loadMessages, messages, newSessionDraftOpen]);

  // Track container width for responsive settings layout
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    observer.observe(container);
    // Set initial width
    setContainerWidth(container.clientWidth);

    return () => observer.disconnect();
  }, []);

  const usesMobileLayout = containerWidth > 0 && containerWidth < MOBILE_WIDTH_THRESHOLD;

  return (
    <div ref={containerRef} className="h-full w-full bg-background text-foreground flex flex-col">
      {viewMode === 'editor' ? (
        <div className="flex flex-col h-full">
          <VSCodeHeader
            title={sessions.find((session) => session.id === currentSessionId)?.title || 'Chat'}
            showMcp
            showContextUsage
          />
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <ChatView />
            </ErrorBoundary>
          </div>
        </div>
      ) : currentView === 'sessions' ? (
        <div className="flex flex-col h-full">
          <VSCodeHeader
            title="Sessions"
          />
          <div className="flex-1 overflow-hidden">
            <SessionSidebar
              mobileVariant
              allowReselect
              onSessionSelected={() => setCurrentView('chat')}
              hideDirectoryControls
              showOnlyMainWorkspace
            />
          </div>
        </div>
      ) : currentView === 'settings' ? (
        <SettingsView
          onClose={() => setCurrentView('sessions')}
          forceMobile={usesMobileLayout}
        />
      ) : (
        <div className="flex flex-col h-full">
          <VSCodeHeader
            title={newSessionDraftOpen && !currentSessionId
              ? 'New session'
              : sessions.find((session) => session.id === currentSessionId)?.title || 'Chat'}
            showBack
            onBack={handleBackToSessions}
            showMcp
            showContextUsage
          />
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <ChatView />
            </ErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
};

interface VSCodeHeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  onNewSession?: () => void;
  onSettings?: () => void;
  onAgentManager?: () => void;
  showMcp?: boolean;
  showContextUsage?: boolean;
}

const VSCodeHeader: React.FC<VSCodeHeaderProps> = ({ title, showBack, onBack, onNewSession, onSettings, onAgentManager, showMcp, showContextUsage }) => {
  const { getCurrentModel } = useConfigStore();
  const getContextUsage = useSessionStore((state) => state.getContextUsage);

  const currentModel = getCurrentModel();
  const limits = (currentModel?.limit && typeof currentModel.limit === 'object'
    ? currentModel.limit
    : null) as { context?: number; output?: number } | null;
  const contextLimit = typeof limits?.context === 'number' ? limits.context : 0;
  const outputLimit = typeof limits?.output === 'number' ? limits.output : 0;
  const contextUsage = getContextUsage(contextLimit, outputLimit);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background shrink-0">
      {showBack && onBack && (
        <button
          onClick={onBack}
          className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Back to sessions"
        >
          <RiArrowLeftLine className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-sm font-medium truncate flex-1 h-9 w-9 items-center justify-center p-2" title={title}>{title}</h1>
      {onNewSession && (
        <button
          onClick={onNewSession}
          className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="New session"
        >
          <RiAddLine className="h-5 w-5" />
        </button>
      )}
      {onAgentManager && (
        <button
          onClick={onAgentManager}
          className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Open Agent Manager"
        >
          <RiRobot2Line className="h-5 w-5" />
        </button>
      )}
      {showMcp && (
        <McpDropdown
          headerIconButtonClass="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
      )}
      {onSettings && (
        <button
          onClick={onSettings}
          className="inline-flex h-9 w-9 items-center justify-center p-2 text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Settings"
        >
          <RiSettings3Line className="h-5 w-5" />
        </button>
      )}
      {showContextUsage && contextUsage && contextUsage.totalTokens > 0 && (
        <ContextUsageDisplay
          totalTokens={contextUsage.totalTokens}
          percentage={contextUsage.percentage}
          contextLimit={contextUsage.contextLimit}
          outputLimit={contextUsage.outputLimit ?? 0}
          size="compact"
        />
      )}
    </div>
  );
};
