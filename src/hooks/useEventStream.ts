import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import type { Part } from '@opencode-ai/sdk';

interface EventData {
  type: string;
  properties?: any;
}

export const useEventStream = () => {
  const {
    addStreamingPart,
    completeStreamingMessage,
    updateMessageInfo,
    addPermission,
    currentSessionId
  } = useSessionStore();
  
  const { checkConnection } = useConfigStore();
  
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);

  React.useEffect(() => {
    const handleEvent = (event: EventData) => {
      if (!event.properties) return;

      switch (event.type) {
        case 'server.connected':
          console.log('Server connected');
          checkConnection();
          break;

        case 'message.part.updated':
          if (currentSessionId) {
            const part = event.properties.part;
            // Check if the message info is provided and has a role
            const messageInfo = event.properties.info;
            
            if (part && part.sessionID === currentSessionId) {
              // Skip user message parts - we already show them locally
              if (messageInfo && messageInfo.role === 'user') {
                return;
              }
              
              const messagePart: Part = {
                ...part,
                type: part.type || 'text'
              } as Part;
              
              // Only add parts for assistant messages
              addStreamingPart(currentSessionId, part.messageID, messagePart);
            }
          }
          break;

        case 'message.updated':
          if (currentSessionId) {
            // The message info is directly in properties.info
            const message = event.properties.info || event.properties;
            if (message && message.sessionID === currentSessionId) {
              // Skip user message updates - we already have them locally
              if (message.role === 'user') {
                return;
              }

              // Update the message info in the store to include agent and other metadata
              updateMessageInfo(currentSessionId, message.id, message);

              // Check if assistant message is completed
              if (message.role === 'assistant' && message.time?.completed) {
                completeStreamingMessage(currentSessionId, message.id);
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
          console.error('Session error:', event.properties);
          // Could show a toast notification here
          break;

        case 'permission.updated':
          console.log('Permission request:', event.properties);
          if (event.properties && currentSessionId === event.properties.sessionID) {
            addPermission(event.properties);
          }
          break;

        case 'permission.replied':
          console.log('Permission replied:', event.properties);
          // Permission is automatically removed from store in respondToPermission
          break;

        default:
          // Log unknown events to see what we're missing
          if (event.type && !event.type.startsWith('lsp.')) {
            console.log('Unhandled event type:', event.type, event.properties);
          }
          break;
      }
    };

    const handleError = (error: any) => {
      console.error('EventStream error:', error);
      checkConnection();
      
      // Limit reconnection attempts to prevent infinite loops
      if (reconnectAttemptsRef.current < 3) {
        reconnectAttemptsRef.current++;
        
        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }
        
        // Try to reconnect after a short delay if EventSource closes
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Attempting to reconnect EventSource... (attempt ${reconnectAttemptsRef.current})`);
          if (unsubscribeRef.current) {
            unsubscribeRef.current();
          }
          unsubscribeRef.current = opencodeClient.subscribeToEvents(
            handleEvent,
            handleError,
            handleOpen
          );
        }, 1000);
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
    addPermission,
    checkConnection
  ]);

  // Reconnect logic
  React.useEffect(() => {
    const reconnectInterval = setInterval(() => {
      checkConnection();
    }, 30000); // Check connection every 30 seconds

    return () => clearInterval(reconnectInterval);
  }, [checkConnection]);
};