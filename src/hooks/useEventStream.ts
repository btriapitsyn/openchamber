import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import type { Part } from '@opencode-ai/sdk';

interface EventData {
  type: string;
  properties?: any;
}

// Debug tracking for assistant messages
const messageDebugData = new Map<string, {
  messageId: string;
  events: string[];
  role?: string;
  isInPending: boolean;
  streamingIdSet: boolean;
  partsReceived: number;
  startTime: number;
}>();

export const useEventStream = () => {
  const {
     addStreamingPart,
     completeStreamingMessage,
     updateMessageInfo,
     addPermission,
     clearPendingUserMessage,
     currentSessionId,
     pendingUserMessageIds
   } = useSessionStore();

  
  const { checkConnection } = useConfigStore();

  // Debug helper functions
  const trackMessage = (messageId: string, event: string, extraData?: any) => {
    if (!messageDebugData.has(messageId)) {
      messageDebugData.set(messageId, {
        messageId,
        events: [],
        isInPending: pendingUserMessageIds.has(messageId),
        streamingIdSet: false,
        partsReceived: 0,
        startTime: Date.now()
      });
    }

    const data = messageDebugData.get(messageId)!;
    data.events.push(event);

    if (extraData?.role) data.role = extraData.role;
    if (event === 'part') data.partsReceived++;
    if (event === 'streamingId_set') data.streamingIdSet = true;
    if (extraData?.timeCompleted) {
      (data as any).timeCompleted = extraData.timeCompleted;
    }
  };

  const reportMessage = (messageId: string) => {
    const data = messageDebugData.get(messageId);
    if (!data) return;

    console.log(`\n🎯 MESSAGE REPORT: ${messageId}`);
    console.log(`   Role: ${data.role || 'unknown'}`);
    console.log(`   In Pending: ${data.isInPending}`);
    console.log(`   StreamingID Set: ${data.streamingIdSet}`);
    console.log(`   Parts Received: ${data.partsReceived}`);
    console.log(`   Time Completed: ${(data as any).timeCompleted || 'not set'}`);
    console.log(`   Events: ${data.events.join(' → ')}`);
    console.log(`   Duration: ${Date.now() - data.startTime}ms\n`);

    messageDebugData.delete(messageId);
  };

  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);

  React.useEffect(() => {
    // Expose tracker to SessionStore
    (window as any).__messageTracker = trackMessage;

    const handleEvent = (event: EventData) => {
      if (!event.properties) return;


      switch (event.type) {
        case 'server.connected':
          checkConnection();
          break;

        case 'message.part.updated':
          if (currentSessionId) {
            const part = event.properties.part;
            // Check if the message info is provided and has a role
            // Handle both formats: { info: { role } } and { role }
            const messageInfo = event.properties.info || event.properties;


            if (part && part.sessionID === currentSessionId) {
               trackMessage(part.messageID, 'part_received', { role: messageInfo?.role });

               // Skip user message parts that we've already created locally
               if (part.messageID) {
                 const pendingUserMessages = useSessionStore.getState().pendingUserMessageIds;
                 if (pendingUserMessages.has(part.messageID)) {
                   trackMessage(part.messageID, 'skipped_pending');
                   return;
                 }
               }

               // Also skip if we have explicit role information saying it's a user message
              if (messageInfo && messageInfo.role === 'user') {
                trackMessage(part.messageID, 'skipped_user_role');
                return;
              }

              const messagePart: Part = {
                ...part,
                type: part.type || 'text'
              } as Part;

              // Pass role information along with the part
              const roleInfo = messageInfo ? messageInfo.role : 'assistant';
              trackMessage(part.messageID, 'addStreamingPart_called');
              addStreamingPart(currentSessionId, part.messageID, messagePart, roleInfo);
            }
          }
          break;

        case 'message.updated':
          if (currentSessionId) {
            // Handle both formats: { info: { role } } and { role }
            const message = event.properties.info || event.properties;

            if (message && message.sessionID === currentSessionId) {
               trackMessage(message.id, 'message_updated', { role: message.role });

               // Check if this is a pending user message - skip updates for them
               // The server may echo back with role='assistant' but we know it's a user message
               if (pendingUserMessageIds.has(message.id)) {
                 console.log('[EventStream] Skipping update for pending user message:', message.id);
                 clearPendingUserMessage(message.id);
                 return;
               }

               // Also skip if the server correctly identifies it as a user message
               if (message.role === 'user') {
                 clearPendingUserMessage(message.id);
                 return;
               }

               // Update the message info in the store to include agent and other metadata
              updateMessageInfo(currentSessionId, message.id, message);

              // Check if assistant message is completed - use multiple indicators
              const isCompleted = message.role === 'assistant' && (
                message.time?.completed ||
                message.status === 'completed' ||
                (message.time && !message.streaming)
              );

              if (isCompleted) {
                trackMessage(message.id, 'completed', { timeCompleted: message.time?.completed });
                reportMessage(message.id);
                // Delay clearing streamingMessageId to let animation complete
                setTimeout(() => {
                  completeStreamingMessage(currentSessionId, message.id);
                }, 2100); // Slightly longer than animation duration
              }
            }
          }
          break;



        case 'session.abort':
          if (currentSessionId && event.properties.sessionID === currentSessionId) {
            const { messageID } = event.properties;
            if (messageID) {
              completeStreamingMessage(currentSessionId, messageID);
            }
          }
          break;

        case 'session.error':
          // Could show a toast notification here
          break;

        case 'permission.updated':
          if (event.properties && currentSessionId === event.properties.sessionID) {
            addPermission(event.properties);
          }
          break;

        case 'permission.replied':
          // Permission is automatically removed from store in respondToPermission
          break;

        default:
          // Handle unknown events
          break;
      }
    };

    const handleError = (error: any) => {
      // Check if this is a connection error (404, network error, etc.)
      const eventSource = opencodeClient.getEventSource?.();
      if (eventSource && eventSource.readyState === EventSource.CLOSED) {
        console.error('EventSource connection failed - checking if server is available');
        checkConnection();
      }
      
      // Limit reconnection attempts to prevent infinite loops
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Exponential backoff for reconnection
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000);
        
        // Try to reconnect after a delay if EventSource closes
        reconnectTimeoutRef.current = setTimeout(() => {
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
          }
          unsubscribeRef.current = opencodeClient.subscribeToEvents(
            handleEvent,
            handleError,
            handleOpen
          );
        }, delay);
      } else {
        // Max reconnection attempts reached
      }
    };

    const handleOpen = () => {
      console.log('EventStream opened');
      // Reset reconnection attempts on successful connection
      reconnectAttemptsRef.current = 0;
      checkConnection();
    };

    // Subscribe to events
    unsubscribeRef.current = opencodeClient.subscribeToEvents(
      handleEvent,
      handleError,
      handleOpen
    );

    // Cleanup on unmount
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [
    currentSessionId,
    addStreamingPart,
    completeStreamingMessage,
    updateMessageInfo,
    addPermission,
    clearPendingUserMessage,
    checkConnection,
    pendingUserMessageIds
  ]);

  // Reconnect logic
  React.useEffect(() => {
    const reconnectInterval = setInterval(() => {
      checkConnection();
    }, 30000); // Check connection every 30 seconds

    return () => clearInterval(reconnectInterval);
  }, [checkConnection]);
};