export type UiFontOption = 'ibm-plex-sans' | 'geist-sans';

export type MonoFontOption = 'ibm-plex-mono' | 'geist-mono';

export interface FontOptionDefinition<T extends string> {
    id: T;
    label: string;
    description: string;
    stack: string;
    notes?: string;
}

export const UI_FONT_OPTIONS: FontOptionDefinition<UiFontOption>[] = [
    {
        id: 'ibm-plex-sans',
        label: 'IBM Plex Sans',
        description: 'Humanist sans-serif for optimal readability in the interface.',
        stack: '"IBM Plex Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    {
        id: 'geist-sans',
        label: 'Geist Sans',
        description: 'Modern geometric sans-serif designed for clarity.',
        stack: '"Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    }
];

export const CODE_FONT_OPTIONS: FontOptionDefinition<MonoFontOption>[] = [
    {
        id: 'ibm-plex-mono',
        label: 'IBM Plex Mono',
        description: 'Balanced monospace for code blocks and technical content.',
        stack: '"IBM Plex Mono", "JetBrains Mono", "Fira Code", "SFMono-Regular", "Menlo", monospace'
    },
    {
        id: 'geist-mono',
        label: 'Geist Mono',
        description: 'Clean monospace with excellent readability for code.',
        stack: '"Geist Mono", "JetBrains Mono", "Fira Code", "SFMono-Regular", "Menlo", monospace'
    }
];

const buildFontMap = <T extends string>(options: FontOptionDefinition<T>[]) =>
    Object.fromEntries(options.map((option) => [option.id, option])) as Record<T, FontOptionDefinition<T>>;

export const UI_FONT_OPTION_MAP = buildFontMap(UI_FONT_OPTIONS);
export const CODE_FONT_OPTION_MAP = buildFontMap(CODE_FONT_OPTIONS);

export const DEFAULT_UI_FONT: UiFontOption = 'geist-sans';
export const DEFAULT_MONO_FONT: MonoFontOption = 'geist-mono';
