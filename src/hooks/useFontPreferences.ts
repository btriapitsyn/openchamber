import { useUIStore } from '@/stores/useUIStore';
import type { MonoFontOption, UiFontOption } from '@/lib/fontOptions';

interface FontPreferences {
    uiFont: UiFontOption;
    monoFont: MonoFontOption;
    setUiFont: (font: UiFontOption) => void;
    setMonoFont: (font: MonoFontOption) => void;
}

export const useFontPreferences = (): FontPreferences => {
    const uiFont = useUIStore((state) => state.uiFont);
    const monoFont = useUIStore((state) => state.monoFont);
    const setUiFont = useUIStore((state) => state.setUiFont);
    const setMonoFont = useUIStore((state) => state.setMonoFont);

    return { uiFont, monoFont, setUiFont, setMonoFont };
};
