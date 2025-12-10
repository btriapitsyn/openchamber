import React from 'react';
import { useSessionStore } from '@openchamber/ui/stores/useSessionStore';
import { useNavigation } from '../hooks/useNavigation';
import { VSCodeHeader } from './VSCodeHeader';
import { SimpleMessageRenderer } from './SimpleMessageRenderer';

export function ChatPanel() {
  const { goToSessions } = useNavigation();
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const currentSessionId = useSessionStore((s) => s.currentSessionId);
  const messages = useSessionStore((s) => s.messages);
  const sessions = useSessionStore((s) => s.sessions);
  const sendMessage = useSessionStore((s) => s.sendMessage);
  const abortCurrentOperation = useSessionStore((s) => s.abortCurrentOperation);
  const streamingMessageIds = useSessionStore((s) => s.streamingMessageIds);

  const [inputValue, setInputValue] = React.useState('');
  const [isSending, setIsSending] = React.useState(false);

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const sessionTitle = currentSession?.title || 'New Chat';
  const sessionMessages = currentSessionId ? messages.get(currentSessionId) || [] : [];
  const isStreaming = currentSessionId ? streamingMessageIds.has(currentSessionId) : false;

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages.length]);

  const handleSend = async () => {
    if (!inputValue.trim() || !currentSessionId || isSending) return;

    const messageText = inputValue.trim();
    setInputValue('');
    setIsSending(true);

    try {
      await sendMessage(messageText);
    } catch (error) {
      console.error('Failed to send message:', error);
      setInputValue(messageText); // Restore input on error
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAbort = () => {
    if (currentSessionId) {
      abortCurrentOperation(currentSessionId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <VSCodeHeader
        title={sessionTitle}
        showBack
        onBack={goToSessions}
      />

      {/* Messages */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-3 py-2"
      >
        {sessionMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-muted-foreground text-sm">
              Start a conversation
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {sessionMessages.map((msg) => (
              <SimpleMessageRenderer key={msg.info.id} message={msg} />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-3 bg-background">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={isSending}
            rows={1}
            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
            style={{ minHeight: '40px', maxHeight: '120px' }}
          />
          {isStreaming ? (
            <button
              onClick={handleAbort}
              className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
              aria-label="Stop"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isSending}
              className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1 8l14-7-4 7 4 7L1 8z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
