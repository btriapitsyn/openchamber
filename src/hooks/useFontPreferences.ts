import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
}

/**
 * Returns the configured font preferences.
 * Fonts are no longer configurable by users - returns hardcoded defaults.
 */
export const useFontPreferences = (): FontPreferences => {
    return {
        uiFont: 'ibm-plex-sans',
        monoFont: 'ibm-plex-mono',
    };
};
