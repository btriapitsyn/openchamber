/**
 * Voice session interface - minimal subset of ElevenLabs conversation
 * Used for type safety without importing ReturnType from SDK
 */
interface VoiceSession {
    sendContextualUpdate: (text: string) => void;
}

/**
 * Global storage for the active voice session.
 * Used by voiceHooks to send contextual updates to the voice agent.
 */
let activeVoiceSession: VoiceSession | null = null;

/**
 * Register a voice session for use by voiceHooks.
 * Called by useVoice when a conversation is established.
 */
export function registerVoiceSession(session: VoiceSession): void {
    activeVoiceSession = session;
    console.log("[Voice] Session registered");
}

/**
 * Unregister the active voice session.
 * Called by useVoice when the session ends.
 */
export function unregisterVoiceSession(): void {
    activeVoiceSession = null;
    console.log("[Voice] Session unregistered");
}

/**
 * Get the currently registered voice session.
 * Used by voiceHooks to send contextual updates.
 */
export function getVoiceSession(): VoiceSession | null {
    return activeVoiceSession;
}

/**
 * Check if a voice session is currently active.
 */
export function isVoiceSessionStarted(): boolean {
    return activeVoiceSession !== null;
}
