import React from 'react';
import { useChatStore } from './stores/chatStore';
import { useNavigation } from './hooks/useNavigation';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

function ConnectionStatusBanner({ status, error, onRetry }: {
  status: ConnectionStatus;
  error?: string;
  onRetry: () => void;
}) {
  if (status === 'connected') return null;

  const messages: Record<ConnectionStatus, string> = {
    disconnected: 'Not connected to OpenCode API',
    connecting: 'Connecting...',
    connected: '',
    error: error || 'Connection error',
  };

  return (
    <div className={`flex items-center justify-center gap-2 px-4 py-2 text-sm border-b ${
      status === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
    }`}>
      {status === 'connecting' && (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      <span>{messages[status]}</span>
      {(status === 'disconnected' || status === 'error') && (
        <button onClick={onRetry} className="px-2 py-0.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90">
          Retry
        </button>
      )}
    </div>
  );
}

function SessionsList() {
  const { sessions, currentSessionId, selectSession, createSession, isLoadingSessions } = useChatStore();
  const { goToChat } = useNavigation();
  const [isCreating, setIsCreating] = React.useState(false);

  const handleSelectSession = async (sessionId: string) => {
    await selectSession(sessionId);
    goToChat();
  };

  const handleNewSession = async () => {
    setIsCreating(true);
    const sessionId = await createSession();
    setIsCreating(false);
    if (sessionId) {
      goToChat();
    }
  };

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
    if (diffDays === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h1 className="text-sm font-medium">Sessions</h1>
        <button
          onClick={handleNewSession}
          disabled={isCreating}
          className="p-1.5 rounded hover:bg-muted disabled:opacity-50"
        >
          {isCreating ? (
            <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" /></svg>
          )}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoadingSessions ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center">
            <div className="text-muted-foreground text-sm mb-4">No sessions yet</div>
            <button
              onClick={handleNewSession}
              disabled={isCreating}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
            >
              {isCreating ? 'Creating...' : 'Start New Chat'}
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session.id)}
                className={`w-full text-left px-3 py-2.5 hover:bg-muted/50 transition-colors ${
                  session.id === currentSessionId ? 'bg-primary/10 border-l-2 border-primary' : ''
                }`}
              >
                <div className="text-sm font-medium truncate">{session.title || 'New Session'}</div>
                <div className="text-xs text-muted-foreground">{formatTime(session.time?.created)}</div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPanel() {
  const { currentSessionId, sessions, messages, sendMessage, abortMessage, isSending, streamingSessionId } = useChatStore();
  const { goToSessions } = useNavigation();
  const [input, setInput] = React.useState('');
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const sessionMessages = currentSessionId ? messages.get(currentSessionId) || [] : [];
  const isStreaming = streamingSessionId === currentSessionId;

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages.length]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const text = input.trim();
    setInput('');
    await sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <button onClick={goToSessions} className="p-1 rounded hover:bg-muted">
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <h1 className="text-sm font-medium truncate flex-1">{currentSession?.title || 'New Chat'}</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {sessionMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Start a conversation
          </div>
        ) : (
          <div className="space-y-3">
            {sessionMessages.map((msg, idx) => (
              <MessageBubble key={msg.info.id || idx} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2 text-sm">
                  <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            rows={1}
            disabled={isSending}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            style={{ minHeight: 40, maxHeight: 120 }}
          />
          {isStreaming ? (
            <button onClick={abortMessage} className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90">
              <svg width="16" height="16" viewBox="0 0 16 16"><rect x="3" y="3" width="10" height="10" rx="1" fill="currentColor"/></svg>
            </button>
          ) : (
            <button onClick={handleSend} disabled={!input.trim() || isSending} className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M2 8l12-6-3.5 6 3.5 6L2 8z" fill="currentColor"/></svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: { info: { role: string }; parts: Array<{ type: string; text?: string }> } }) {
  const isUser = message.info.role === 'user';
  const text = message.parts.filter((p) => p.type === 'text').map((p) => p.text).join('\n');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-muted'
      }`}>
        <div className="whitespace-pre-wrap break-words">{text || '...'}</div>
      </div>
    </div>
  );
}

export function VSCodeApp() {
  const { initialize, isConnected } = useChatStore();
  const { currentView } = useNavigation();
  const [status, setStatus] = React.useState<ConnectionStatus>('connecting');
  const [error, setError] = React.useState<string>();

  const connect = React.useCallback(async () => {
    setStatus('connecting');
    setError(undefined);
    try {
      await initialize();
      setStatus('connected');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');
    }
  }, [initialize]);

  React.useEffect(() => {
    connect();
  }, [connect]);

  React.useEffect(() => {
    if (isConnected) setStatus('connected');
  }, [isConnected]);

  // Listen for extension messages
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === 'connectionStatus') {
        if (msg.status === 'connected') setStatus('connected');
        else if (msg.status === 'error') {
          setStatus('error');
          setError(msg.error);
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      <ConnectionStatusBanner status={status} error={error} onRetry={connect} />
      <div className="flex-1 min-h-0">
        {currentView === 'sessions' ? <SessionsList /> : <ChatPanel />}
      </div>
    </div>
  );
}

export default VSCodeApp;
