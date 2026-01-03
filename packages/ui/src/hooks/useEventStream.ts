import React from 'react';
import { opencodeClient } from '@/lib/opencode/client';
import { saveSessionCursor } from '@/lib/messageCursorPersistence';
import { useSessionStore } from '@/stores/useSessionStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useUIStore, type EventStreamStatus } from '@/stores/useUIStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import type { Part, Session, Message, Permission } from '@opencode-ai/sdk/v2';
import { streamDebugEnabled } from '@/stores/utils/streamDebug';
import { handleTodoUpdatedEvent } from '@/stores/useTodoStore';

interface EventData {
  type: string;
  properties?: Record<string, unknown>;
}

type MessageTracker = (messageId: string, event?: string, extraData?: Record<string, unknown>) => void;

declare global {
  interface Window {
    __messageTracker?: MessageTracker;
  }
}

const ENABLE_EMPTY_RESPONSE_DETECTION = false;
const TEXT_SHRINK_TOLERANCE = 50;
const RESYNC_DEBOUNCE_MS = 750;

const textLengthCache = new WeakMap<Part[], number>();
const computeTextLength = (parts: Part[] | undefined | null): number => {
  if (!parts || !Array.isArray(parts)) return 0;

  const cached = textLengthCache.get(parts);
  if (cached !== undefined) return cached;

  let length = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part?.type === 'text') {
      const text = (part as { text?: string; content?: string }).text ?? (part as { text?: string; content?: string }).content;
      if (typeof text === 'string') length += text.length;
    }
  }

  textLengthCache.set(parts, length);
  return length;
};

const MIN_SORTABLE_LENGTH = 10;
const extractSortableId = (id: unknown): string | null => {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  if (!trimmed) return null;
  const underscoreIndex = trimmed.indexOf('_');
  const candidate = underscoreIndex >= 0 ? trimmed.slice(underscoreIndex + 1) : trimmed;
  if (!candidate || candidate.length < MIN_SORTABLE_LENGTH) return null;
  return candidate;
};

const isIdNewer = (id: string, referenceId: string): boolean => {
  const currentSortable = extractSortableId(id);
  const referenceSortable = extractSortableId(referenceId);
  if (!currentSortable || !referenceSortable) return true;
  if (currentSortable.length !== referenceSortable.length) return true;
  return currentSortable > referenceSortable;
};

