import React from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { ChatView } from '@/components/views';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { RiAddLine, RiArrowLeftLine } from '@remixicon/react';
import { RiLoader4Line } from '@remixicon/react';

type VSCodeView = 'sessions' | 'chat';

export const VSCodeLayout: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<VSCodeView>('sessions');
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const createSession = useSessionStore((state) => state.createSession);
  const setCurrentSession = useSessionStore((state) => state.setCurrentSession);
  const [connectionStatus, setConnectionStatus] = React.useState<'connecting' | 'connected' | 'error' | 'disconnected'>(
    () => (typeof window !== 'undefined'
      ? (window as { __OPENCHAMBER_CONNECTION__?: { status?: string } }).__OPENCHAMBER_CONNECTION__?.status as
        'connecting' | 'connected' | 'error' | 'disconnected' | undefined
      : 'connecting') || 'connecting'
  );
  const [connectionError, setConnectionError] = React.useState<string | undefined>(
    () => (typeof window !== 'undefined'
      ? (window as { __OPENCHAMBER_CONNECTION__?: { error?: string } }).__OPENCHAMBER_CONNECTION__?.error
      : undefined),
  );
  const [hasEverConnected, setHasEverConnected] = React.useState<boolean>(() => connectionStatus === 'connected');
  const [overlayVisible, setOverlayVisible] = React.useState<boolean>(() => connectionStatus !== 'connected');
  const overlayTimer = React.useRef<number | null>(null);
  const configInitialized = useConfigStore((state) => state.isInitialized);
  const initializeConfig = useConfigStore((state) => state.initializeApp);
  const loadSessions = useSessionStore((state) => state.loadSessions);
  const loadMessages = useSessionStore((state) => state.loadMessages);
  const messages = useSessionStore((state) => state.messages);
  const [hasInitializedOnce, setHasInitializedOnce] = React.useState<boolean>(() => configInitialized);
  const [isInitializing, setIsInitializing] = React.useState<boolean>(false);
  const autoSelectedRef = React.useRef<boolean>(false);
  const startedFreshSessionRef = React.useRef<boolean>(false);

  // Navigate to chat when a session is selected
  React.useEffect(() => {
    if (currentSessionId) {
      setCurrentView('chat');
    }
  }, [currentSessionId]);

  // If the active session disappears (e.g., deleted), stay on the sessions list
  React.useEffect(() => {
    if (!currentSessionId && currentView === 'chat') {
      setCurrentView('sessions');
    }
  }, [currentSessionId, currentView]);

  const handleBackToSessions = React.useCallback(() => {
    setCurrentView('sessions');
  }, []);

  const handleNewSession = React.useCallback(async () => {
    const result = await createSession();
    if (result?.id) {
      setCurrentView('chat');
    }
  }, [createSession]);

  React.useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string; error?: string }>).detail;
      const status = detail?.status;
      if (status === 'connected' || status === 'connecting' || status === 'error' || status === 'disconnected') {
        setConnectionStatus(status);
        setConnectionError(detail?.error);
        if (status === 'connected') {
          setHasEverConnected(true);
        }
      }
    };
    window.addEventListener('openchamber:connection-status', handler as EventListener);
    return () => window.removeEventListener('openchamber:connection-status', handler as EventListener);
  }, []);

  const showConnectionOverlay = React.useMemo(() => {
    if (hasInitializedOnce && connectionStatus === 'connected' && !isInitializing) {
      return false;
    }
    if (!hasInitializedOnce) {
      return connectionStatus !== 'connected' || isInitializing;
    }
    return connectionStatus === 'error';
  }, [connectionStatus, hasInitializedOnce, isInitializing]);

  const overlayDelay = hasEverConnected ? 800 : 250;

  React.useEffect(() => {
    if (overlayTimer.current) {
      window.clearTimeout(overlayTimer.current);
      overlayTimer.current = null;
    }

    if (showConnectionOverlay) {
      overlayTimer.current = window.setTimeout(() => setOverlayVisible(true), overlayDelay);
    } else {
      setOverlayVisible(false);
    }

    return () => {
      if (overlayTimer.current) {
        window.clearTimeout(overlayTimer.current);
        overlayTimer.current = null;
      }
    };
  }, [overlayDelay, showConnectionOverlay]);

  React.useEffect(() => {
    const runBootstrap = async () => {
      if (isInitializing || hasInitializedOnce || connectionStatus !== 'connected') {
        return;
      }
      setIsInitializing(true);
      try {
        if (!configInitialized) {
          await initializeConfig();
        }
        await loadSessions();
        setHasInitializedOnce(true);
      } catch {
        // Ignore bootstrap failures; overlay will remain until next attempt
      } finally {
        setIsInitializing(false);
      }
    };
    void runBootstrap();
  }, [connectionStatus, configInitialized, hasInitializedOnce, initializeConfig, isInitializing, loadSessions]);

  React.useEffect(() => {
    const hydrateMessages = async () => {
      if (!hasInitializedOnce || connectionStatus !== 'connected' || currentView !== 'chat') {
        return;
      }
      const targetSessionId = currentSessionId || sessions[0]?.id;
      if (!targetSessionId) return;

      const hasMessages = messages.has(targetSessionId) && (messages.get(targetSessionId)?.length || 0) > 0;
      if (!hasMessages) {
        if (!currentSessionId) {
          setCurrentSession(targetSessionId);
        }
        try {
          await loadMessages(targetSessionId);
        } catch { /* ignored */ }
      }
    };

    void hydrateMessages();
  }, [connectionStatus, currentSessionId, currentView, hasInitializedOnce, loadMessages, messages, sessions, setCurrentSession]);

  React.useEffect(() => {
    if (!hasInitializedOnce || autoSelectedRef.current) {
      return;
    }
    if (!currentSessionId && sessions.length > 0) {
      setCurrentSession(sessions[0].id);
      autoSelectedRef.current = true;
    }
  }, [currentSessionId, hasInitializedOnce, sessions, setCurrentSession]);

  React.useEffect(() => {
    const ensureFreshSession = async () => {
      if (connectionStatus !== 'connected' || !hasInitializedOnce || startedFreshSessionRef.current) {
        return;
      }
      
      const current = sessions.find((s) => s.id === currentSessionId);
      const isCurrentPlaceholder = current?.title?.toLowerCase()?.startsWith('new session');

      if (current && isCurrentPlaceholder) {
        setCurrentSession(current.id);
      } else {
        // Look for an existing empty session to reuse before creating a new one
        const reusableSession = sessions.find((s) => s.title?.toLowerCase()?.startsWith('new session'));
        
        if (reusableSession) {
          setCurrentSession(reusableSession.id);
        } else {
          const newSession = await createSession();
          if (newSession?.id) {
            setCurrentSession(newSession.id);
          }
        }
      }
      startedFreshSessionRef.current = true;
    };

    void ensureFreshSession();
  }, [connectionStatus, createSession, currentSessionId, hasInitializedOnce, sessions, setCurrentSession]);

  return (
    <div className="h-full w-full bg-background text-foreground flex flex-col">
      {currentView === 'sessions' ? (
        <div className="flex flex-col h-full">
          <VSCodeHeader title="Sessions" onNewSession={handleNewSession} />
          <div className="flex-1 overflow-hidden">
            <SessionSidebar
              mobileVariant
              allowReselect
              onSessionSelected={() => setCurrentView('chat')}
              hideDirectoryControls
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-col h-full">
          <VSCodeHeader
            title={sessions.find(s => s.id === currentSessionId)?.title || 'Chat'}
            showBack
            onBack={handleBackToSessions}
            showContextUsage
          />
          <div className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <ChatView />
            </ErrorBoundary>
          </div>
        </div>
      )}
      {overlayVisible && (
        <div className="absolute inset-0 z-50 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-center px-4">
          <RiLoader4Line className="h-7 w-7 animate-spin text-muted-foreground" />
          <div className="text-sm font-medium">
            {connectionStatus === 'connecting'
              ? (hasEverConnected ? 'Reconnecting to OpenCode…' : 'Starting OpenCode API…')
              : 'Lost connection to OpenCode'}
          </div>
          {connectionError && (
            <div className="text-xs text-muted-foreground max-w-md">
              {connectionError}
            </div>
          )}
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
  showContextUsage?: boolean;
}

const VSCodeHeader: React.FC<VSCodeHeaderProps> = ({ title, showBack, onBack, onNewSession, showContextUsage }) => {
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
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="Back to sessions"
        >
          <RiArrowLeftLine className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-sm font-medium truncate flex-1" title={title}>{title}</h1>
      {onNewSession && (
        <button
          onClick={onNewSession}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label="New session"
        >
          <RiAddLine className="h-5 w-5" />
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
