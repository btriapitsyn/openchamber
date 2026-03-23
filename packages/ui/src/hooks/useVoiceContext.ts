import { useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/useSessionStore';
import { voiceHooks, isVoiceSessionStarted } from '@/lib/voice';

/**
 * Hook that syncs session events (messages, permissions) to the voice agent.
 * Call this inside VoiceProvider to enable session awareness during voice.
 */
export function useVoiceContext() {
    const currentSessionId = useSessionStore((s) => s.currentSessionId);
    const messages = useSessionStore((s) => 
        currentSessionId ? s.messages.get(currentSessionId) : undefined
    );
    const permissions = useSessionStore((s) => 
        currentSessionId ? s.permissions.get(currentSessionId) : undefined
    );
    
    // Track last seen message count to only forward new messages
    const lastMessageCountRef = useRef(0);
    
    // Forward new messages to voice agent
    useEffect(() => {
        if (!currentSessionId || !messages || !isVoiceSessionStarted()) return;
        
        const currentCount = messages.length;
        if (currentCount <= lastMessageCountRef.current) return;
        
        // Get only new messages (messages since last check)
        const newMessages = messages.slice(lastMessageCountRef.current);
        lastMessageCountRef.current = currentCount;
        
        // Format for voice hooks (extract role and content)
        const formattedMessages = newMessages.map(m => ({
            role: m.info.role,
            content: m.parts.map(p => ('text' in p ? p.text : '')).join('')
        }));
        
        voiceHooks.onMessages(currentSessionId, formattedMessages);
    }, [currentSessionId, messages]);
    
    // Forward permission requests to voice agent
    useEffect(() => {
        if (!currentSessionId || !permissions || permissions.length === 0) return;
        if (!isVoiceSessionStarted()) return;
        
        const request = permissions[0];
        if (!request) return;
        
        voiceHooks.onPermissionRequested(
            currentSessionId,
            request.id,
            request.permission,
            request.metadata
        );
    }, [currentSessionId, permissions]);
    
    // Reset message count when session changes
    useEffect(() => {
        lastMessageCountRef.current = 0;
    }, [currentSessionId]);
}
