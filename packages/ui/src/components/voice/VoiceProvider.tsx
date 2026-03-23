import React from 'react';
import { useVoiceContext } from '@/hooks/useVoiceContext';

/**
 * Provider component that initializes voice context sync.
 * Wrap the app with this to enable voice session awareness.
 * 
 * @example
 * ```tsx
 * <VoiceProvider>
 *   <App />
 * </VoiceProvider>
 * ```
 */
export function VoiceProvider({ children }: { children: React.ReactNode }) {
    // Activate session-to-voice sync
    useVoiceContext();
    
    return <>{children}</>;
}
