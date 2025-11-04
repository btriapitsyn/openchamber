import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import type { Part, Session, Message, Permission } from '@opencode-ai/sdk';

interface EventData {
  type: string;
  properties?: Record<string, unknown>;
}

export const useEventStream = () => {
  const {
    addStreamingPart,
    completeStreamingMessage,
    updateMessageInfo,
    updateSessionCompaction,
    addPermission,
    clearPendingUserMessage,
    currentSessionId,
    pendingUserMessageIds,
    applySessionMetadata
  } = useSessionStore();



  
  const { checkConnection } = useConfigStore();

  // Placeholder functions for message tracking
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const trackMessage = (_messageId: string, _event?: string, _extraData?: Record<string, unknown>) => {};
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const reportMessage = (_messageId: string) => {};

  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);
  const emptyResponseToastShownRef = React.useRef<Set<string>>(new Set());
  const metadataRefreshTimestampsRef = React.useRef<Map<string, number>>(new Map());

  const requestSessionMetadataRefresh = React.useCallback(
    (sessionId: string | undefined | null) => {
      if (!sessionId) {
        return;
      }

      const now = Date.now();
      const timestamps = metadataRefreshTimestampsRef.current;
      const lastRefresh = timestamps.get(sessionId);

      // Avoid spamming the API if multiple completion events arrive back-to-back
      if (lastRefresh && now - lastRefresh < 3000) {
        return;
      }

      timestamps.set(sessionId, now);

      void (async () => {
        try {
          const session = await opencodeClient.getSession(sessionId);
          if (session && typeof session.title === 'string' && session.title.length > 0) {
            applySessionMetadata(sessionId, { title: session.title });
          }
        } catch (error) {
          console.warn('Failed to refresh session metadata:', error);
        }
      })();
    },
    [applySessionMetadata]
  );

  React.useEffect(() => {
    // Expose tracker to SessionStore
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__messageTracker = trackMessage;

    const handleEvent = (event: EventData) => {
      if (!event.properties) return;

      const nonMetadataSessionEvents = new Set(['session.abort', 'session.error']);

      if (!nonMetadataSessionEvents.has(event.type)) {
        const props = event.properties as any;
        const sessionPayload = props.session ?? props.sessionInfo ?? null;
        const sessionIdCandidates: (string | undefined)[] = [
          sessionPayload?.id,
          sessionPayload?.sessionID,
          props.sessionID,
          props.id,
        ];
        const sessionId = sessionIdCandidates.find((value) => typeof value === 'string' && value.length > 0);

        const titleCandidate =
          typeof sessionPayload?.title === 'string'
            ? sessionPayload.title
            : typeof props.title === 'string'
              ? props.title
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
            const props = event.properties as any;
            const part = props.part;
            // Check if the message info is provided and has a role
            // Handle both formats: { info: { role } } and { role }
            const messageInfo = props.info || props;


            if (part && part.sessionID === currentSessionId) {
               trackMessage(part.messageID as string, 'part_received', { role: messageInfo?.role });

               // Skip user message parts that we've already created locally
               if (part.messageID) {
                 const pendingUserMessages = useSessionStore.getState().pendingUserMessageIds;
                 if (pendingUserMessages.has(part.messageID as string)) {
                   trackMessage(part.messageID as string, 'skipped_pending');
                   return;
                 }
               }

               // Also skip if we have explicit role information saying it's a user message
              if (messageInfo && messageInfo.role === 'user') {
                trackMessage(part.messageID as string, 'skipped_user_role');
                return;
              }

              const messagePart: Part = {
                ...part,
                type: part.type || 'text'
              } as Part;

              // Pass role information along with the part
              const roleInfo = messageInfo ? messageInfo.role : 'assistant';
              trackMessage(part.messageID as string, 'addStreamingPart_called');
              addStreamingPart(currentSessionId, part.messageID as string, messagePart, roleInfo);
            }
          }
          break;

        case 'message.updated':
          if (currentSessionId) {
            // Handle both formats: { info: { role } } and { role }
            const props = event.properties as any;
            const message = props.info || props;

            if (message && message.sessionID === currentSessionId) {
               trackMessage(message.id as string, 'message_updated', { role: message.role });

               // Check if this is a pending user message - skip updates for them
               // The server may echo back with role='assistant' but we know it's a user message
               if (pendingUserMessageIds.has(message.id as string)) {
                 clearPendingUserMessage(message.id as string);
                 return;
               }

               // Also skip if the server correctly identifies it as a user message
               if (message.role === 'user') {
                 clearPendingUserMessage(message.id as string);
                 return;
               }

               // Update the message info in the store to include agent and other metadata
               updateMessageInfo(currentSessionId, message.id as string, message as unknown as Message);

               const serverParts = props.parts || message.parts;
               if (Array.isArray(serverParts) && serverParts.length > 0 && message.role !== 'user') {
                 const storeState = useSessionStore.getState();
                 const existingMessages = storeState.messages.get(currentSessionId) || [];
                 const existingMessage = existingMessages.find((m) => m.info.id === message.id as string);
                 const needsInjection = !existingMessage || existingMessage.parts.length === 0;

                 trackMessage(message.id as string, needsInjection ? 'server_parts_injected' : 'server_parts_refreshed', { count: serverParts.length as number });

                 serverParts.forEach((serverPart: Part, index: number) => {
                   const enrichedPart: Part = {
                     ...serverPart,
                     type: serverPart?.type || 'text',
                     sessionID: serverPart?.sessionID || currentSessionId,
                     messageID: serverPart?.messageID || message.id,
                   } as Part;
                   addStreamingPart(currentSessionId, message.id as string, enrichedPart, message.role as string);
                   trackMessage(message.id as string, `server_part_${index}`);
                 });
               }

                // Check if assistant message is completed - use TUI logic:
                // Only complete when time.completed is set, not just streaming flag
                // Also ensure we're completing the lexicographically latest message
                const messageTime = message.time as { completed?: number } | undefined;
                const isCompleted = message.role === 'assistant' && (
                 messageTime?.completed ||
                 message.status === 'completed'
               );

                // Additional check: only complete if this is the latest assistant message
                if (isCompleted && message.role === 'assistant') {
                  const storeState = useSessionStore.getState();
                  const sessionMessages = storeState.messages.get(currentSessionId) || [];
                  const assistantMessages = sessionMessages
                    .filter(msg => msg.info.role === 'assistant')
                    .sort((a, b) => (a.info.id || "").localeCompare(b.info.id || ""));
                  
                  const latestAssistantMessageId = assistantMessages.length > 0 
                    ? assistantMessages[assistantMessages.length - 1].info.id 
                    : null;
                  
                  // Don't complete if this isn't the latest assistant message
                  if (message.id !== latestAssistantMessageId) {
                    return;
                  }
                }

              if (isCompleted) {
                const timeCompleted = messageTime?.completed ?? Date.now();

                if (!messageTime?.completed) {
                  updateMessageInfo(currentSessionId, message.id as string, {
                    ...message,
                    time: {
                      ...(messageTime ?? {}),
                      completed: timeCompleted,
                    },
                  } as unknown as Message);
                }

                trackMessage(message.id as string, 'completed', { timeCompleted });
                reportMessage(message.id as string);

                // Check if response is empty before completing
                const storeState = useSessionStore.getState();
                const sessionMessages = storeState.messages.get(currentSessionId) || [];
                const completedMessage = sessionMessages.find(m => m.info.id === message.id as string);

                if (completedMessage) {
                  const storedParts = Array.isArray(completedMessage.parts) ? completedMessage.parts : [];
                  const eventParts = Array.isArray(serverParts) ? serverParts : [];

                  // Combine store parts with any parts shipped on this event to avoid race conditions
                  const combinedParts: Part[] = [...storedParts];
                  eventParts.forEach((rawPart: Record<string, unknown>) => {
                    if (!rawPart) return;
                    const normalized: Part = {
                      ...rawPart,
                      type: (rawPart.type as string) || 'text',
                    } as Part;
                    const alreadyPresent = combinedParts.some(
                      (existing) =>
                        existing.id === normalized.id &&
                        existing.type === normalized.type &&
                        (existing as Record<string, unknown>).callID === (normalized as Record<string, unknown>).callID
                    );
                    if (!alreadyPresent) {
                      combinedParts.push(normalized);
                    }
                  });

                  const hasStepMarkers = combinedParts.some(
                    (part) => part && (part.type === 'step-start' || part.type === 'step-finish')
                  );
                  const meaningfulParts = combinedParts.filter(
                    (part) => part && part.type !== 'step-start' && part.type !== 'step-finish'
                  );

                  const hasTextContent = meaningfulParts.some(
                    (part: Part) => part.type === 'text' && typeof (part as Record<string, unknown>).text === 'string' && ((part as Record<string, unknown>).text as string).trim().length > 0
                  );
                  const hasTools = meaningfulParts.some((part: Part) => part.type === 'tool');
                  const hasReasoning = meaningfulParts.some((part: Part) => part.type === 'reasoning');
                  const hasFiles = meaningfulParts.some((part: Part) => part.type === 'file');

                  const hasMeaningfulContent = hasTextContent || hasTools || hasReasoning || hasFiles;
                  // Detect empty response patterns only when we have no meaningful content
                  const isEmptyResponse = !hasMeaningfulContent && !hasStepMarkers;

                  if (isEmptyResponse) {
                    // Show toast only once per message
                    if (!emptyResponseToastShownRef.current.has(message.id as string)) {
                      emptyResponseToastShownRef.current.add(message.id as string);

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
                completeStreamingMessage(currentSessionId, message.id as string);

                // Refresh session metadata so auto-titled sessions update without a reload
                requestSessionMetadataRefresh(message.sessionID as string | undefined);
              }
            }
          }
          break;

        case 'session.updated': {
          const props = event.properties as any;
          const candidate = props?.info || props?.sessionInfo || props?.session || props;

          const sessionIdCandidates: (string | undefined)[] = [
            candidate?.id,
            candidate?.sessionID,
            props?.sessionID,
            props?.id,
          ];
          const sessionId = sessionIdCandidates.find((value) => typeof value === 'string' && value.length > 0);

          if (sessionId) {
            const timeSource = candidate?.time || props?.time;
            const compactingTimestamp = typeof timeSource?.compacting === 'number' ? timeSource.compacting : null;
            updateSessionCompaction(sessionId, compactingTimestamp);
          }
          break;
        }

        case 'session.abort':

          if (currentSessionId) {
            const props = event.properties as any;
            if (props.sessionID === currentSessionId) {
              const messageID = props.messageID;
              if (messageID) {
                completeStreamingMessage(currentSessionId, messageID as string);
              }
            }
          }
          break;

        case 'session.error':
          // Could show a toast notification here
          break;

        case 'permission.updated':
          if (event.properties) {
            const props = event.properties as any;
            if (currentSessionId === props.sessionID) {
              addPermission(props as any);
            }
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

    const handleError = () => {
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
    pendingUserMessageIds,
    requestSessionMetadataRefresh,
    updateSessionCompaction,
    applySessionMetadata
  ]);

  // Reconnect logic
  React.useEffect(() => {
    const reconnectInterval = setInterval(() => {
      checkConnection();
    }, 30000); // Check connection every 30 seconds

    return () => clearInterval(reconnectInterval);
  }, [checkConnection]);
};
