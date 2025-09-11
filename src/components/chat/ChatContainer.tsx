import React from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { useSessionStore } from '@/stores/useSessionStore';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';

export const ChatContainer: React.FC = () => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { 
    currentSessionId, 
    messages, 
    streamingMessageId,
    isLoading 
  } = useSessionStore();

  const sessionMessages = currentSessionId ? messages.get(currentSessionId) || [] : [];

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionMessages]);

  if (!currentSessionId) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center bg-background">
          <div className="text-center space-y-4">
            <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-semibold">No Session Selected</h2>
            <p className="text-muted-foreground max-w-md">
              Select an existing session from the sidebar or create a new one to start chatting.
            </p>
          </div>
        </div>
        <ChatInput />
      </div>
    );
  }

  if (isLoading && sessionMessages.length === 0) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 overflow-y-auto p-4 bg-background">
          <div className="space-y-4 max-w-4xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 p-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <ChatInput />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto bg-background" ref={scrollRef}>
        <div className="max-w-4xl mx-auto">
          {sessionMessages.length === 0 ? (
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <div className="text-center space-y-4">
                <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
                <h3 className="text-lg font-medium">Start a Conversation</h3>
                <p className="text-muted-foreground max-w-md">
                  Type a message below to begin chatting with the AI assistant.
                </p>
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {sessionMessages.map((message: any, index: number) => (
                <ChatMessage
                  key={`${message.info.id}-${index}`}
                  message={message}
                  isStreaming={message.info.id === streamingMessageId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
      <ChatInput />
    </div>
  );
};