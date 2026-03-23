import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
}

export const useFontPreferences = (): FontPreferences => {
    return {
        uiFont: 'ibm-plex-sans',
        monoFont: 'ibm-plex-mono',
    };
};
