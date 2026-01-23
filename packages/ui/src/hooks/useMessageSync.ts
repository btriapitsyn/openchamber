import React from 'react';
import type { AssistantMessage, Message, Part } from '@opencode-ai/sdk/v2';
import { useSessionStore } from '@/stores/useSessionStore';
import { getMemoryLimits } from '@/stores/types/sessionTypes';
import { opencodeClient } from '@/lib/opencode/client';
import { readSessionCursor } from '@/lib/messageCursorPersistence';
import { extractTextFromPart } from '@/stores/utils/messageUtils';

type SessionMessageRecord = { info: Message; parts: Part[] };

const isAssistantMessage = (message: Message): message is AssistantMessage => message.role === 'assistant';

const getCompletionTimestamp = (record: { info: Message }): number | undefined => {
  const message = record.info;
  if (!isAssistantMessage(message)) {
    return undefined;
  }
  const completed = message.time?.completed;
  return typeof completed === 'number' ? completed : undefined;
};

const isUserMessageInfo = (info?: Message): boolean => {
  if (!info) return false;
  if (info.role === 'user') return true;
  const infoExt = info as { clientRole?: string; userMessageMarker?: boolean };
  if (infoExt.clientRole === 'user') return true;
  return Boolean(infoExt.userMessageMarker);
};

