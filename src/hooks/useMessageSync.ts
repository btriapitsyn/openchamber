import React from 'react';
import { useSessionStore, MEMORY_LIMITS } from '@/stores/useSessionStore';
import { opencodeClient } from '@/lib/opencode/client';

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
      const currentMessages = messages.get(currentSessionId) || [];
      
      // Quick check - just get message count first
      const latestMessages = await opencodeClient.getSessionMessages(currentSessionId);
      
      if (!latestMessages) return;
      
      // Find the last message we have locally
      const lastLocalMessage = currentMessages[currentMessages.length - 1];
      
      if (lastLocalMessage) {
        // Find this message in the latest messages
        const lastLocalIndex = latestMessages.findIndex(m => m.info.id === lastLocalMessage.info.id);
        
        if (lastLocalIndex !== -1) {
          // Check if there are new messages after our last one
          if (lastLocalIndex < latestMessages.length - 1) {
            // There are new messages after our last one
            const newMessages = latestMessages.slice(lastLocalIndex + 1);
            console.log(`🔄 Sync: Found ${newMessages.length} new messages to append`);
            
            // Append only the new messages
            const updatedMessages = [...currentMessages, ...newMessages];
            const { syncMessages } = useSessionStore.getState();
            syncMessages(currentSessionId, updatedMessages);
          } else {
            // Check if the last message itself was updated (e.g., streaming completed)
            const serverLastMessage = latestMessages[lastLocalIndex];
            const localLastMessage = currentMessages[currentMessages.length - 1];

            // Check if completion status changed
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const serverCompleted = (serverLastMessage.info as any).time?.completed;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localCompleted = (localLastMessage.info as any).time?.completed;
            
            if (serverCompleted && !localCompleted) {
              console.log('🔄 Sync: Last message completed on server');
              // Update just the last message
              const updatedMessages = [...currentMessages.slice(0, -1), serverLastMessage];
              const { syncMessages } = useSessionStore.getState();
              syncMessages(currentSessionId, updatedMessages);
            }
          }
        } else {
          // Our messages might be out of sync (e.g., messages were deleted)
          console.log('🔄 Sync: Local messages not found in server - skipping sync');
          // Don't sync to avoid losing local state or scroll position
        }
      } else if (latestMessages.length > 0) {
        // We have no messages locally but server has some
        // This might be initial load, so take only recent messages
        const messagesToLoad = latestMessages.slice(-MEMORY_LIMITS.VIEWPORT_MESSAGES);
        console.log(`🔄 Sync: Loading last ${messagesToLoad.length} messages`);
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
      console.log('👁️ Window focused - checking for updates');
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
        console.log('👁️ Tab became visible - checking for updates');
        syncMessages();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [syncMessages]);
};