import React from 'react';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { ModelControls } from './ModelControls';
import { PermissionRequest } from './PermissionRequest';
import { useSessionStore } from '@/stores/useSessionStore';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare } from 'lucide-react';
import { OpenCodeLogo } from '@/components/ui/OpenCodeLogo';

export const ChatContainer: React.FC = () => {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { 
    currentSessionId, 
    messages, 
    permissions,
    streamingMessageId,
    isLoading,
    loadMessages
  } = useSessionStore();

  const sessionMessages = currentSessionId ? messages.get(currentSessionId) || [] : [];
  const sessionPermissions = currentSessionId ? permissions.get(currentSessionId) || [] : [];

  // Track if user is at bottom for smart auto-scroll
  const [isAtBottom, setIsAtBottom] = React.useState(true);
  const lastMessageCountRef = React.useRef(sessionMessages.length);
  
  // Check if user is at bottom of scroll container
  const checkIsAtBottom = () => {
    if (!scrollRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    return scrollTop + clientHeight >= scrollHeight - 10; // 10px threshold
  };
  
  // Handle scroll events to track position
  const handleScroll = () => {
    setIsAtBottom(checkIsAtBottom());
  };
  
  // Auto-scroll to bottom only if user was already at bottom
  React.useEffect(() => {
    // Check if user just sent a message (new user message appeared)
    if (sessionMessages.length > lastMessageCountRef.current) {
      const newMessage = sessionMessages[sessionMessages.length - 1];
      if (newMessage?.info?.role === 'user') {
        // User just sent a message - reset auto-scroll
        setIsAtBottom(true);
      }
    }
    lastMessageCountRef.current = sessionMessages.length;
    
    // Perform the scroll if at bottom
    if (scrollRef.current && isAtBottom) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [sessionMessages, isAtBottom]);
  
  // Set up scroll listener and reset position on session change
  React.useEffect(() => {
    const scrollElement = scrollRef.current;
    if (scrollElement) {
      scrollElement.addEventListener('scroll', handleScroll);
      // Reset to bottom when session changes
      setIsAtBottom(true);
      return () => scrollElement.removeEventListener('scroll', handleScroll);
    }
  }, [currentSessionId]);
  
  // Load messages when session is restored from localStorage
  React.useEffect(() => {
    if (currentSessionId && (!messages.has(currentSessionId) || messages.get(currentSessionId)?.length === 0)) {
      loadMessages(currentSessionId);
    }
  }, [currentSessionId, messages, loadMessages]);

  if (!currentSessionId) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 px-4 w-full">
            <div className="flex justify-center">
              <OpenCodeLogo width={300} height={52} className="text-muted-foreground" />
            </div>
            <p className="text-base text-muted-foreground/70">
              Start by creating a new session
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Only show loading skeletons if we're loading an existing session with messages
  // For new sessions, we know there are no messages, so skip the loading state
  if (isLoading && sessionMessages.length === 0 && !streamingMessageId) {
    // Check if this is likely a new session by checking if messages Map has an entry
    const hasMessagesEntry = messages.has(currentSessionId);
    if (!hasMessagesEntry) {
      // This is likely the initial load of an existing session
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
              <h3 className="text-xl font-semibold text-muted-foreground/60">Start a New Conversation</h3>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto pb-4">
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
      
      {/* Permission Requests */}
      {sessionPermissions.length > 0 && (
        <div className="px-4 py-2 space-y-2 max-w-5xl mx-auto">
          {sessionPermissions.map(permission => (
            <PermissionRequest 
              key={permission.id} 
              permission={permission}
            />
          ))}
        </div>
      )}
      
      <div className="relative border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <ModelControls />
        <ChatInput />
      </div>
    </div>
  );
};