const messageCache = new Map<string, { sessionId: string; message: { info: Message; parts: Part[] } | null }>();
const getMessageFromStore = (sessionId: string, messageId: string): { info: Message; parts: Part[] } | null => {
  const cacheKey = `${sessionId}:${messageId}`;
  const cached = messageCache.get(cacheKey);
  if (cached && cached.sessionId === sessionId) {
    return cached.message;
  }

  const storeState = useSessionStore.getState();
  const sessionMessages = storeState.messages.get(sessionId) || [];
  const message = sessionMessages.find(m => m.info.id === messageId) || null;

  messageCache.set(cacheKey, { sessionId, message });
  return message;
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
    if (!currentSessionId) return undefined;

    try {
      const metadata = getWorktreeMetadata?.(currentSessionId);
      if (metadata?.path) return metadata.path;
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
      if (last && last.status === status && last.hint === normalizedHint) {
        return;
      }

      lastStatusRef.current = { status, hint: normalizedHint };

      if (streamDebugEnabled()) {
        const prefixMap: Record<EventStreamStatus, string> = {
          idle: '[IDLE]',
          connecting: '[CONNECT]',
          connected: '[CONNECTED]',
          reconnecting: '[RECONNECT]',
          paused: '[PAUSED]',
          offline: '[OFFLINE]',
          error: '[ERROR]'
        };

        const prefix = prefixMap[status] ?? '[INFO]';
        const message = normalizedHint ? `${prefix} SSE ${status}: ${normalizedHint}` : `${prefix} SSE ${status}`;
        console.info(message);
      }

      setEventStreamStatus(status, normalizedHint);
    },
    [setEventStreamStatus]
  );

  const resyncMessages = React.useCallback(
    (sessionId: string, reason: string) => {
      if (!sessionId) {
        return Promise.resolve();
      }
      const now = Date.now();
      if (resyncInFlightRef.current) {
        return resyncInFlightRef.current;
      }
      if (now - lastResyncAtRef.current < RESYNC_DEBOUNCE_MS) {
        return Promise.resolve();
      }
      const task = loadMessages(sessionId)
        .catch((error) => {
          console.warn(`[useEventStream] Failed to resync messages (${reason}):`, error);
        })
        .finally(() => {
          resyncInFlightRef.current = null;
          lastResyncAtRef.current = Date.now();
        });
      resyncInFlightRef.current = task;
      return task;
    },
    [loadMessages]
  );

  const bootstrapState = React.useCallback(
    async (reason: string) => {
      if (streamDebugEnabled()) {
        console.info('[useEventStream] Bootstrapping state:', reason);
      }
      try {
        await Promise.all([
          loadSessions(),
          currentSessionId ? resyncMessages(currentSessionId, reason) : Promise.resolve(),
        ]);
      } catch (error) {
        console.warn('[useEventStream] Bootstrap failed:', reason, error);
      }
    },
    [currentSessionId, loadSessions, resyncMessages]
  );

  const trackMessage = React.useCallback((messageId: string, event?: string, extraData?: Record<string, unknown>) => {
    if (streamDebugEnabled()) {
      console.debug(`[MessageTracker] ${messageId}: ${event}`, extraData);
    }
  }, []);

  const reportMessage = React.useCallback((messageId: string) => {
    if (streamDebugEnabled()) {
      console.debug(`[MessageTracker] ${messageId}: reported`);
    }
  }, []);

  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = React.useRef(0);
  const emptyResponseToastShownRef = React.useRef<Set<string>>(new Set());
  const metadataRefreshTimestampsRef = React.useRef<Map<string, number>>(new Map());
  const sessionRefreshTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const isCleaningUpRef = React.useRef(false);
  const resyncInFlightRef = React.useRef<Promise<void> | null>(null);
  const lastResyncAtRef = React.useRef(0);

  const resolveVisibilityState = React.useCallback((): 'visible' | 'hidden' => {
    if (typeof document === 'undefined') return 'visible';

    const state = document.visibilityState;
    return state === 'hidden' && document.hasFocus() ? 'visible' : state;
  }, []);

  const visibilityStateRef = React.useRef<'visible' | 'hidden'>(resolveVisibilityState());
  const onlineStatusRef = React.useRef<boolean>(typeof navigator === 'undefined' ? true : navigator.onLine);
  const pendingResumeRef = React.useRef(false);
  const pauseTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const staleCheckIntervalRef = React.useRef<NodeJS.Timeout | null>(null);
  const lastEventTimestampRef = React.useRef<number>(Date.now());
  const isDesktopRuntimeRef = React.useRef<boolean>(false);

  const maybeBootstrapIfStale = React.useCallback(
    (reason: string) => {
      const now = Date.now();
      if (now - lastEventTimestampRef.current > 25000) {
        void bootstrapState(reason);
        lastEventTimestampRef.current = now;
      }
    },
    [bootstrapState]
  );

  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const apis = (window as typeof window & { __OPENCHAMBER_RUNTIME_APIS__?: { runtime?: { isDesktop?: boolean } } }).__OPENCHAMBER_RUNTIME_APIS__;
      if (apis?.runtime?.isDesktop) {
        isDesktopRuntimeRef.current = true;
      }
    }
  }, []);

  const sessionCooldownTimersRef = React.useRef<Map<string, NodeJS.Timeout>>(new Map());
  const sessionActivityPhaseRef = React.useRef<Map<string, 'idle' | 'busy' | 'cooldown'>>(new Map());
  const sessionStatusLastRefreshAtRef = React.useRef<number>(0);
  const sessionStatusRefreshInFlightRef = React.useRef<Promise<void> | null>(null);
  const currentSessionIdRef = React.useRef<string | null>(currentSessionId);
  React.useEffect(() => {
    currentSessionIdRef.current = currentSessionId;
  }, [currentSessionId]);

  const requestSessionMetadataRefresh = React.useCallback(
    (sessionId: string | undefined | null) => {
      if (!sessionId) return;

      const now = Date.now();
      const timestamps = metadataRefreshTimestampsRef.current;
      const lastRefresh = timestamps.get(sessionId);

      if (lastRefresh && now - lastRefresh < 3000) return;

      timestamps.set(sessionId, now);

      setTimeout(async () => {
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
      }, 100);
    },
    [applySessionMetadata]
  );

  const requestSessionListRefresh = React.useCallback(() => {
    if (sessionRefreshTimeoutRef.current) return;

    sessionRefreshTimeoutRef.current = setTimeout(() => {
      sessionRefreshTimeoutRef.current = null;
      try {
        void loadSessions();
      } catch (error) {
        console.warn('Failed to refresh sessions after stream completion:', error);
      }
    }, 500);
  }, [loadSessions]);

  const updateSessionActivityPhase = React.useCallback((sessionId: string, phase: 'idle' | 'busy' | 'cooldown') => {
    const storePhase = useSessionStore.getState().sessionActivityPhase?.get(sessionId);
    if (storePhase === phase) {
      sessionActivityPhaseRef.current = new Map(useSessionStore.getState().sessionActivityPhase ?? new Map());
      return;
    }

    const existingTimer = sessionCooldownTimersRef.current.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      sessionCooldownTimersRef.current.delete(sessionId);
    }

    const next = new Map(useSessionStore.getState().sessionActivityPhase ?? new Map());
    next.set(sessionId, phase);
    sessionActivityPhaseRef.current = next;
    useSessionStore.setState({ sessionActivityPhase: next });

    if (phase === 'cooldown') {
      const timer = setTimeout(() => {
        sessionCooldownTimersRef.current.delete(sessionId);
        const current = useSessionStore.getState().sessionActivityPhase?.get(sessionId);
        if (current === 'cooldown') {
          const latest = new Map(useSessionStore.getState().sessionActivityPhase ?? new Map());
          latest.set(sessionId, 'idle');
          sessionActivityPhaseRef.current = latest;
          useSessionStore.setState({ sessionActivityPhase: latest });
        }
      }, 2000);
      sessionCooldownTimersRef.current.set(sessionId, timer);
    }
  }, []);

  const refreshSessionActivityStatus = React.useCallback(async () => {
    const now = Date.now();
    if (sessionStatusRefreshInFlightRef.current) {
      return sessionStatusRefreshInFlightRef.current;
    }
    if (now - sessionStatusLastRefreshAtRef.current < 1500) {
      return;
    }
    sessionStatusLastRefreshAtRef.current = now;

    const normalizeDirectory = (value: string | null | undefined): string | null => {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed) return null;
      const normalized = trimmed.replace(/\\/g, '/');
      return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
    };

    const resolveSessionDirectoryForStatus = (sessionId: string): string | null => {
      try {
        const metadata = getWorktreeMetadata?.(sessionId);
        const metaPath = normalizeDirectory(metadata?.path ?? null);
        if (metaPath) return metaPath;
      } catch {
        // ignored
      }

      const record = sessions.find((entry) => entry.id === sessionId);
      const recordPath = normalizeDirectory((record as { directory?: string | null })?.directory ?? null);
      return recordPath;
    };

    const applyStatusMap = (statusMap: Record<string, { type?: string }>) => {
      Object.entries(statusMap).forEach(([sessionId, raw]) => {
        if (!sessionId || !raw) return;
        const phase: 'idle' | 'busy' =
          raw.type === 'busy' || raw.type === 'retry' ? 'busy' : 'idle';
        updateSessionActivityPhase(sessionId, phase);
      });
    };

    const task = (async (): Promise<void> => {
      try {
        const globalStatusMap = await opencodeClient.getGlobalSessionStatus();
        if (globalStatusMap && Object.keys(globalStatusMap).length > 0) {
          applyStatusMap(globalStatusMap);
          return;
        }

        const directories = new Set<string>();
        sessions.forEach((session) => {
          const directory = resolveSessionDirectoryForStatus(session.id);
          if (directory) directories.add(directory);
        });

        const effective = normalizeDirectory(effectiveDirectory ?? null);
        if (effective) directories.add(effective);

        const queries = Array.from(directories);
        if (queries.length === 0) {
          // Fall back to scoped status for whatever the OpenCode client currently tracks.
          const scoped = await opencodeClient.getSessionStatus();
          if (scoped) {
            applyStatusMap(scoped);
          }
          return;
        }

        const results = await Promise.allSettled(
          queries.map((directory) => opencodeClient.getSessionStatusForDirectory(directory))
        );

        const merged: Record<string, { type?: string }> = {};
        results.forEach((result) => {
          if (result.status !== 'fulfilled' || !result.value) return;
          Object.assign(merged, result.value);
        });

        applyStatusMap(merged);
      } catch {
        // ignored
      }
    })().finally(() => {
      sessionStatusRefreshInFlightRef.current = null;
    });

    sessionStatusRefreshInFlightRef.current = task;
    return task;
  }, [effectiveDirectory, getWorktreeMetadata, sessions, updateSessionActivityPhase]);

  const handleEvent = React.useCallback((event: EventData) => {
    lastEventTimestampRef.current = Date.now();

    if (streamDebugEnabled()) {
      console.debug('[useEventStream] Received event:', event.type, event.properties);
    }

    if (!event.properties) return;

    const props = event.properties as Record<string, unknown>;
    const nonMetadataSessionEvents = new Set(['session.abort', 'session.error']);

    if (!nonMetadataSessionEvents.has(event.type)) {
      const sessionPayload = (typeof props.session === 'object' && props.session !== null ? props.session : null) ||
                           (typeof props.sessionInfo === 'object' && props.sessionInfo !== null ? props.sessionInfo : null) as Record<string, unknown> | null;

      if (sessionPayload) {
        const sessionPayloadAny = sessionPayload as Record<string, unknown>;
        const sessionId = (typeof sessionPayloadAny.id === 'string' && sessionPayloadAny.id.length > 0) ? sessionPayloadAny.id :
                         (typeof sessionPayloadAny.sessionID === 'string' && sessionPayloadAny.sessionID.length > 0) ? sessionPayloadAny.sessionID :
                         (typeof props.sessionID === 'string' && props.sessionID.length > 0) ? props.sessionID :
                         (typeof props.id === 'string' && props.id.length > 0) ? props.id : undefined;

        if (sessionId) {
          const titleCandidate = typeof sessionPayloadAny.title === 'string' ? sessionPayloadAny.title :
                                typeof props.title === 'string' ? props.title : undefined;

          const summaryCandidate = (typeof sessionPayloadAny.summary === 'object' && sessionPayloadAny.summary !== null) ? sessionPayloadAny.summary as Session['summary'] :
                                  (typeof props.summary === 'object' && props.summary !== null) ? props.summary as Session['summary'] : undefined;

          if (titleCandidate !== undefined || summaryCandidate !== undefined) {
            const patch: Partial<Session> = {};
            if (titleCandidate !== undefined) patch.title = titleCandidate;
            if (summaryCandidate !== undefined) patch.summary = summaryCandidate;
            applySessionMetadata(sessionId, patch);
          }
        }
      }
    }

    switch (event.type) {
      case 'server.connected':
        checkConnection();
        break;
      case 'global.disposed':
      case 'server.instance.disposed': {
        void bootstrapState('server_disposed_event');
        break;
      }
      case 'openchamber:session-activity': {
        const sessionId = typeof props.sessionId === 'string' ? props.sessionId : null;
        const phase = typeof props.phase === 'string' ? props.phase : null;
        if (sessionId && (phase === 'idle' || phase === 'busy' || phase === 'cooldown')) {
          updateSessionActivityPhase(sessionId, phase);
          // Refresh session list on activity changes (same trigger as activity indication)
          requestSessionListRefresh();
        }
        break;
      }

      case 'session.status':
        if (isDesktopRuntimeRef.current) break;
        {
          const sessionId = typeof props.sessionID === 'string' ? props.sessionID : null;
          const statusObj = (typeof props.status === 'object' && props.status !== null) ? props.status as Record<string, unknown> : null;
          const statusType = typeof statusObj?.type === 'string' ? statusObj.type : null;

          if (sessionId && statusType) {
            updateSessionActivityPhase(
              sessionId,
              statusType === 'busy' || statusType === 'retry' ? 'busy' : 'idle',
            );
            // Refresh session list on status changes (same trigger as activity indication)
            requestSessionListRefresh();
          }
        }
        break;

      case 'message.part.updated': {
        const part = (typeof props.part === 'object' && props.part !== null) ? (props.part as Part) : null;
        if (!part) break;

        const partExt = part as Record<string, unknown>;
        const messageInfo = (typeof props.info === 'object' && props.info !== null) ? (props.info as Record<string, unknown>) : props;

        const messageInfoSessionId = typeof (messageInfo as { sessionID?: unknown }).sessionID === 'string'
          ? (messageInfo as { sessionID?: string }).sessionID
          : null;

        const resolvedSessionId =
          (typeof partExt.sessionID === 'string' && (partExt.sessionID as string).length > 0) ? (partExt.sessionID as string) :
          (typeof messageInfoSessionId === 'string' && messageInfoSessionId.length > 0) ? messageInfoSessionId :
          (typeof props.sessionID === 'string' && (props.sessionID as string).length > 0) ? (props.sessionID as string) :
          null;

        const messageInfoId = typeof (messageInfo as { id?: unknown }).id === 'string'
          ? (messageInfo as { id?: string }).id
          : null;

        const resolvedMessageId =
          (typeof partExt.messageID === 'string' && (partExt.messageID as string).length > 0) ? (partExt.messageID as string) :
          (typeof messageInfoId === 'string' && messageInfoId.length > 0) ? messageInfoId :
          (typeof props.messageID === 'string' && (props.messageID as string).length > 0) ? (props.messageID as string) :
          null;

        if (!resolvedSessionId || !resolvedMessageId) {
          if (streamDebugEnabled()) {
            console.debug('[useEventStream] Skipping message.part.updated without resolvable session/message id', {
              sessionID: partExt.sessionID ?? messageInfoSessionId ?? props.sessionID,
              messageID: partExt.messageID ?? messageInfoId ?? props.messageID,
            });
          }
          break;
        }

        const sessionId = resolvedSessionId;
        const messageId = resolvedMessageId;

        const trimmedHeadMaxId = useSessionStore.getState().sessionMemoryState.get(sessionId)?.trimmedHeadMaxId;
        if (trimmedHeadMaxId && !isIdNewer(messageId, trimmedHeadMaxId)) {
          if (streamDebugEnabled()) {
            console.debug('[useEventStream] Skipping message.part.updated for trimmed message', {
              sessionId,
              messageId,
              trimmedHeadMaxId,
            });
          }
          break;
        }

        let roleInfo = 'assistant';
        if (messageInfo && typeof (messageInfo as { role?: unknown }).role === 'string') {
          roleInfo = (messageInfo as { role?: string }).role as string;
        } else {
          const existingMessage = getMessageFromStore(sessionId, messageId);
          if (existingMessage) {
            const existingRole = (existingMessage.info as Record<string, unknown>).role;
            if (typeof existingRole === 'string') {
              roleInfo = existingRole;
            }
          }
        }

        trackMessage(messageId, 'part_received', { role: roleInfo });

        if (roleInfo === 'user' && partExt.synthetic === true) {
          trackMessage(messageId, 'skipped_synthetic_user_part');
          break;
        }

        const messagePart: Part = {
          ...part,
          type: part.type || 'text',
        } as Part;

        trackMessage(messageId, 'addStreamingPart_called');
        addStreamingPart(sessionId, messageId, messagePart, roleInfo);
        break;
      }

      case 'message.updated': {
        const message = (typeof props.info === 'object' && props.info !== null) ? (props.info as Record<string, unknown>) : props;
        const messageExt = message as Record<string, unknown>;

        const resolvedSessionId =
          (typeof messageExt.sessionID === 'string' && (messageExt.sessionID as string).length > 0) ? (messageExt.sessionID as string) :
          (typeof props.sessionID === 'string' && (props.sessionID as string).length > 0) ? (props.sessionID as string) :
          null;

        const resolvedMessageId =
          (typeof messageExt.id === 'string' && (messageExt.id as string).length > 0) ? (messageExt.id as string) :
          (typeof props.messageID === 'string' && (props.messageID as string).length > 0) ? (props.messageID as string) :
          null;

        if (!resolvedSessionId || !resolvedMessageId) {
          if (streamDebugEnabled()) {
            console.debug('[useEventStream] Skipping message.updated without resolvable session/message id', {
              sessionID: messageExt.sessionID ?? props.sessionID,
              messageID: messageExt.id ?? props.messageID,
            });
          }
          break;
        }

        const sessionId = resolvedSessionId;
        const messageId = resolvedMessageId;

        const trimmedHeadMaxId = useSessionStore.getState().sessionMemoryState.get(sessionId)?.trimmedHeadMaxId;
        if (trimmedHeadMaxId && !isIdNewer(messageId, trimmedHeadMaxId)) {
          if (streamDebugEnabled()) {
            console.debug('[useEventStream] Skipping message.updated for trimmed message', {
              sessionId,
              messageId,
              trimmedHeadMaxId,
            });
          }
          break;
        }

        if (isDesktopRuntimeRef.current && streamDebugEnabled()) {
          try {
            const serverParts = (props as { parts?: unknown }).parts || (messageExt as { parts?: unknown }).parts || [];
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
              messageId,
              role: (messageExt as { role?: unknown }).role,
              status: (messageExt as { status?: unknown }).status,
              textLen: textJoined.length,
              textPreview: textJoined.slice(0, 120),
              partsCount: Array.isArray(serverParts) ? serverParts.length : 0,
            });
          } catch { /* ignored */ }
        }

        trackMessage(messageId, 'message_updated', { role: (messageExt as { role?: unknown }).role });

        if ((messageExt as { role?: unknown }).role === 'user') {
          const serverParts = (props as { parts?: unknown }).parts || (messageExt as { parts?: unknown }).parts;
          const partsArray = Array.isArray(serverParts) ? (serverParts as Part[]) : [];

          const userMessageInfo = {
            ...message,
            userMessageMarker: true,
            clientRole: 'user',
          } as unknown as Message;

          updateMessageInfo(sessionId, messageId, userMessageInfo);

          if (partsArray.length > 0) {
            for (let i = 0; i < partsArray.length; i++) {
              const serverPart = partsArray[i];
              if ((serverPart as Record<string, unknown>).synthetic === true) continue;

              const enrichedPart: Part = {
                ...serverPart,
                type: serverPart?.type || 'text',
                sessionID: (serverPart as { sessionID?: string })?.sessionID || sessionId,
                messageID: (serverPart as { messageID?: string })?.messageID || messageId,
              } as Part;
              addStreamingPart(sessionId, messageId, enrichedPart, 'user');
            }
          }

          trackMessage(messageId, 'user_message_created_from_event', { partsCount: partsArray.length });
          break;
        }

        const existingMessage = getMessageFromStore(sessionId, messageId);
        const existingLen = computeTextLength(existingMessage?.parts || []);
        const existingStopMarker = (existingMessage?.info as { finish?: string } | undefined)?.finish === 'stop';

        const serverParts = (props as { parts?: unknown }).parts || (messageExt as { parts?: unknown }).parts;
        const partsArray = Array.isArray(serverParts) ? (serverParts as Part[]) : [];
        const hasParts = partsArray.length > 0;
        const timeObj = (messageExt as { time?: { completed?: number } }).time || {};
        const completedFromServer = typeof timeObj?.completed === 'number';

        if (!hasParts && !completedFromServer) break;

        const finishCandidate = (message as { finish?: unknown }).finish;
        const finish = typeof finishCandidate === 'string' ? finishCandidate : null;
        const eventHasStopFinish = finish === 'stop';

        if ((messageExt as { role?: unknown }).role === 'assistant' && hasParts) {
          const incomingLen = computeTextLength(partsArray);
          const wouldShrink = existingLen > 0 && incomingLen + TEXT_SHRINK_TOLERANCE < existingLen;

          if (wouldShrink && !eventHasStopFinish) {
            trackMessage(messageId, 'skipped_shrinking_update', { incomingLen, existingLen });
            break;
          }

          if (isDesktopRuntimeRef.current) {
            const zeroToleranceShrink = existingLen > 0 && incomingLen < existingLen;
            const hasUsefulText = partsArray.some((p) => {
              if (!p || p.type !== 'text') return false;
              const textPart = p as { text?: string };
              return typeof textPart.text === 'string' && textPart.text.length > 0;
            });
            const shrinkAllowed = eventHasStopFinish && hasUsefulText;

            if (zeroToleranceShrink && !shrinkAllowed) {
              trackMessage(messageId, 'desktop_shrinking_update_suppressed', { incomingLen, existingLen });
              break;
            }
          }
        }

        updateMessageInfo(sessionId, messageId, message as unknown as Message);

        if (hasParts && (messageExt as { role?: unknown }).role !== 'user') {
          const storeState = useSessionStore.getState();
          const existingMessages = storeState.messages.get(sessionId) || [];
          const existingMessageForSession = existingMessages.find((m) => m.info.id === messageId);
          const needsInjection = !existingMessageForSession || existingMessageForSession.parts.length === 0;

          trackMessage(
            messageId,
            needsInjection ? 'server_parts_injected' : 'server_parts_refreshed',
            { count: partsArray.length }
          );

          const partsToInject = isDesktopRuntimeRef.current && (messageExt as { role?: unknown }).role === 'assistant'
            ? partsArray.filter((serverPart) => serverPart?.type !== 'text')
            : partsArray;

          for (let i = 0; i < partsToInject.length; i++) {
            const serverPart = partsToInject[i];
            const enrichedPart: Part = {
              ...serverPart,
              type: serverPart?.type || 'text',
              sessionID: serverPart?.sessionID || sessionId,
              messageID: serverPart?.messageID || messageId,
            } as Part;
            addStreamingPart(sessionId, messageId, enrichedPart, (messageExt as { role?: string }).role as string);
            trackMessage(messageId, `server_part_${i}`);
          }
        }

        const messageTime = (message as { time?: { completed?: unknown } }).time;
        const completedCandidate = (messageTime as { completed?: unknown } | undefined)?.completed;
        const hasCompletedTimestamp = typeof completedCandidate === 'number' && Number.isFinite(completedCandidate);

        const stopMarkerPresent = finish === 'stop' || existingStopMarker;

        const shouldFinalizeAssistantMessage =
          (message as { role?: string }).role === 'assistant' &&
          (hasCompletedTimestamp || stopMarkerPresent);

          if (shouldFinalizeAssistantMessage && (message as { role?: string }).role === 'assistant') {

            const storeState = useSessionStore.getState();
            const sessionMessages = storeState.messages.get(sessionId) || [];
          let latestAssistantMessageId: string | null = null;
          let maxId = '';

          for (let i = 0; i < sessionMessages.length; i++) {
            const msg = sessionMessages[i];
            if (msg.info.role === 'assistant' && msg.info.id > maxId) {
              maxId = msg.info.id;
              latestAssistantMessageId = msg.info.id;
            }
          }

          if (messageId !== latestAssistantMessageId) break;

          if (!stopMarkerPresent && isDesktopRuntimeRef.current) {
            trackMessage(messageId, 'desktop_completion_without_stop');
            break;
          }

          const timeCompleted =
            hasCompletedTimestamp
              ? (completedCandidate as number)
              : Date.now();

          if (!hasCompletedTimestamp) {
            updateMessageInfo(sessionId, messageId, {
              ...message,
              time: { ...(messageTime ?? {}), completed: timeCompleted },
            } as unknown as Message);
          }

          trackMessage(messageId, 'completed', { timeCompleted });
          reportMessage(messageId);

          void saveSessionCursor(sessionId, messageId, timeCompleted);

          if (ENABLE_EMPTY_RESPONSE_DETECTION) {
            const completedMessage = getMessageFromStore(sessionId, messageId);
            if (completedMessage) {
              const storedParts = Array.isArray(completedMessage.parts) ? completedMessage.parts : [];
              const eventParts = partsArray;

              const combinedParts: Part[] = [...storedParts];
              for (let i = 0; i < eventParts.length; i++) {
                const rawPart = eventParts[i];
                if (!rawPart) continue;

                const normalized: Part = {
                  ...rawPart,
                  type: (rawPart as { type?: string }).type || 'text',
                } as Part;

                const alreadyPresent = combinedParts.some(
                  (existing) =>
                    existing.id === normalized.id &&
                    existing.type === normalized.type &&
                    (existing as { callID?: string }).callID === (normalized as { callID?: string }).callID
                );

                if (!alreadyPresent) {
                  combinedParts.push(normalized);
                }
              }

              let hasStepMarkers = false;
              let hasTextContent = false;
              let hasTools = false;
              let hasReasoning = false;
              let hasFiles = false;

              for (let i = 0; i < combinedParts.length; i++) {
                const part = combinedParts[i];
                if (!part) continue;

                if (part.type === 'step-start' || part.type === 'step-finish') {
                  hasStepMarkers = true;
                } else if (part.type === 'text') {
                  const text = (part as { text?: string }).text;
                  if (typeof text === 'string' && text.trim().length > 0) {
                    hasTextContent = true;
                  }
                } else if (part.type === 'tool') {
                  hasTools = true;
                } else if (part.type === 'reasoning') {
                  hasReasoning = true;
                } else if (part.type === 'file') {
                  hasFiles = true;
                }
              }

              const hasMeaningfulContent = hasTextContent || hasTools || hasReasoning || hasFiles;
              const isEmptyResponse = !hasMeaningfulContent && !hasStepMarkers;

              if (isEmptyResponse && !emptyResponseToastShownRef.current.has(messageId)) {
                emptyResponseToastShownRef.current.add(messageId);
                import('sonner').then(({ toast }) => {
                  toast.info('Assistant response was empty', {
                    description: 'Try sending your message again or rephrase it.',
                    duration: 5000,
                  });
                });
              }
            }
          }

	          completeStreamingMessage(sessionId, messageId);

	          // For web/vscode: trigger cooldown only when assistant message has finish === "stop"
	          // to match desktop backend semantics.
	          if (!isDesktopRuntimeRef.current) {
	            if (finish === 'stop') {
	              const currentPhase = useSessionStore.getState().sessionActivityPhase?.get(sessionId);
	              if (currentPhase === 'busy') {
	                updateSessionActivityPhase(sessionId, 'cooldown');
	              }
	            }
	          }

	          const rawMessageSessionId = (message as { sessionID?: string }).sessionID;
	          const messageSessionId: string =
	            typeof rawMessageSessionId === 'string' && rawMessageSessionId.length > 0
              ? rawMessageSessionId
              : sessionId;
          requestSessionMetadataRefresh(messageSessionId);

          const summaryInfo = message as Message & { summary?: boolean };
          if (summaryInfo.summary && typeof messageSessionId === 'string') {
            updateSessionCompaction(messageSessionId, null);
          }
        }
        break;
      }

      case 'session.updated': {
        const candidate = (typeof props.info === 'object' && props.info !== null) ? props.info as Record<string, unknown> :
                         (typeof props.sessionInfo === 'object' && props.sessionInfo !== null) ? props.sessionInfo as Record<string, unknown> :
                         (typeof props.session === 'object' && props.session !== null) ? props.session as Record<string, unknown> : props;

        const sessionId = (typeof candidate.id === 'string' && candidate.id.length > 0) ? candidate.id :
                         (typeof candidate.sessionID === 'string' && candidate.sessionID.length > 0) ? candidate.sessionID :
                         (typeof props.sessionID === 'string' && props.sessionID.length > 0) ? props.sessionID :
                         (typeof props.id === 'string' && props.id.length > 0) ? props.id : undefined;

        if (sessionId) {
          const timeSource = (typeof candidate.time === 'object' && candidate.time !== null) ? candidate.time as Record<string, unknown> :
                            (typeof props.time === 'object' && props.time !== null) ? props.time as Record<string, unknown> : null;
          const compactingTimestamp = timeSource && typeof timeSource.compacting === 'number' ? timeSource.compacting as number : null;
          updateSessionCompaction(sessionId, compactingTimestamp);
        }
        break;
      }

      case 'session.abort': {
        const sessionId =
          typeof props.sessionID === 'string' && (props.sessionID as string).length > 0
            ? (props.sessionID as string)
            : null;
        const messageId =
          typeof props.messageID === 'string' && (props.messageID as string).length > 0
            ? (props.messageID as string)
            : null;

        if (sessionId && messageId) {
          completeStreamingMessage(sessionId, messageId);
        }
        break;
      }

      case 'permission.updated':
        if (currentSessionId === props.sessionID) {
          addPermission(props as unknown as Permission);
        }
        break;

      case 'permission.asked':
        // New permission system from OpenCode's PermissionNext
        if ('sessionID' in props && props.sessionID === currentSessionId) {
          const askedProps = props as {
            id: string;
            permission: string;
            sessionID: string;
            patterns?: string[];
            always?: string[];
            metadata: Record<string, unknown>;
            tool?: {
              messageID: string;
              callID: string;
            };
          };

          // Convert new permission.asked event format to Permission type
          const permission = {
            id: askedProps.id,
            type: askedProps.permission,
            pattern: askedProps.patterns, // Map patterns to pattern field for compatibility
            sessionID: askedProps.sessionID,
            messageID: askedProps.tool?.messageID || askedProps.sessionID,
            callID: askedProps.tool?.callID,
            title: `${askedProps.permission} permission required`,
            metadata: {
              ...askedProps.metadata,
              always: askedProps.always, // Store always in metadata for UI access
              patterns: askedProps.patterns,
            },
            time: { created: Date.now() },
          } as unknown as Permission;
          addPermission(permission);
        }
        break;

      case 'permission.replied':
        // Permission was responded to - UI will update via permissionStore
        break;

      case 'todo.updated': {
        const sessionId = typeof props.sessionID === 'string' ? props.sessionID : null;
        const todos = Array.isArray(props.todos) ? props.todos : [];
        if (sessionId && todos.length > 0) {
          handleTodoUpdatedEvent(
            sessionId,
            todos as Array<{ id: string; content: string; status: string; priority: string }>
          );
        }
        break;
      }
    }
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
    trackMessage,
    reportMessage,
    updateSessionActivityPhase,
    bootstrapState
  ]);

  const shouldHoldConnection = React.useCallback(() => {
    const currentVisibility = resolveVisibilityState();
    visibilityStateRef.current = currentVisibility;
    return currentVisibility === 'visible' && onlineStatusRef.current;
  }, [resolveVisibilityState]);

  const debugConnectionState = React.useCallback(() => {
    if (streamDebugEnabled()) {
      console.debug('[useEventStream] Connection state:', {
        isDesktopRuntime: isDesktopRuntimeRef.current,
        hasUnsubscribe: Boolean(unsubscribeRef.current),
        currentSessionId: currentSessionIdRef.current,
        effectiveDirectory,
        onlineStatus: onlineStatusRef.current,
        visibilityState: visibilityStateRef.current,
        lastEventTimestamp: lastEventTimestampRef.current,
        reconnectAttempts: reconnectAttemptsRef.current,
      });
    }
  }, [effectiveDirectory]);

  const waitForDesktopBridge = React.useCallback(async (): Promise<boolean> => true, []);

  const stopStream = React.useCallback(() => {
    if (isCleaningUpRef.current) {
      if (streamDebugEnabled()) {
        console.info('[useEventStream] Already cleaning up, skipping stopStream');
      }
      return;
    }

    isCleaningUpRef.current = true;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (unsubscribeRef.current) {
      const unsubscribe = unsubscribeRef.current;
      unsubscribeRef.current = null;
      try {

        unsubscribe();
      } catch (error) {
        console.warn('[useEventStream] Error during unsubscribe:', error);
      }
    }

    isCleaningUpRef.current = false;
  }, []);

  const startStream = React.useCallback(async (options?: { resetAttempts?: boolean }) => {
    debugConnectionState();

    if (!shouldHoldConnection()) {
      pendingResumeRef.current = true;
      if (!onlineStatusRef.current) {
        publishStatus('offline', 'Waiting for network');
      } else {
        publishStatus('paused', 'Paused while hidden');
      }
      return;
    }

    if (isDesktopRuntimeRef.current) {
      const bridgeReady = await waitForDesktopBridge();
      if (!bridgeReady) {
        console.warn('[useEventStream] Desktop bridge not ready, falling back to SDK');
      }
    }

    if (options?.resetAttempts) {
      reconnectAttemptsRef.current = 0;
    }

    stopStream();
    lastEventTimestampRef.current = Date.now();
    publishStatus('connecting', null);

    if (streamDebugEnabled()) {
      console.info('[useEventStream] Starting event stream...');
    }

    const onError = (error: unknown) => {
      console.warn('Event stream error:', error);

    };

    const onOpen = () => {
      const shouldRefresh = pendingResumeRef.current;
      reconnectAttemptsRef.current = 0;
      pendingResumeRef.current = false;
      lastEventTimestampRef.current = Date.now();
      publishStatus('connected', null);
      checkConnection();

      const hasBusySessions = Array.from(useSessionStore.getState().sessionActivityPhase?.values?.() ?? []).some(
        (phase) => phase === 'busy'
      );
      if (hasBusySessions) {
        void refreshSessionActivityStatus();
      }

      if (shouldRefresh) {
        void bootstrapState('sse_reconnected');
      } else {
        const sessionId = currentSessionIdRef.current;
        if (sessionId) {
          setTimeout(() => {
            resyncMessages(sessionId, 'sse_reconnected')
              .then(() => requestSessionMetadataRefresh(sessionId))
              .catch((error) => {
                console.warn('[useEventStream] Failed to resync messages after reconnect:', error);
              });
          }, 0);
        }
      }
    };

    if (streamDebugEnabled()) {
      console.info('[useEventStream] Connecting to event source (SDK SSE only):', {
        effectiveDirectory,
        isCleaningUp: isCleaningUpRef.current,
      });
    }

    if (isCleaningUpRef.current) {
      if (streamDebugEnabled()) {
        console.info('[useEventStream] Skipping subscription due to cleanup in progress');
      }
      return;
    }

    try {
      const sdkUnsub = opencodeClient.subscribeToEvents(handleEvent, onError, onOpen, effectiveDirectory);

      const compositeUnsub = () => {
        try {
          sdkUnsub();
        } catch (cleanupError) {
          console.warn('[useEventStream] Error during unsubscribe:', cleanupError);
        }
      };

      if (!isCleaningUpRef.current) {
        unsubscribeRef.current = compositeUnsub;
      } else {
        compositeUnsub();
      }
    } catch (subscriptionError) {
      console.error('[useEventStream] Error during subscription:', subscriptionError);
      onError(subscriptionError);
    }
  }, [
    shouldHoldConnection,
    stopStream,
    publishStatus,
    checkConnection,
    resyncMessages,
    requestSessionMetadataRefresh,
    handleEvent,
    effectiveDirectory,
    refreshSessionActivityStatus,
    waitForDesktopBridge,
    debugConnectionState,
    bootstrapState
  ]);

  const scheduleReconnect = React.useCallback((hint?: string) => {
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

    const baseDelay = nextAttempt <= 3
      ? Math.min(1000 * Math.pow(2, nextAttempt - 1), 8000)
      : Math.min(2000 * Math.pow(2, nextAttempt - 3), 32000);
    const jitter = Math.floor(Math.random() * 250);
    const delay = baseDelay + jitter;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      startStream({ resetAttempts: false });
    }, delay);
  }, [shouldHoldConnection, stopStream, publishStatus, startStream]);

  React.useEffect(() => {
    const cooldownTimers = sessionCooldownTimersRef.current;

    if (typeof window !== 'undefined') {
      window.__messageTracker = trackMessage;
    }

    let desktopActivityHandler: ((event: CustomEvent<{ sessionId?: string; phase?: string }>) => void) | null = null;
    if (isDesktopRuntimeRef.current && typeof window !== 'undefined') {
      desktopActivityHandler = (event: CustomEvent<{ sessionId?: string; phase?: string }>) => {
        const sessionId = typeof event.detail?.sessionId === 'string' ? event.detail.sessionId : null;
        const phase = typeof event.detail?.phase === 'string' ? event.detail.phase : null;
        if (sessionId && (phase === 'idle' || phase === 'busy' || phase === 'cooldown')) {
          updateSessionActivityPhase(sessionId, phase);
          // Refresh session list on activity changes (same trigger as activity indication)
          requestSessionListRefresh();
        }
      };
      window.addEventListener('openchamber:session-activity', desktopActivityHandler as EventListener);
    }

    const clearPauseTimeout = () => {
      if (pauseTimeoutRef.current) {
        clearTimeout(pauseTimeoutRef.current);
        pauseTimeoutRef.current = null;
      }
    };

    const pauseStreamSoon = () => {
      if (pauseTimeoutRef.current) return;

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
      maybeBootstrapIfStale('visibility_restore');
      if (pendingResumeRef.current || !unsubscribeRef.current) {
        console.info('[useEventStream] Visibility restored, triggering soft refresh...');
        const sessionId = currentSessionIdRef.current;
          if (sessionId) {
            resyncMessages(sessionId, 'visibility_restore').catch(() => {});
            requestSessionMetadataRefresh(sessionId);
          }

        void loadSessions();
        void refreshSessionActivityStatus();
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
      maybeBootstrapIfStale('window_focus');

      if (pendingResumeRef.current || !unsubscribeRef.current) {
        console.info('[useEventStream] Window focused after pause, triggering soft refresh...');
          const sessionId = currentSessionIdRef.current;
          if (sessionId) {
            requestSessionMetadataRefresh(sessionId);
            resyncMessages(sessionId, 'window_focus')
              .then(() => console.info('[useEventStream] Messages refreshed on focus'))
              .catch((err) => console.warn('[useEventStream] Failed to refresh messages:', err));
          }
          void loadSessions();
          void refreshSessionActivityStatus();

          publishStatus('connecting', 'Resuming stream');
          startStream({ resetAttempts: true });
        }
      }
    };

    const handleOnline = () => {
      onlineStatusRef.current = true;
      maybeBootstrapIfStale('network_restored');
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

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
      window.addEventListener('focus', handleWindowFocus);
    }

    const startTimer = setTimeout(() => {
      startStream({ resetAttempts: true });
    }, 100);

    if (staleCheckIntervalRef.current) {
      clearInterval(staleCheckIntervalRef.current);
    }

    staleCheckIntervalRef.current = setInterval(() => {
      if (!shouldHoldConnection()) return;

      const now = Date.now();
      const hasBusySessions = Array.from(useSessionStore.getState().sessionActivityPhase?.values?.() ?? []).some(
        (phase) => phase === 'busy'
      );
      if (hasBusySessions) {
        void refreshSessionActivityStatus();
      }
      if (now - lastEventTimestampRef.current > 25000) {
        Promise.resolve().then(async () => {
          try {
            const healthy = await opencodeClient.checkHealth();
            if (!healthy) {
              scheduleReconnect('Refreshing stalled stream');
            } else {
              lastEventTimestampRef.current = Date.now();
            }
          } catch (error) {
            console.warn('Health check after stale stream failed:', error);
            scheduleReconnect('Refreshing stalled stream');
          }
        });
      }
    }, 10000);

    return () => {
      clearTimeout(startTimer);

      if (desktopActivityHandler && typeof window !== 'undefined') {
        window.removeEventListener('openchamber:session-activity', desktopActivityHandler as EventListener);
      }

      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }

      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
        window.removeEventListener('focus', handleWindowFocus);
      }

      clearPauseTimeout();

      if (staleCheckIntervalRef.current) {
        clearInterval(staleCheckIntervalRef.current);
        staleCheckIntervalRef.current = null;
      }

      cooldownTimers.forEach((timer) => clearTimeout(timer));
      cooldownTimers.clear();
      messageCache.clear();

      pendingResumeRef.current = false;
      visibilityStateRef.current = resolveVisibilityState();
      onlineStatusRef.current = typeof navigator === 'undefined' ? true : navigator.onLine;

      stopStream();

      if (sessionRefreshTimeoutRef.current) {
        clearTimeout(sessionRefreshTimeoutRef.current);
        sessionRefreshTimeoutRef.current = null;
      }

      publishStatus('idle', null);
    };
  }, [
    effectiveDirectory,
    trackMessage,
    resolveVisibilityState,
    stopStream,
    publishStatus,
    startStream,
    scheduleReconnect,
    loadMessages,
    requestSessionMetadataRefresh,
    requestSessionListRefresh,
    updateSessionActivityPhase,
    refreshSessionActivityStatus,
    shouldHoldConnection,
    loadSessions,
    maybeBootstrapIfStale,
    resyncMessages
  ]);
};
