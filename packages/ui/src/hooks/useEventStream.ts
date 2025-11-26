import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { saveSessionCursor } from '@/lib/messageCursorPersistence';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore, type EventStreamStatus } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import type { Part, Session, Message, Permission } from '@opencode-ai/sdk';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';

interface EventData {
  type: string;
  properties?: Record<string, unknown>;
}

type MessageTracker = (messageId: string, event?: string, extraData?: Record<string, unknown>) => void;
type MessageReporter = (messageId: string) => void;

interface DesktopEventsBridge {
  subscribe?: (
    onMessage: (event: EventData) => void,
    onError?: (error: unknown) => void,
    onOpen?: () => void,
    onMessageComplete?: (messageId: string) => void,
    onSessionActivity?: (payload: Record<string, unknown> | null) => void
  ) => () => void;
  setDirectory?: (directory: string | undefined | null) => void;
}

declare global {
  interface Window {
    __messageTracker?: MessageTracker;
    opencodeDesktopEvents?: DesktopEventsBridge;
  }
}

const ENABLE_EMPTY_RESPONSE_DETECTION = false; // TODO: Re-enable once false positive investigation completes
const TEXT_SHRINK_TOLERANCE = 50; // chars
const computeTextLength = (parts: Part[] | undefined | null): number => {
  if (!parts || !Array.isArray(parts)) return 0;
  return parts
    .filter((p) => p?.type === 'text')
    .reduce((sum, p) => {
      const partWithText = p as { text?: string; content?: string };
      const text = partWithText.text ?? partWithText.content;
      return sum + (typeof text === 'string' ? text.length : 0);
    }, 0);
};

