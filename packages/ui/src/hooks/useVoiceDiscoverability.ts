/**
 * useVoiceDiscoverability Hook
 *
 * Tracks first-time voice mode discoverability to show hints to new users.
 * Uses localStorage to persist discovery state across sessions.
 *
 * @example
 * ```typescript
 * const { isFirstTime, markDiscovered, showHint } = useVoiceDiscoverability();
 *
 * if (showHint) {
 *   // Show first-time tooltip or highlight
 * }
 *
 * // When user interacts with voice
 * markDiscovered();
 * ```
 */

import { useCallback, useEffect, useState } from 'react';

// Storage key for voice mode discovery
const VOICE_MODE_DISCOVERED_KEY = 'voiceModeDiscovered';

export interface UseVoiceDiscoverabilityReturn {
    /** True if user hasn't used voice before */
    isFirstTime: boolean;
    /** Marks voice as discovered (persists to localStorage) */
    markDiscovered: () => void;
    /** True if should show first-time hint */
    showHint: boolean;
}

/**
 * Hook for tracking voice mode discoverability
 */
export function useVoiceDiscoverability(): UseVoiceDiscoverabilityReturn {
    const [isFirstTime, setIsFirstTime] = useState<boolean>(false);
    const [hasMounted, setHasMounted] = useState<boolean>(false);

    // Check localStorage on mount (client-side only)
    useEffect(() => {
        setHasMounted(true);
        
        if (typeof window !== 'undefined') {
            const discovered = localStorage.getItem(VOICE_MODE_DISCOVERED_KEY);
            setIsFirstTime(discovered !== 'true');
        }
    }, []);

    // Mark voice as discovered
    const markDiscovered = useCallback(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(VOICE_MODE_DISCOVERED_KEY, 'true');
        }
        setIsFirstTime(false);
    }, []);

    // showHint is true only after mount and when isFirstTime is true
    // This prevents hydration mismatch in SSR environments
    const showHint = hasMounted && isFirstTime;

    return {
        isFirstTime,
        markDiscovered,
        showHint,
    };
}

export default useVoiceDiscoverability;
