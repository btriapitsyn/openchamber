import React from 'react';
import { useVoice } from '@/hooks/useVoice';
import { useSessionStore } from '@/stores/useSessionStore';
import { Button } from '@/components/ui/button';
import { RiMicLine, RiMicOffLine, RiLoader4Line } from '@remixicon/react';

/**
 * Voice toggle button that starts/stops voice sessions.
 * Shows visual state: disconnected, connecting, listening, speaking.
 * Works identically on all platforms (Web, Desktop, VS Code).
 */
export function VoiceButton() {
    const { status, isSpeaking, startVoiceSession, endVoiceSession } = useVoice();
    const currentSessionId = useSessionStore((s) => s.currentSessionId);
    
    // Check for agent ID configuration
    const hasAgentId = Boolean(import.meta.env.VITE_ELEVENLABS_AGENT_ID);
    
    const handleClick = async () => {
        if (!currentSessionId) {
            console.warn('[VoiceButton] No active session');
            return;
        }
        
        if (!hasAgentId) {
            // Per CONTEXT.md: Show setup prompt if no API key configured
            // For now, log warning - modal can be added in Phase 3
            console.warn('[VoiceButton] VITE_ELEVENLABS_AGENT_ID not configured');
            return;
        }
        
        if (status === 'connected') {
            await endVoiceSession();
        } else if (status !== 'connecting') {
            await startVoiceSession();
        }
    };
    
    // Determine button appearance based on state
    const isActive = status === 'connected';
    const isConnecting = status === 'connecting';
    const isError = status === 'error';
    
    // Button variant based on state
    const variant = isError ? 'destructive' : isActive ? 'default' : 'ghost';
    
    // Debug logging
    console.log('[VoiceButton] Status:', status, 'Session:', currentSessionId, 'HasAgentId:', hasAgentId);
    
    // Icon based on state
    const Icon = isConnecting ? RiLoader4Line : isActive ? RiMicLine : RiMicOffLine;
    
    // Status text for accessibility
    const statusText = isConnecting ? 'Connecting...' 
        : isActive && isSpeaking ? 'AI Speaking'
        : isActive ? 'Listening'
        : isError ? 'Voice Error'
        : 'Start Voice';
    
    return (
        <Button
            size="icon"
            variant={variant}
            onClick={handleClick}
            disabled={!currentSessionId || isConnecting}
            aria-label={statusText}
            title={statusText}
            className={isConnecting ? 'animate-pulse' : ''}
        >
            <Icon className={`w-5 h-5 ${isConnecting ? 'animate-spin' : ''}`} />
        </Button>
    );
}