export const useEventStream = () => {
  const {
    addStreamingPart,
    completeStreamingMessage,
    updateMessageInfo,
    updateSessionCompaction,
    addPermission,
    currentSessionId,
    applySessionMetadata,
    sessions,
    getWorktreeMetadata,
    loadMessages,
    loadSessions
  } = useSessionStore();



  
  const { checkConnection } = useConfigStore();
  const fallbackDirectory = useDirectoryStore((state) => state.currentDirectory);

  const activeSessionDirectory = React.useMemo(() => {
    if (!currentSessionId) {
      return undefined;
    }

    try {
      const metadata = getWorktreeMetadata?.(currentSessionId);
      if (metadata?.path) {
        return metadata.path;
      }
    } catch (error) {
      console.warn('Failed to inspect worktree metadata for session directory:', error);
    }

    const sessionRecord = sessions.find((entry) => entry.id === currentSessionId);
    if (sessionRecord && typeof sessionRecord.directory === 'string' && sessionRecord.directory.trim().length > 0) {
      return sessionRecord.directory.trim();
    }

    return undefined;
  }, [currentSessionId, getWorktreeMetadata, sessions]);

  const effectiveDirectory = React.useMemo(() => {
    if (activeSessionDirectory && activeSessionDirectory.length > 0) {
      return activeSessionDirectory;
    }
    if (typeof fallbackDirectory === 'string' && fallbackDirectory.trim().length > 0) {
      return fallbackDirectory.trim();
    }
    return undefined;
  }, [activeSessionDirectory, fallbackDirectory]);
  const setEventStreamStatus = useUIStore((state) => state.setEventStreamStatus);
  const lastStatusRef = React.useRef<{ status: EventStreamStatus; hint: string | null } | null>(null);

  const publishStatus = React.useCallback(
    (status: EventStreamStatus, hint?: string | null) => {
      const normalizedHint = hint ?? null;
      const last = lastStatusRef.current;
      if (!last || last.status !== status || last.hint !== normalizedHint) {
        lastStatusRef.current = { status, hint: normalizedHint };

        const prefixMap: Record<EventStreamStatus, string> = {
          idle: '[IDLE]',
          connecting: '[CONNECT]',
          connected: '[CONNECTED]',
          reconnecting: '[RECONNECT]',
          paused: '[PAUSED]',
          offline: '[OFFLINE]',
          error: '[ERROR]'
        };

        const labelMap: Record<EventStreamStatus, string> = {
          idle: 'idle',
          connecting: 'connecting',
          connected: 'connected',
          reconnecting: 'reconnecting',
          paused: 'paused',
          offline: 'offline',
          error: 'error'
        };

        const prefix = prefixMap[status] ?? '[INFO]';
        const label = labelMap[status] ?? status;
        const message = hint ? `${prefix} SSE ${label}: ${hint}` : `${prefix} SSE ${label}`;
        console.info(message);
      }
      setEventStreamStatus(status, hint ?? null);
    },
    [setEventStreamStatus]
  );

  // Placeholder functions for message tracking
  const trackMessage: MessageTracker = (messageId, event, extraData) => {
    void messageId;
    void event;
    void extraData;
  };
  const reportMessage: MessageReporter = (messageId) => {
    void messageId;
  };

  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);
  const emptyResponseToastShownRef = React.useRef<Set<string>>(new Set());
  const metadataRefreshTimestampsRef = React.useRef<Map<string, number>>(new Map());
  const sessionRefreshTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

  const resolveVisibilityState = React.useCallback((): 'visible' | 'hidden' => {
    if (typeof document === 'undefined') {
      return 'visible';
    }

    const state = document.visibilityState;

    if (state === 'hidden' && document.hasFocus()) {
      return 'visible';
    }

    return state;
  }, []);

  const visibilityStateRef = React.useRef<'visible' | 'hidden'>(
    resolveVisibilityState()
  );
  const onlineStatusRef = React.useRef<boolean>(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const pendingResumeRef = React.useRef(false);
  const pauseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const staleCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastEventTimestampRef = React.useRef<number>(Date.now());
  const isDesktopRuntimeRef = React.useRef<boolean>(
    typeof window !== 'undefined' && Boolean((window as { opencodeDesktopEvents?: unknown }).opencodeDesktopEvents)
  );

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
          if (session) {
            const patch: Partial<Session> = {};
            if (typeof session.title === 'string' && session.title.length > 0) {
              patch.title = session.title;
            }
            if (session.summary !== undefined) {
              patch.summary = session.summary;
            }
            if (Object.keys(patch).length > 0) {
              applySessionMetadata(sessionId, patch);
            }
          }
        } catch (error) {
          console.warn('Failed to refresh session metadata:', error);
        }
      })();
    },
    [applySessionMetadata]
  );

  const requestSessionListRefresh = React.useCallback(() => {
    if (sessionRefreshTimeoutRef.current) {
      return;
    }
    sessionRefreshTimeoutRef.current = setTimeout(() => {
      sessionRefreshTimeoutRef.current = null;
      try {
        void loadSessions();
      } catch (error) {
        console.warn('Failed to refresh sessions after stream completion:', error);
      }
    }, 500);
  }, [loadSessions]);

  React.useEffect(() => {
    // Expose tracker to SessionStore
    if (typeof window !== 'undefined') {
      window.__messageTracker = trackMessage;
    }

    const desktopEvents =
      typeof window !== 'undefined' ? window.opencodeDesktopEvents : undefined;

    if (desktopEvents?.setDirectory) {
      try {
        desktopEvents.setDirectory(effectiveDirectory ?? null);
      } catch (error) {
        console.warn('Failed to update desktop event bridge directory:', error);
      }
    }

    const clearPauseTimeout = () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
    };

    const clearReconnectTimeout = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const stopStream = () => {
      clearReconnectTimeout();
      if (unsubscribeRef.current) {
        const unsubscribe = unsubscribeRef.current;
        unsubscribeRef.current = null;
        unsubscribe();
      }
    };

    const shouldHoldConnection = () => {
      const currentVisibility = resolveVisibilityState();
      visibilityStateRef.current = currentVisibility;
      return currentVisibility === 'visible' && onlineStatusRef.current;
    };

    const resetLastEventTimestamp = () => {
      lastEventTimestampRef.current = Date.now();
    };

    const handleEvent = (event: EventData) => {
      resetLastEventTimestamp();

      if (!event.properties) return;

      const nonMetadataSessionEvents = new Set(['session.abort', 'session.error']);

      if (!nonMetadataSessionEvents.has(event.type)) {
        const props = event.properties as Record<string, unknown> || {};
        // Safely extract session payload - can be nested object or undefined
        const sessionPayload = (
          (typeof props.session === 'object' && props.session !== null ? props.session : null) ||
          (typeof props.sessionInfo === 'object' && props.sessionInfo !== null ? props.sessionInfo : null)
        ) as Record<string, unknown> | null;

        const sessionIdCandidates: (string | undefined)[] = [
          typeof sessionPayload?.id === 'string' ? sessionPayload.id : undefined,
          typeof sessionPayload?.sessionID === 'string' ? sessionPayload.sessionID : undefined,
          typeof props.sessionID === 'string' ? props.sessionID : undefined,
          typeof props.id === 'string' ? props.id : undefined,
        ];
        const sessionId = sessionIdCandidates.find((value) => typeof value === 'string' && value.length > 0);

        const titleCandidate =
          typeof sessionPayload?.title === 'string'
            ? sessionPayload.title
            : typeof props.title === 'string'
              ? props.title
              : undefined;

        const summaryCandidate =
          typeof sessionPayload?.summary === 'object' && sessionPayload.summary !== null
            ? (sessionPayload.summary as Session['summary'])
            : typeof props.summary === 'object' && props.summary !== null
              ? (props.summary as Session['summary'])
              : undefined;

        const isSessionScopedEvent = event.type.startsWith('session.') || Boolean(sessionPayload);

        if (isSessionScopedEvent && sessionId && (titleCandidate !== undefined || summaryCandidate !== undefined)) {
          const patch: Partial<Session> = {};
          if (titleCandidate !== undefined) {
            patch.title = titleCandidate;
          }
          if (summaryCandidate !== undefined) {
            patch.summary = summaryCandidate;
          }
          applySessionMetadata(sessionId, patch);
        }
      }


      switch (event.type) {
        case 'server.connected':
          checkConnection();
          break;

        case 'message.part.updated':
          if (currentSessionId) {
            const props = event.properties as Record<string, unknown> || {};
            const part = (typeof props.part === 'object' && props.part !== null) ? (props.part as Part) : null;
            // Check if the message info is provided and has a role
            // Handle both formats: { info: { role } } and { role }
            const messageInfo = (typeof props.info === 'object' && props.info !== null) ? (props.info as Record<string, unknown>) : props;


              const partExt = part as Record<string, unknown>;
              if (part && typeof partExt?.sessionID === 'string' && partExt.sessionID === currentSessionId) {
               const messageInfoExt = messageInfo as Record<string, unknown>;
               
               // Determine role: check existing message in store first, then event info, then default
               let roleInfo = 'assistant';
               if (messageInfoExt && typeof messageInfoExt.role === 'string') {
                 roleInfo = messageInfoExt.role;
               } else {
                 // Check if message already exists in store and get its role
                 const storeState = useSessionStore.getState();
                 const sessionMessages = storeState.messages.get(currentSessionId) || [];
                 const existingMessage = sessionMessages.find((m) => m.info.id === partExt.messageID);
                 if (existingMessage) {
                   const existingRole = (existingMessage.info as Record<string, unknown>).role;
                   if (typeof existingRole === 'string') {
                     roleInfo = existingRole;
                   }
                 }
               }
               
               trackMessage(partExt.messageID as string, 'part_received', { role: roleInfo });

               // OpenCode pattern: Accept user message parts from server.
               // Skip only synthetic parts (auto-generated, not user input) for user messages.
               if (roleInfo === 'user') {
                 // Skip synthetic parts (matching OpenCode's UserMessageDisplay filter)
                 if (partExt.synthetic === true) {
                   trackMessage(partExt.messageID as string, 'skipped_synthetic_user_part');
                   return;
                 }
               }

              const messagePart: Part = {
                ...part,
                type: part.type || 'text'
              } as Part;

              trackMessage(partExt.messageID as string, 'addStreamingPart_called');
              addStreamingPart(currentSessionId, partExt.messageID as string, messagePart, roleInfo);
            }
          }
          break;

        case 'message.updated':
          if (currentSessionId) {
            // Handle both formats: { info: { role } } and { role }
            const props = event.properties as Record<string, unknown> || {};
            const message = (typeof props.info === 'object' && props.info !== null) ? (props.info as Record<string, unknown>) : (props as Record<string, unknown>);
            const messageExt = message as Record<string, unknown>;

            if (messageExt && messageExt.sessionID === currentSessionId) {
               if (isDesktopRuntimeRef.current && streamDebugEnabled()) {
                 try {
                   const serverParts = props.parts || messageExt.parts || [];
                   const textParts = Array.isArray(serverParts)
                     ? serverParts.filter((p: unknown) => (p as { type?: string })?.type === 'text')
                     : [];
                   const textJoined = textParts
                     .map((p: unknown) => {
                       const part = p as { text?: string; content?: string };
                       return typeof part?.text === 'string' ? part.text : typeof part?.content === 'string' ? part.content : '';
                     })
                     .join('\n');
                   console.info('[STREAM-TRACE] message.updated', {
                     messageId: messageExt.id,
                     role: messageExt.role,
                     status: messageExt.status,
                     textLen: textJoined.length,
                     textPreview: textJoined.slice(0, 120),
                     partsCount: Array.isArray(serverParts) ? serverParts.length : 0,
                   });
                 } catch {
                   // ignore debug errors
                 }
               }
              trackMessage(messageExt.id as string, 'message_updated', { role: messageExt.role });

              // OpenCode pattern: User messages are created from server events, not optimistically.
              // When message.updated arrives with role='user', create the message in store with its parts.
              if (messageExt.role === 'user') {
                const serverParts = props.parts || messageExt.parts;
                const partsArray = Array.isArray(serverParts) ? (serverParts as Part[]) : [];
                
                // Create user message info with proper markers
                const userMessageInfo = {
                  ...message,
                  userMessageMarker: true,
                  clientRole: 'user',
                } as unknown as Message;
                
                // Update message info first (creates message entry if not exists)
                updateMessageInfo(currentSessionId, messageExt.id as string, userMessageInfo);
                
                // Then inject parts if available
                if (partsArray.length > 0) {
                  partsArray.forEach((serverPart: Part) => {
                    // Skip synthetic parts for display (matching OpenCode behavior)
                    const partExt = serverPart as Record<string, unknown>;
                    if (partExt.synthetic === true) {
                      return;
                    }
                    
                    const enrichedPart: Part = {
                      ...serverPart,
                      type: serverPart?.type || 'text',
                      sessionID: (serverPart as { sessionID?: string })?.sessionID || currentSessionId,
                      messageID: (serverPart as { messageID?: string })?.messageID || (messageExt.id as string),
                    } as Part;
                    addStreamingPart(currentSessionId, messageExt.id as string, enrichedPart, 'user');
                  });
                }
                
                trackMessage(messageExt.id as string, 'user_message_created_from_event', { partsCount: partsArray.length });
                return;
              }

              const storeSnapshot = useSessionStore.getState();

              const sessionSnapshotMessages = storeSnapshot.messages.get(currentSessionId) || [];
              const existingMessageSnapshot = sessionSnapshotMessages.find((m) => m.info.id === messageExt.id);
              const existingLen = computeTextLength(existingMessageSnapshot?.parts || []);
              const existingStopMarker =
                existingMessageSnapshot?.parts?.some(
                  (part) => part?.type === 'step-finish' && (part as { reason?: string })?.reason === 'stop'
                ) ?? false;

              // Drop empty updates that carry no parts/text and no completion info to avoid clobbering existing content
              const serverParts = props.parts || messageExt.parts;
              const partsArray = Array.isArray(serverParts) ? (serverParts as Part[]) : [];
              const hasParts = partsArray.length > 0;
              const status = (messageExt.status as string | undefined) || (messageExt as { info?: { status?: string } })?.info?.status;
              const timeObj = (messageExt.time as { completed?: number }) || {};
              const completedFromServer = typeof timeObj?.completed === 'number';
              const hasUsefulText =
                hasParts &&
                partsArray.some(
                  (p) => {
                    const textPart = p as { text?: string };
                    return p?.type === 'text' && typeof textPart?.text === 'string' && textPart.text.length > 0;
                  }
                );
              const eventHasStopFinish =
                hasParts &&
                partsArray.some((p) => p?.type === 'step-finish' && (p as { reason?: string })?.reason === 'stop');
              const stopMarkerPresent = eventHasStopFinish || existingStopMarker;
              const incomingLen = hasParts ? computeTextLength(partsArray) : 0;
              const isDesktopRuntime = isDesktopRuntimeRef.current;

              if (!hasParts && !completedFromServer && status !== 'completed') {
                return;
              }

              // Prevent regressions: if incoming assistant parts would shrink text significantly, ignore
              if (messageExt.role === 'assistant' && hasParts) {
                const wouldShrink = existingLen > 0 && incomingLen + TEXT_SHRINK_TOLERANCE < existingLen;
                if (wouldShrink && !eventHasStopFinish) {
                  trackMessage(messageExt.id as string, 'skipped_shrinking_update', { incomingLen, existingLen });
                  return;
                }
              }

              if (isDesktopRuntime && messageExt.role === 'assistant') {
                const zeroToleranceShrink = existingLen > 0 && incomingLen < existingLen;
                const shrinkAllowed = eventHasStopFinish && hasUsefulText;
                if (zeroToleranceShrink && !shrinkAllowed) {
                  trackMessage(messageExt.id as string, 'desktop_shrinking_update_suppressed', {
                    incomingLen,
                    existingLen,
                  });
                  return;
                }
              }

               // Update the message info in the store to include agent and other metadata
               updateMessageInfo(currentSessionId, messageExt.id as string, message as unknown as Message);

               const partsToInject =
                 isDesktopRuntime && messageExt.role === 'assistant'
                   ? partsArray.filter((serverPart) => serverPart?.type !== 'text')
                   : partsArray;

               if (partsToInject.length > 0 && messageExt.role !== 'user') {
                 const storeState = useSessionStore.getState();
                 const existingMessages = storeState.messages.get(currentSessionId) || [];
                 const existingMessage = existingMessages.find((m) => m.info.id === messageExt.id as string);
                 const needsInjection = !existingMessage || existingMessage.parts.length === 0;

                 trackMessage(
                   messageExt.id as string,
                   needsInjection ? 'server_parts_injected' : 'server_parts_refreshed',
                   { count: partsToInject.length as number }
                 );

                 partsToInject.forEach((serverPart: Part, index: number) => {
                   const enrichedPart: Part = {
                     ...serverPart,
                     type: serverPart?.type || 'text',
                     sessionID: serverPart?.sessionID || currentSessionId,
                     messageID: serverPart?.messageID || messageExt.id,
                   } as Part;
                   addStreamingPart(currentSessionId, messageExt.id as string, enrichedPart, messageExt.role as string);
                   trackMessage(messageExt.id as string, `server_part_${index}`);
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

                  // Desktop IPC sometimes delivers completion before the last chunk.
                  // If we don't have a stop marker, delay completion briefly and cancel if more parts arrive.
                  if (!stopMarkerPresent && isDesktopRuntimeRef.current) {
                    trackMessage(message.id as string, 'desktop_completion_without_stop');
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
                if (currentSessionId) {
                  void saveSessionCursor(currentSessionId, message.id as string, timeCompleted);
                }

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

                  if (ENABLE_EMPTY_RESPONSE_DETECTION && isEmptyResponse) {
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
                requestSessionListRefresh();

                const summaryInfo = message as Message & { summary?: boolean };
                if (summaryInfo.summary && typeof message.sessionID === 'string') {
                  updateSessionCompaction(message.sessionID, null);
                }
              }
            }
          }
          break;

        case 'session.updated': {
          const props = event.properties as Record<string, unknown> || {};
          const candidate = (typeof props.info === 'object' && props.info !== null) ? (props.info as Record<string, unknown>) :
                           (typeof props.sessionInfo === 'object' && props.sessionInfo !== null) ? (props.sessionInfo as Record<string, unknown>) :
                           (typeof props.session === 'object' && props.session !== null) ? (props.session as Record<string, unknown>) : props;

          const sessionIdCandidates: (string | undefined)[] = [
            typeof candidate.id === 'string' ? candidate.id : undefined,
            typeof candidate.sessionID === 'string' ? candidate.sessionID : undefined,
            typeof props.sessionID === 'string' ? props.sessionID : undefined,
            typeof props.id === 'string' ? props.id : undefined,
          ];
          const sessionId = sessionIdCandidates.find((value) => typeof value === 'string' && value.length > 0);

          if (sessionId) {
            const timeSource = (typeof candidate.time === 'object' && candidate.time !== null) ? (candidate.time as Record<string, unknown>) :
                               (typeof props.time === 'object' && props.time !== null) ? (props.time as Record<string, unknown>) : null;
            const compactingTimestamp = timeSource && typeof timeSource.compacting === 'number' ? timeSource.compacting : null;
            updateSessionCompaction(sessionId, compactingTimestamp);
          }
          break;
        }

        case 'session.abort':

          if (currentSessionId) {
            const props = event.properties as Record<string, unknown> || {};
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
            const props = event.properties as Record<string, unknown>;
            if (currentSessionId === props.sessionID) {
              // Permission properties come from SDK event
              addPermission(props as unknown as Permission);
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

    function startStream(options?: { resetAttempts?: boolean }) {
      if (!shouldHoldConnection()) {
        pendingResumeRef.current = true;
        if (!onlineStatusRef.current) {
          publishStatus('offline', 'Waiting for network');
        } else {
          publishStatus('paused', 'Paused while hidden');
        }
        return;
      }

      if (options?.resetAttempts) {
        reconnectAttemptsRef.current = 0;
      }

      stopStream();
      resetLastEventTimestamp();
      publishStatus('connecting', null);

      const onError = (error: unknown) => {
        console.warn('Event stream error:', error);
        scheduleReconnect('Connection lost');
      };

      const onOpen = () => {
        const shouldRefresh = pendingResumeRef.current;
        reconnectAttemptsRef.current = 0;
        pendingResumeRef.current = false;
        resetLastEventTimestamp();
        publishStatus('connected', null);
        checkConnection();

        if (shouldRefresh && currentSessionId) {
          useSessionStore
            .getState()
            .loadMessages(currentSessionId)
            .then(() => {
              requestSessionMetadataRefresh(currentSessionId);
            })
            .catch((error) => {
              console.warn('[useEventStream] Failed to resync messages after reconnect:', error);
            });
        }
      };

      const onMessageComplete = (messageId: string) => {
        if (!currentSessionId) return;
        console.info('[useEventStream] Desktop completion signal for message:', messageId);
        completeStreamingMessage(currentSessionId, messageId);
        requestSessionMetadataRefresh(currentSessionId);
        requestSessionListRefresh();
      };

      const onSessionActivity = (payload: Record<string, unknown> | null) => {
        if (!payload) return;
        const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : null;
        const phase = typeof payload.phase === 'string' ? (payload.phase as 'idle' | 'busy' | 'cooldown') : null;
        if (!sessionId || !phase) return;

        useSessionStore.setState((state) => {
          const current = state.sessionActivityPhase ?? new Map<string, 'idle' | 'busy' | 'cooldown'>();
          const next = new Map(current);
          next.set(sessionId, phase);
          return { sessionActivityPhase: next };
        });
      };

      unsubscribeRef.current = desktopEvents?.subscribe
        ? desktopEvents.subscribe(handleEvent, onError, onOpen, onMessageComplete, onSessionActivity)
        : opencodeClient.subscribeToEvents(handleEvent, onError, onOpen, effectiveDirectory);
    }

    function scheduleReconnect(hint?: string) {
      if (!shouldHoldConnection()) {
        pendingResumeRef.current = true;
        stopStream();
        if (!onlineStatusRef.current) {
          publishStatus('offline', 'Waiting for network');
        } else {
          publishStatus('paused', 'Paused while hidden');
        }
        return;
      }

      const nextAttempt = reconnectAttemptsRef.current + 1;
      reconnectAttemptsRef.current = nextAttempt;
      const statusHint = hint ?? `Retrying (${nextAttempt})`;
      publishStatus('reconnecting', statusHint);

      const baseDelay =
        nextAttempt <= 3
          ? Math.min(1000 * Math.pow(2, nextAttempt - 1), 8000)
          : Math.min(2000 * Math.pow(2, nextAttempt - 3), 32000);
      const jitter = Math.floor(Math.random() * 250);
      const delay = baseDelay + jitter;

      clearReconnectTimeout();

      reconnectTimeoutRef.current = setTimeout(() => {
        startStream({ resetAttempts: false });
      }, delay);
    }

    const pauseStreamSoon = () => {
      if (pauseTimeoutRef.current) {
        return;
      }

      pauseTimeoutRef.current = setTimeout(() => {
        const pendingVisibility = resolveVisibilityState();
        visibilityStateRef.current = pendingVisibility;

        if (pendingVisibility !== 'visible') {
          stopStream();
          pendingResumeRef.current = true;
          publishStatus('paused', 'Paused while hidden');
        } else {
          clearPauseTimeout();
        }
      }, 5000);
    };

    const handleVisibilityChange = () => {
      visibilityStateRef.current = resolveVisibilityState();

      if (visibilityStateRef.current === 'visible') {
        clearPauseTimeout();
        if (pendingResumeRef.current || !unsubscribeRef.current) {
          console.info('[useEventStream] Visibility restored, triggering soft refresh...');
          // Reset backend-driven session activity phases; they will be repopulated by fresh events
          useSessionStore.setState({ sessionActivityPhase: new Map() });
          if (currentSessionId) {
             useSessionStore.getState().loadMessages(currentSessionId).catch(() => {});
             requestSessionMetadataRefresh(currentSessionId);
          }
          
          publishStatus('connecting', 'Resuming stream');
          startStream({ resetAttempts: true });
        }
      } else {
        publishStatus('paused', 'Paused while hidden');
        pauseStreamSoon();
      }
    };

    const handleWindowFocus = () => {
      visibilityStateRef.current = resolveVisibilityState();

      if (visibilityStateRef.current === 'visible') {
        clearPauseTimeout();
        
        // Soft refresh logic: If we were paused/interrupted, force a state refresh
        // to catch up with any background progress the backend made while we were napping.
        if (pendingResumeRef.current || !unsubscribeRef.current) {
          console.info('[useEventStream] Window focused after pause, triggering soft refresh...');
          // Reset backend-driven session activity phases to avoid stale "busy" states after wake
          useSessionStore.setState({ sessionActivityPhase: new Map() });
          
          if (currentSessionId) {
            requestSessionMetadataRefresh(currentSessionId);
            useSessionStore
              .getState()
              .loadMessages(currentSessionId)
              .then(() => console.info('[useEventStream] Messages refreshed on focus'))
              .catch((err) => console.warn('[useEventStream] Failed to refresh messages:', err));
          }

          publishStatus('connecting', 'Resuming stream');
          startStream({ resetAttempts: true });
        }
      }
    };

    const handleOnline = () => {
      onlineStatusRef.current = true;
      if (pendingResumeRef.current || !unsubscribeRef.current) {
        publishStatus('connecting', 'Network restored');
        startStream({ resetAttempts: true });
      }
    };

    const handleOffline = () => {
      onlineStatusRef.current = false;
      pendingResumeRef.current = true;
      publishStatus('offline', 'Waiting for network');
      stopStream();
    };

    const attachEventListeners = () => {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', handleVisibilityChange);
      }

      if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('focus', handleWindowFocus);
      }
    };

    const detachEventListeners = () => {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', handleWindowFocus);
      }
    };

    attachEventListeners();
    startStream({ resetAttempts: true });

    if (staleCheckIntervalRef.current) {
      clearInterval(staleCheckIntervalRef.current);
    }

    staleCheckIntervalRef.current = setInterval(() => {
      if (!shouldHoldConnection()) {
        return;
      }

      const now = Date.now();
      if (now - lastEventTimestampRef.current > 25000) {
        void (async () => {
          try {
            const healthy = await opencodeClient.checkHealth();
            if (!healthy) {
              scheduleReconnect('Refreshing stalled stream');
            } else {
              resetLastEventTimestamp();
            }
          } catch (error) {
            console.warn('Health check after stale stream failed:', error);
            scheduleReconnect('Refreshing stalled stream');
          }
        })();
      }

      // Drift resync removed to avoid flicker; rely on normal updates and focus refresh.
    }, 10000);

    // Cleanup on unmount
    return () => {
      detachEventListeners();
      clearPauseTimeout();
      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }
      pendingResumeRef.current = false;
      visibilityStateRef.current =
        resolveVisibilityState();
      onlineStatusRef.current = typeof navigator === 'undefined' ? true : navigator.onLine;
      if (unsubscribeRef.current) {
        const unsubscribe = unsubscribeRef.current;
        unsubscribeRef.current = null;
        unsubscribe();
      }
      clearReconnectTimeout();
      if (sessionRefreshTimeoutRef.current) {
        clearTimeout(sessionRefreshTimeoutRef.current);
        sessionRefreshTimeoutRef.current = null;
      }
      publishStatus('idle', null);
    };
  }, [
    currentSessionId,
    addStreamingPart,
    completeStreamingMessage,
    updateMessageInfo,
    addPermission,
    checkConnection,
    requestSessionMetadataRefresh,
    requestSessionListRefresh,
    updateSessionCompaction,
    applySessionMetadata,
    publishStatus,
    resolveVisibilityState,
    effectiveDirectory,
    loadMessages
  ]);
};
