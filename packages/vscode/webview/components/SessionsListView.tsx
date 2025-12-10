import React from 'react';
import { useSessionStore } from '@openchamber/ui/stores/useSessionStore';
import { useNavigation } from '../hooks/useNavigation';
import { VSCodeHeader } from './VSCodeHeader';
import { SessionItem } from './SessionItem';

export function SessionsListView() {
  const { sessions, currentSessionId, setCurrentSession, createSession, streamingMessageIds } = useSessionStore();
  const { goToChat } = useNavigation();
  const [isCreating, setIsCreating] = React.useState(false);

  const sortedSessions = React.useMemo(() => {
    return [...sessions].sort((a, b) => (b.time?.created || 0) - (a.time?.created || 0));
  }, [sessions]);

  const handleSelectSession = async (sessionId: string) => {
    await setCurrentSession(sessionId);
    goToChat();
  };

  const handleNewSession = async () => {
    if (isCreating) return;
    setIsCreating(true);
    try {
      await createSession();
      goToChat();
    } catch (error) {
      console.error('Failed to create session:', error);
    } finally {
      setIsCreating(false);
    }
  };

  const newButton = (
    <button
      onClick={handleNewSession}
      disabled={isCreating}
      className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-50"
      aria-label="New session"
    >
      {isCreating ? (
        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="flex flex-col h-full">
      <VSCodeHeader title="Sessions" actions={newButton} />

      <div className="flex-1 overflow-y-auto">
        {sortedSessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-muted-foreground text-sm mb-4">No sessions yet</div>
            <button
              onClick={handleNewSession}
              disabled={isCreating}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Start New Chat'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sortedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={session.id === currentSessionId}
                isStreaming={streamingMessageIds.has(session.id)}
                onClick={() => handleSelectSession(session.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
