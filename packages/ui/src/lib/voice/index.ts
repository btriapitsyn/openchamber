/**
 * Voice module barrel export
 * Provides clean import path for voice configuration and client tools
 *
 * @example
 * ```typescript
 * import { VOICE_CONFIG, realtimeClientTools, voiceHooks } from '@/lib/voice';
 * ```
 */

// Configuration
export { VOICE_CONFIG } from "./voiceConfig";

// Client tools for ElevenLabs voice agent
export { realtimeClientTools } from "./realtimeClientTools";
export type { RealtimeClientTools } from "./realtimeClientTools";

// Voice session registry (from voiceSession.ts)
export {
    registerVoiceSession,
    unregisterVoiceSession,
    getVoiceSession,
    isVoiceSessionStarted,
} from "./voiceSession";

// Voice hooks for session-to-voice event routing (from voiceHooks.ts)
export { voiceHooks } from "./voiceHooks";

// Context formatters for voice-native output
export {
    formatMessage,
    formatNewMessages,
    formatPermissionRequest,
    formatReadyEvent,
    type VoiceMessage,
} from "./contextFormatters";
