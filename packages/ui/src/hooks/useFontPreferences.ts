import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
}

export const useFontPreferences = (): FontPreferences => {
    return {
        uiFont: 'system',
        monoFont: 'berkeley-mono',
    };
};
