import { useState, useCallback, useEffect } from 'react';

type LogoSource = 'local' | 'remote' | 'none';

interface UseProviderLogoReturn {
    src: string | null;
    onError: () => void;
    hasLogo: boolean;
}

const localLogoModules = import.meta.glob<string>('../assets/provider-logos/*.svg', {
    eager: true,
    import: 'default',
});

const LOCAL_PROVIDER_LOGO_MAP = new Map<string, string>();

for (const [path, url] of Object.entries(localLogoModules)) {
    const match = path.match(/provider-logos\/([^/]+)\.svg$/i);
    if (match?.[1] && url) {
        LOCAL_PROVIDER_LOGO_MAP.set(match[1].toLowerCase(), url);
    }
}

/**
 * Custom hook for provider logo with cascading fallback:
 * 1. Local: Bundled asset from src/assets/provider-logos
 * 2. Remote: https://models.dev/logos/{id}.svg (fallback)
 * 3. None: Returns null, caller shows icon fallback
 */
export function useProviderLogo(providerId: string | null | undefined): UseProviderLogoReturn {
    const normalizedId = providerId?.toLowerCase() ?? null;
    const hasLocalLogo = normalizedId ? LOCAL_PROVIDER_LOGO_MAP.has(normalizedId) : false;
    const localLogoSrc = normalizedId ? LOCAL_PROVIDER_LOGO_MAP.get(normalizedId) ?? null : null;

    const [source, setSource] = useState<LogoSource>(hasLocalLogo ? 'local' : 'remote');

    // Reset to appropriate source when provider changes
    useEffect(() => {
        setSource(hasLocalLogo ? 'local' : 'remote');
    }, [hasLocalLogo, normalizedId]);

    const handleError = useCallback(() => {
        setSource((current) => (current === 'local' && hasLocalLogo ? 'remote' : 'none'));
    }, [hasLocalLogo]);

    if (!normalizedId) {
        return { src: null, onError: handleError, hasLogo: false };
    }

    if (source === 'local' && localLogoSrc) {
        return {
            src: localLogoSrc,
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
