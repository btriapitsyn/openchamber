import { useEffect, useRef, useCallback } from 'react';
import { useAutoReviewStore } from '@/stores/useAutoReviewStore';
import { useMessageStore } from '@/stores/messageStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { usePaneStore } from '@/stores/usePaneStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useContextStore } from '@/stores/contextStore';
import { toast } from 'sonner';

const DISPATCH_DEBOUNCE_MS = 3000;
const IDLE_CHECK_INTERVAL_MS = 5000;

export function useAutoReviewDispatch() {
  const lastDispatchRef = useRef<number>(0);
  const isDispatchingRef = useRef<boolean>(false);
  
  const enabled = useAutoReviewStore((state) => state.enabled);
  const getNextItem = useAutoReviewStore((state) => state.getNextItem);
  const markSent = useAutoReviewStore((state) => state.markSent);
  const generatePromptForItem = useAutoReviewStore((state) => state.generatePromptForItem);
  
  const sessionMemoryState = useMessageStore((state) => state.sessionMemoryState);
  const sendMessage = useSessionStore((state) => state.sendMessage);
  const sessions = useSessionStore((state) => state.sessions);
  
  const { currentProviderId, currentModelId, currentAgentName, currentVariant } = useConfigStore();
  const getSessionAgentSelection = useContextStore((state) => state.getSessionAgentSelection);
  const getAgentModelForSession = useContextStore((state) => state.getAgentModelForSession);
  const getAgentModelVariantForSession = useContextStore((state) => state.getAgentModelVariantForSession);
  
  const activeDirectory = useAutoReviewStore((state) => state.activeDirectory);

  const findIdleSession = useCallback(() => {
    if (!activeDirectory) return null;
    
    const worktreeId = activeDirectory;
    const paneState = usePaneStore.getState();
    const leftPane = paneState.getPaneState(worktreeId, 'left');
    
    const chatTabs = leftPane.tabs.filter((tab) => tab.type === 'chat' && tab.sessionId);
    
    for (const tab of chatTabs) {
      const sessionId = tab.sessionId;
      if (!sessionId) continue;
      
      const memoryState = sessionMemoryState.get(sessionId);
      const isStreaming = memoryState?.isStreaming ?? false;
      const cooldownUntil = memoryState?.streamingCooldownUntil ?? 0;
      const now = Date.now();
      
      if (!isStreaming && now > cooldownUntil) {
        return sessionId;
      }
    }
    
    return null;
  }, [activeDirectory, sessionMemoryState]);

  const dispatchToSession = useCallback(async (sessionId: string) => {
    if (isDispatchingRef.current) return false;
    
    const now = Date.now();
    if (now - lastDispatchRef.current < DISPATCH_DEBOUNCE_MS) {
      return false;
    }
    
    const nextItem = getNextItem();
    if (!nextItem) return false;
    
    isDispatchingRef.current = true;
    lastDispatchRef.current = now;
    
    try {
      const sessionAgent = getSessionAgentSelection(sessionId) || currentAgentName;
      const sessionModel = sessionAgent ? getAgentModelForSession(sessionId, sessionAgent) : null;
      const effectiveProviderId = sessionModel?.providerId || currentProviderId;
      const effectiveModelId = sessionModel?.modelId || currentModelId;
      
      if (!effectiveProviderId || !effectiveModelId) {
        console.warn('[AutoReview] No model configured, skipping dispatch');
        return false;
      }
      
      const effectiveVariant = sessionAgent && effectiveProviderId && effectiveModelId
        ? getAgentModelVariantForSession(sessionId, sessionAgent, effectiveProviderId, effectiveModelId) ?? currentVariant
        : currentVariant;
      
      const prompt = generatePromptForItem(nextItem);
      
      useSessionStore.getState().setCurrentSession(sessionId);
      
      await sendMessage(
        prompt,
        effectiveProviderId,
        effectiveModelId,
        sessionAgent,
        undefined,
        undefined,
        undefined,
        effectiveVariant
      );
      
      markSent(nextItem.id, nextItem.type);
      
      let itemLabel: string;
      if (nextItem.type === 'conflict') {
        itemLabel = 'Merge conflict';
      } else if (nextItem.type === 'check') {
        const checkData = nextItem.data as { name?: string; context?: string };
        itemLabel = `CI: ${checkData.name || checkData.context || 'Unknown'}`;
      } else {
        itemLabel = 'Review comment';
      }
      toast.success(`Auto-review: ${itemLabel}`, { duration: 2000 });
      
      return true;
    } catch (error) {
      console.error('[AutoReview] Dispatch failed:', error);
      toast.error('Auto-review dispatch failed');
      return false;
    } finally {
      isDispatchingRef.current = false;
    }
  }, [
    getNextItem, 
    markSent, 
    generatePromptForItem, 
    sendMessage,
    currentProviderId, 
    currentModelId, 
    currentAgentName, 
    currentVariant,
    getSessionAgentSelection,
    getAgentModelForSession,
    getAgentModelVariantForSession,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const checkAndDispatch = () => {
      const idleSession = findIdleSession();
      if (idleSession) {
        dispatchToSession(idleSession);
      }
    };

    const intervalId = setInterval(checkAndDispatch, IDLE_CHECK_INTERVAL_MS);
    
    checkAndDispatch();
    
    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, findIdleSession, dispatchToSession]);

  const prevMemoryStateRef = useRef<Map<string, { isStreaming: boolean }>>(new Map());

  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = useMessageStore.subscribe((state) => {
      const currentMemoryState = state.sessionMemoryState;
      const prevMemoryState = prevMemoryStateRef.current;

      for (const [sessionId, memState] of currentMemoryState) {
        const prevMemState = prevMemoryState.get(sessionId);
        
        if (prevMemState?.isStreaming && !memState.isStreaming) {
          setTimeout(() => {
            if (!useAutoReviewStore.getState().enabled) return;
            
            const latestMemState = useMessageStore.getState().sessionMemoryState.get(sessionId);
            if (!latestMemState?.isStreaming) {
              dispatchToSession(sessionId);
            }
          }, DISPATCH_DEBOUNCE_MS);
        }
      }

      const newPrevState = new Map<string, { isStreaming: boolean }>();
      for (const [sessionId, memState] of currentMemoryState) {
        newPrevState.set(sessionId, { isStreaming: memState.isStreaming });
      }
      prevMemoryStateRef.current = newPrevState;
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, dispatchToSession]);
}
