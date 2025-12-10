import React from 'react';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { ChatView } from '@/components/views';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { ContextUsageDisplay } from '@/components/ui/ContextUsageDisplay';
import { RiAddLine, RiArrowLeftLine } from '@remixicon/react';

type VSCodeView = 'sessions' | 'chat';

export const VSCodeLayout: React.FC = () => {
  const [currentView, setCurrentView] = React.useState<VSCodeView>('sessions');
  const currentSessionId = useSessionStore((state) => state.currentSessionId);
  const sessions = useSessionStore((state) => state.sessions);
  const createSession = useSessionStore((state) => state.createSession);

  // Navigate to chat when a session is selected
  React.useEffect(() => {
    if (currentSessionId) {
      setCurrentView('chat');
    }
  }, [currentSessionId]);

  const handleBackToSessions = React.useCallback(() => {
    setCurrentView('sessions');
  }, []);

  const handleNewSession = React.useCallback(async () => {
    const result = await createSession();
    if (result?.id) {
      setCurrentView('chat');
    }
  }, [createSession]);

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
