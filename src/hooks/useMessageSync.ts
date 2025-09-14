import React from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
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
      
      // Only process if counts differ or last messages differ
      if (latestMessages.length !== currentMessages.length) {
        console.log(`🔄 Sync: Found ${latestMessages.length - currentMessages.length} new messages`);
        
        // Update store with new messages
        useSessionStore.setState((state) => {
          const newMessagesMap = new Map(state.messages);
          newMessagesMap.set(currentSessionId, latestMessages);
          return { messages: newMessagesMap };
        });
      } else if (latestMessages.length > 0 && currentMessages.length > 0) {
        // Check if last message is different (might be updated)
        const latestLast = latestMessages[latestMessages.length - 1];
        const currentLast = currentMessages[currentMessages.length - 1];
        
        if (latestLast.info.id !== currentLast.info.id || 
            (latestLast.info as any).time?.completed !== (currentLast.info as any).time?.completed) {
          console.log('🔄 Sync: Message update detected');
          
          useSessionStore.setState((state) => {
            const newMessagesMap = new Map(state.messages);
            newMessagesMap.set(currentSessionId, latestMessages);
            return { messages: newMessagesMap };
          });
        }
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