import { useCallback, useEffect } from 'react';
import { useConversation } from '@elevenlabs/react';
import { useSessionStore } from '@/stores/useSessionStore';
import { realtimeClientTools, registerVoiceSession, unregisterVoiceSession } from '@/lib/voice';

export type VoiceSessionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/** Voice-aware system prompt for conversational AI responses */
const VOICE_SYSTEM_PROMPT = `You are in voice conversation mode. Follow these guidelines:
- Keep responses concise (1-2 sentences preferred)
- Avoid code blocks - describe what you're doing instead
- Be conversational and natural
- For code changes, say "I'll make that change" not the full code
- If you must reference code, describe it briefly`;

export interface UseVoiceReturn {
    /** Current voice session status */
    status: VoiceSessionStatus;
    /** Whether the AI is currently speaking */
    isSpeaking: boolean;
    /** Start a voice session */
    startVoiceSession: () => Promise<void>;
    /** End the current voice session */
    endVoiceSession: () => Promise<void>;
    /** Send a text message during voice session */
    sendTextMessage: (message: string) => void;
}

/**
 * Hook for managing voice sessions with ElevenLabs Conversational AI.
 * 
 * Uses @elevenlabs/react's useConversation hook with WebRTC for low-latency audio.
 * State is synchronized with useSessionStore for global access.
 * 
 * @example
 * ```tsx
 * const { status, isSpeaking, startVoiceSession, endVoiceSession } = useVoice();
 * 
 * // Start voice session
 * await startVoiceSession();
 * 
 * // End voice session
 * await endVoiceSession();
 * ```
 */
export function useVoice(): UseVoiceReturn {
    const setVoiceStatus = useSessionStore((s) => s.setVoiceStatus);
    const setVoiceMode = useSessionStore((s) => s.setVoiceMode);
    const currentSessionId = useSessionStore((s) => s.currentSessionId);

    const conversation = useConversation({
        clientTools: realtimeClientTools,
        onConnect: () => {
            console.log('[Voice] Session connected');
            setVoiceStatus('connected');
            setVoiceMode('idle');
        },
        onDisconnect: () => {
            console.log('[Voice] Session disconnected');
            setVoiceStatus('disconnected');
            setVoiceMode('idle');
        },
        onError: (error) => {
            console.error('[Voice] Session error:', error);
            setVoiceStatus('error');
        },
        onModeChange: (data) => {
            const mode = data.mode === 'speaking' ? 'speaking' : 'listening';
            setVoiceMode(mode);
        },
    });

    // Register conversation for voiceHooks contextual updates
    useEffect(() => {
        if (conversation) {
            registerVoiceSession(conversation);
        }
        return () => {
            unregisterVoiceSession();
        };
    }, [conversation]);

    const startVoiceSession = useCallback(async () => {
        if (!currentSessionId) {
            console.warn('[Voice] No active session, cannot start voice');
            return;
        }

        setVoiceStatus('connecting');

        try {
            // Request microphone permission first (required for WebRTC)
            await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (error) {
            console.error('[Voice] Microphone permission denied:', error);
            setVoiceStatus('error');
            return;
        }

        try {
            // Fetch token from server endpoint
            const agentId = import.meta.env.VITE_ELEVENLABS_AGENT_ID;
            
            if (!agentId) {
                console.error('[Voice] VITE_ELEVENLABS_AGENT_ID not configured');
                setVoiceStatus('error');
                return;
            }

            const response = await fetch('/api/voice/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ agentId }),
            });

            if (!response.ok) {
                throw new Error(`Token request failed: ${response.status}`);
            }

            const data = await response.json();
            
            if (!data.allowed || !data.token) {
                throw new Error(data.error || 'Voice not allowed');
            }

            // Start the voice session with WebRTC (lowest latency)
            await conversation.startSession({
                connectionType: 'webrtc',
                conversationToken: data.token,
                dynamicVariables: {
                    sessionId: currentSessionId,
                    initialConversationContext: VOICE_SYSTEM_PROMPT,
                },
            });
        } catch (error) {
            console.error('[Voice] Failed to start session:', error);
            setVoiceStatus('error');
        }
    }, [currentSessionId, conversation, setVoiceStatus]);

    const endVoiceSession = useCallback(async () => {
        try {
            await conversation.endSession();
        } catch (error) {
            console.error('[Voice] Failed to end session:', error);
        }
    }, [conversation]);

    const sendTextMessage = useCallback((message: string) => {
        if (!message.trim()) return;
        
        try {
            conversation.sendUserMessage(message);
        } catch (error) {
            console.error('[Voice] Failed to send message:', error);
        }
    }, [conversation]);

    // Get voice status from store (synced via callbacks) or derive from conversation
    const storeVoiceStatus = useSessionStore((s) => s.voiceStatus);
    
    // Use store status for error state, conversation status for others
    const status: VoiceSessionStatus = 
        storeVoiceStatus === 'error' ? 'error' :
        conversation.status === 'connecting' ? 'connecting' :
        conversation.status === 'connected' ? 'connected' :
        'disconnected';

    return {
        status,
        isSpeaking: conversation.isSpeaking,
        startVoiceSession,
        endVoiceSession,
        sendTextMessage,
    };
}