const normalizeMessageText = (message?: SessionMessageRecord): string => {
  const parts = Array.isArray(message?.parts) ? message.parts : [];
  const raw = parts
    .map((part) => extractTextFromPart(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return raw;
};

const findServerIndexForLocalUserMessage = (
  localMessage: SessionMessageRecord | undefined,
  serverMessages: SessionMessageRecord[]
): number => {
  if (!localMessage || !isUserMessageInfo(localMessage.info)) {
    return -1;
  }

  const localText = normalizeMessageText(localMessage);
  const localCreated =
    typeof localMessage.info?.time?.created === 'number' ? localMessage.info.time.created : undefined;

  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;

  serverMessages.forEach((candidate, index) => {
    if (!isUserMessageInfo(candidate.info)) {
      return;
    }

    const candidateText = normalizeMessageText(candidate);
    const textMatches = Boolean(localText && candidateText && candidateText === localText);
    const candidateCreated =
      typeof candidate.info?.time?.created === 'number' ? candidate.info.time.created : undefined;
    const timeDelta =
      typeof localCreated === 'number' && typeof candidateCreated === 'number'
        ? Math.abs(candidateCreated - localCreated)
        : null;

    if (textMatches) {
      const score = typeof timeDelta === 'number' ? timeDelta : 0;
      if (score < bestScore) {
        bestIndex = index;
        bestScore = score;
      }
      return;
    }

    if (!localText && !candidateText && typeof timeDelta === 'number' && timeDelta < 1500 && timeDelta < bestScore) {
      bestIndex = index;
      bestScore = timeDelta;
    }
  });

  if (bestIndex !== -1) {
    return bestIndex;
  }

  if (typeof localCreated === 'number') {
    return serverMessages.findIndex((candidate) => {
      if (!isUserMessageInfo(candidate.info)) return false;
      const candidateCreated =
        typeof candidate.info?.time?.created === 'number' ? candidate.info.time.created : undefined;
      if (typeof candidateCreated !== 'number') return false;
      return Math.abs(candidateCreated - localCreated) < 1000;
    });
  }

  return -1;
};

export const useMessageSync = () => {
  const {
    currentSessionId,
    messages,
    streamingMessageIds
  } = useSessionStore();

  const streamingMessageId = React.useMemo(() => {
    if (!currentSessionId) return null;
    return streamingMessageIds.get(currentSessionId) ?? null;
  }, [currentSessionId, streamingMessageIds]);

  const syncTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSyncRef = React.useRef<number>(0);

  const syncMessages = React.useCallback(async () => {
    if (!currentSessionId) return;
    if (streamingMessageId) return;

    const now = Date.now();
    if (now - lastSyncRef.current < 2000) return;
    lastSyncRef.current = now;

    try {

      const currentMessages = (messages.get(currentSessionId) || []) as SessionMessageRecord[];

      const memoryState = useSessionStore.getState().sessionMemoryState.get(currentSessionId);
      const memLimits = getMemoryLimits();
      const targetLimit = memoryState?.isStreaming ? memLimits.VIEWPORT_MESSAGES : memLimits.HISTORICAL_MESSAGES;
      const fetchLimit = targetLimit + memLimits.FETCH_BUFFER;
      const latestMessages = (await opencodeClient.getSessionMessages(currentSessionId, fetchLimit)) as SessionMessageRecord[];
      const cursorRecord = await readSessionCursor(currentSessionId);

      if (!latestMessages) return;

      const lastLocalMessage = currentMessages[currentMessages.length - 1];

      if (lastLocalMessage) {
        const directIndex = latestMessages.findIndex((m) => m.info.id === lastLocalMessage.info.id);
        const fuzzyIndex =
          directIndex === -1
            ? findServerIndexForLocalUserMessage(lastLocalMessage, latestMessages)
            : directIndex;
        const lastLocalIndex = fuzzyIndex;

        if (lastLocalIndex !== -1) {

          if (lastLocalIndex < latestMessages.length - 1) {
            const newMessages = latestMessages.slice(lastLocalIndex + 1);
            console.log(`[SYNC] Found ${newMessages.length} new messages to append`);

            const updatedMessages = [...currentMessages, ...newMessages];
            const { syncMessages } = useSessionStore.getState();
            syncMessages(currentSessionId, updatedMessages);
          } else {

            const serverLastMessage = latestMessages[lastLocalIndex];
            const localLastMessage = currentMessages[currentMessages.length - 1];

            const serverCompleted = getCompletionTimestamp(serverLastMessage);
            const localCompleted = getCompletionTimestamp(localLastMessage);

            if (serverCompleted && !localCompleted) {
              console.log('[SYNC] Last message completed on server');

              const updatedMessages = [...currentMessages.slice(0, -1), serverLastMessage];
              const { syncMessages } = useSessionStore.getState();
              syncMessages(currentSessionId, updatedMessages);
            }
          }
        } else {

          if (isUserMessageInfo(lastLocalMessage.info)) {
            const messagesToLoad = latestMessages.slice(-targetLimit);
            console.log('[SYNC] Local user message missing by ID; merging latest messages for deduplication');
            const { syncMessages } = useSessionStore.getState();
            syncMessages(currentSessionId, messagesToLoad);
          } else {
            console.log('[SYNC] Local messages not found on server - skipping sync');
          }
        }
      } else if (cursorRecord) {
        const cursorIndex = latestMessages.findIndex(m => m.info.id === cursorRecord.messageId);

        if (cursorIndex !== -1) {
          if (cursorIndex < latestMessages.length - 1) {
            const newMessages = latestMessages.slice(cursorIndex + 1);
            const limited = newMessages.slice(-targetLimit);
            if (limited.length > 0) {
              console.log(`[SYNC] Restoring ${limited.length} messages after cursor`);
              const { syncMessages } = useSessionStore.getState();
              syncMessages(currentSessionId, limited);
            }
          }
        } else if (latestMessages.length > 0) {
          console.log('[SYNC] Cursor not found on server response, loading recent messages');
          const messagesToLoad = latestMessages.slice(-targetLimit);
          const { syncMessages } = useSessionStore.getState();
          syncMessages(currentSessionId, messagesToLoad);
        }
      } else if (latestMessages.length > 0) {

        const messagesToLoad = latestMessages.slice(-targetLimit);
        console.log(`[SYNC] Loading last ${messagesToLoad.length} messages`);
        const { syncMessages } = useSessionStore.getState();
        syncMessages(currentSessionId, messagesToLoad);
      }
    } catch (error) {

      console.debug('Background sync failed:', error);
    }
  }, [currentSessionId, messages, streamingMessageId]);

  React.useEffect(() => {
    const handleFocus = () => {
      console.log('[FOCUS] Window focused - checking for updates');
      syncMessages();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncMessages]);

  React.useEffect(() => {
    if (!currentSessionId || streamingMessageId) return;

    const scheduleSync = () => {

      if (document.visibilityState === 'visible') {
        syncMessages();
      }

      syncTimeoutRef.current = setTimeout(scheduleSync, 30000);
    };

    syncTimeoutRef.current = setTimeout(scheduleSync, 30000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [currentSessionId, streamingMessageId, syncMessages]);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[FOCUS] Tab became visible - checking for updates');
        syncMessages();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncMessages]);
};
