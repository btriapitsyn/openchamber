import React from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ModelControls } from './ModelControls';
import { useSessionStore } from '@/stores/useSessionStore';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { OpenCodeLogo } from '@/components/ui/OpenCodeLogo';

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
          <div className="text-center space-y-6 px-4 w-full">
            <div className="flex justify-center">
              <OpenCodeLogo width={300} height={52} className="text-muted-foreground" />
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden" ref={scrollRef}>
        {sessionMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[400px]">
            <div className="text-center space-y-6 px-4 w-full">
              <div className="flex justify-center">
                <OpenCodeLogo width={300} height={52} className="opacity-80" />
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
          <div className="pb-6 max-w-5xl mx-auto">
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
        <ModelControls />
        <ChatInput />
      </div>
    </div>
  );
};