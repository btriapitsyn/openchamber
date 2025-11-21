import React from 'react';
import type { AssistantMessage, Message, Part } from '@opencode-ai/sdk';
import { useSessionStore, MEMORY_LIMITS } from '@/stores/useSessionStore';
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
  const clientRole = (info as any).clientRole;
  if (clientRole === 'user') return true;
  return Boolean((info as any).userMessageMarker);
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

/**
 * Lightweight message synchronization hook for cross-client session continuity.
 * 
 * Strategy:
 * 1. Sync on window focus (user likely switched from TUI)
 * 2. Light background sync every 30 seconds when window is visible
 * 3. No sync when window is hidden or during streaming
 * 4. Compare message counts before fetching full data
 */
export const useMessageSync = () => {
  const { 
    currentSessionId, 
    messages,
    streamingMessageId 
  } = useSessionStore();
  
  const syncTimeoutRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const lastSyncRef = React.useRef<number>(0);
  
  const syncMessages = React.useCallback(async () => {
    if (!currentSessionId) return;
    if (streamingMessageId) return; // Skip during active streaming
    
    // Throttle syncs to no more than once per 2 seconds
    const now = Date.now();
    if (now - lastSyncRef.current < 2000) return;
    lastSyncRef.current = now;
    
    try {
      // Get current messages from store
      const currentMessages = (messages.get(currentSessionId) || []) as SessionMessageRecord[];
      
      // Quick check - just get message count first
      const latestMessages = (await opencodeClient.getSessionMessages(currentSessionId)) as SessionMessageRecord[];
      const cursorRecord = await readSessionCursor(currentSessionId);
      
      if (!latestMessages) return;
      
      // Find the last message we have locally
      const lastLocalMessage = currentMessages[currentMessages.length - 1];
      
      if (lastLocalMessage) {
        const directIndex = latestMessages.findIndex((m) => m.info.id === lastLocalMessage.info.id);
        const fuzzyIndex =
          directIndex === -1
            ? findServerIndexForLocalUserMessage(lastLocalMessage, latestMessages)
            : directIndex;
        const lastLocalIndex = fuzzyIndex;

        if (lastLocalIndex !== -1) {
          // Check if there are new messages after our last one
          if (lastLocalIndex < latestMessages.length - 1) {
            const newMessages = latestMessages.slice(lastLocalIndex + 1);
            console.log(`[SYNC] Found ${newMessages.length} new messages to append`);
            
            // Append only the new messages
            const updatedMessages = [...currentMessages, ...newMessages];
            const { syncMessages } = useSessionStore.getState();
            syncMessages(currentSessionId, updatedMessages);
          } else {
            // Check if the last message itself was updated (e.g., streaming completed)
            const serverLastMessage = latestMessages[lastLocalIndex];
            const localLastMessage = currentMessages[currentMessages.length - 1];

            // Check if completion status changed
            const serverCompleted = getCompletionTimestamp(serverLastMessage);
            const localCompleted = getCompletionTimestamp(localLastMessage);
            
            if (serverCompleted && !localCompleted) {
              console.log('[SYNC] Last message completed on server');
              // Update just the last message
              const updatedMessages = [...currentMessages.slice(0, -1), serverLastMessage];
              const { syncMessages } = useSessionStore.getState();
              syncMessages(currentSessionId, updatedMessages);
            }
          }
        } else {
          // Fallback: if the last local user message no longer matches by ID, force a bounded merge for deduplication
          if (isUserMessageInfo(lastLocalMessage.info)) {
            const messagesToLoad = latestMessages.slice(-MEMORY_LIMITS.VIEWPORT_MESSAGES);
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
            const limited = newMessages.slice(-MEMORY_LIMITS.VIEWPORT_MESSAGES);
            if (limited.length > 0) {
              console.log(`[SYNC] Restoring ${limited.length} messages after cursor`);
              const { syncMessages } = useSessionStore.getState();
              syncMessages(currentSessionId, limited);
            }
          }
        } else if (latestMessages.length > 0) {
          console.log('[SYNC] Cursor not found on server response, loading recent messages');
          const messagesToLoad = latestMessages.slice(-MEMORY_LIMITS.VIEWPORT_MESSAGES);
          const { syncMessages } = useSessionStore.getState();
          syncMessages(currentSessionId, messagesToLoad);
        }
      } else if (latestMessages.length > 0) {
        // We have no messages locally but server has some
        // This might be initial load, so take only recent messages
        const messagesToLoad = latestMessages.slice(-MEMORY_LIMITS.VIEWPORT_MESSAGES);
        console.log(`[SYNC] Loading last ${messagesToLoad.length} messages`);
        const { syncMessages } = useSessionStore.getState();
        syncMessages(currentSessionId, messagesToLoad);
      }
    } catch (error) {
      // Silent fail - background sync shouldn't interrupt user
      console.debug('Background sync failed:', error);
    }
  }, [currentSessionId, messages, streamingMessageId]);
  
  // Sync on window focus (main sync trigger)
  React.useEffect(() => {
    const handleFocus = () => {
      console.log('[FOCUS] Window focused - checking for updates');
      syncMessages();
    };
    
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [syncMessages]);
  
  // Light background sync only when visible
  React.useEffect(() => {
    if (!currentSessionId || streamingMessageId) return;
    
    const scheduleSync = () => {
      // Only sync if document is visible
      if (document.visibilityState === 'visible') {
        syncMessages();
      }
      
      // Schedule next sync
      syncTimeoutRef.current = setTimeout(scheduleSync, 30000); // 30 seconds
    };
    
    // Start background sync
    syncTimeoutRef.current = setTimeout(scheduleSync, 30000);
    
    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [currentSessionId, streamingMessageId, syncMessages]);
  
  // Sync when visibility changes to visible
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
