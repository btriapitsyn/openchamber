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
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-4">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-muted flex items-center justify-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">Welcome to OpenCode</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Select a session from the sidebar or create a new one to start chatting.
              </p>
            </div>
          </div>
        </div>
        <div className="border-t dark:border-white/[0.05] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <ChatInput />
        </div>
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
      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        {sessionMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center space-y-4 px-4">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center">
                <MessageSquare className="h-8 w-8 text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold">Start a New Conversation</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Ask me anything! I'm here to help with coding, analysis, and more.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="pb-6">
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
      <div className="border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ChatInput />
      </div>
    </div>
  );
};