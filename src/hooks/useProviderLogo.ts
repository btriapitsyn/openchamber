import { useState, useCallback, useEffect } from 'react';

type LogoSource = 'local' | 'remote' | 'none';

interface UseProviderLogoReturn {
    src: string | null;
    onError: () => void;
    hasLogo: boolean;
}

/**
 * Custom hook for provider logo with cascading fallback:
 * 1. Local: /provider-logos/{id}.svg (our custom logos)
 * 2. Remote: https://models.dev/logos/{id}.svg (fallback)
 * 3. None: Returns null, caller shows icon fallback
 */
export function useProviderLogo(providerId: string | null | undefined): UseProviderLogoReturn {
    const [source, setSource] = useState<LogoSource>('local');

    // Reset to local when provider changes
    useEffect(() => {
        setSource('local');
    }, [providerId]);

    const handleError = useCallback(() => {
        setSource((current) => (current === 'local' ? 'remote' : 'none'));
    }, []);

    if (!providerId) {
        return { src: null, onError: handleError, hasLogo: false };
    }

    const normalizedId = providerId.toLowerCase();

    if (source === 'local') {
        return {
            src: `/provider-logos/${normalizedId}.svg`,
            onError: handleError,
            hasLogo: true,
        };
    }

    if (source === 'remote') {
        return {
            src: `https://models.dev/logos/${normalizedId}.svg`,
            onError: handleError,
            hasLogo: true,
        };
    }

    return { src: null, onError: handleError, hasLogo: false };
}
