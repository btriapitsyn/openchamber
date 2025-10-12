import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import type { Part, Session } from '@opencode-ai/sdk';

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
     clearPendingUserMessage,
     currentSessionId,
     pendingUserMessageIds,
     applySessionMetadata
   } = useSessionStore();

  
  const { checkConnection } = useConfigStore();

  const trackMessage = (_messageId: string, _event?: string, _extraData?: any) => {};
  const reportMessage = (_messageId: string) => {};

  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);
  const emptyResponseToastShownRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    // Expose tracker to SessionStore
    (window as any).__messageTracker = trackMessage;

    const handleEvent = (event: EventData) => {
      if (!event.properties) return;

      const nonMetadataSessionEvents = new Set(['session.abort', 'session.error']);

      if (!nonMetadataSessionEvents.has(event.type)) {
        const sessionPayload = event.properties.session ?? event.properties.sessionInfo ?? null;
        const sessionIdCandidates: (string | undefined)[] = [
          sessionPayload?.id,
          sessionPayload?.sessionID,
          event.properties.sessionID,
          event.properties.id,
        ];
        const sessionId = sessionIdCandidates.find((value) => typeof value === 'string' && value.length > 0);

        const titleCandidate =
          typeof sessionPayload?.title === 'string'
            ? sessionPayload.title
            : typeof event.properties.title === 'string'
              ? event.properties.title
              : undefined;

        const isSessionScopedEvent = event.type.startsWith('session.') || Boolean(sessionPayload);

        if (isSessionScopedEvent && sessionId && titleCandidate !== undefined) {
          const patch: Partial<Session> = {};
          patch.title = titleCandidate;
          applySessionMetadata(sessionId, patch);
        }
      }


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

               const serverParts = event.properties.parts || (message as any).parts;
               if (Array.isArray(serverParts) && serverParts.length > 0 && message.role !== 'user') {
                 const storeState = useSessionStore.getState();
                 const existingMessages = storeState.messages.get(currentSessionId) || [];
                 const existingMessage = existingMessages.find((m) => m.info.id === message.id);
                 const needsInjection = !existingMessage || existingMessage.parts.length === 0;

                 trackMessage(message.id, needsInjection ? 'server_parts_injected' : 'server_parts_refreshed', { count: serverParts.length });

                 serverParts.forEach((serverPart: Part, index: number) => {
                   const enrichedPart: Part = {
                     ...serverPart,
                     type: serverPart?.type || 'text',
                     sessionID: serverPart?.sessionID || currentSessionId,
                     messageID: serverPart?.messageID || message.id,
                   } as Part;
                   addStreamingPart(currentSessionId, message.id, enrichedPart, message.role);
                   trackMessage(message.id, `server_part_${index}`);
                 });
               }

               // Check if assistant message is completed - use multiple indicators
               const isCompleted = message.role === 'assistant' && (

                message.time?.completed ||
                message.status === 'completed' ||
                (message.time && !message.streaming)
              );

              if (isCompleted) {
                trackMessage(message.id, 'completed', { timeCompleted: message.time?.completed });
                reportMessage(message.id);

                // Check if response is empty before completing
                const storeState = useSessionStore.getState();
                const sessionMessages = storeState.messages.get(currentSessionId) || [];
                const completedMessage = sessionMessages.find(m => m.info.id === message.id);

                if (completedMessage) {
                  const parts = completedMessage.parts || [];
                  const hasTextContent = parts.some((p: any) =>
                    p.type === 'text' && p.text && p.text.trim().length > 0
                  );
                  const hasTools = parts.some((p: any) => p.type === 'tool');
                  const hasStepMarkers = parts.some((p: any) =>
                    p.type === 'step-start' || p.type === 'step-finish'
                  );

                  // Detect empty response patterns:
                  // 1. No parts at all
                  // 2. Has parts but no text/tools
                  // 3. Only step markers without actual content (Claude issue)
                  const isEmptyResponse = parts.length === 0 ||
                    (!hasTextContent && !hasTools) ||
                    (hasStepMarkers && !hasTextContent && !hasTools);

                  if (isEmptyResponse) {
                    // Show toast only once per message
                    if (!emptyResponseToastShownRef.current.has(message.id)) {
                      emptyResponseToastShownRef.current.add(message.id);

                      import('sonner').then(({ toast }) => {
                        toast.info('Assistant response was empty', {
                          description: 'Try sending your message again or rephrase it.',
                          duration: 5000,
                        });
                      });
                    }
                  }
                }

                // Complete streaming immediately - animation will start after
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
      // SDK handles reconnection automatically with exponential backoff
      checkConnection();

      // Limit reconnection attempts to prevent infinite loops
      if (reconnectAttemptsRef.current < 5) {
        reconnectAttemptsRef.current++;

        // Clear any existing reconnect timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
        }

        // Exponential backoff for reconnection (in case SDK fails)
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 10000);

        // Try to reconnect after a delay
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
