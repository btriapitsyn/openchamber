export type UiFontOption =
    | 'ibm-plex-mono'
    | 'ibm-plex-sans'
    | 'inter'
    | 'system'
    | 'jetbrains-mono'
    | 'fira-code'
    | 'source-code-pro'
    | 'paper-mono';

export type MonoFontOption =
    | 'ibm-plex-mono'
    | 'jetbrains-mono'
    | 'fira-code'
    | 'source-code-pro'
    | 'paper-mono'
    | 'ibm-plex-sans'
    | 'inter'
    | 'system';

export interface FontOptionDefinition<T extends string> {
    id: T;
    label: string;
    description: string;
    stack: string;
    notes?: string;
}

export const UI_FONT_OPTIONS: FontOptionDefinition<UiFontOption>[] = [
    {
        id: 'ibm-plex-mono',
        label: 'IBM Plex Mono',
        description: 'Original app font with technical aesthetics and tight rhythm.',
        stack: '"IBM Plex Mono", "JetBrains Mono", "Fira Code", "SFMono-Regular", "Menlo", monospace',
        notes: 'Default appearance'
    },
    {
        id: 'ibm-plex-sans',
        label: 'IBM Plex Sans',
        description: 'Humanist sans-serif companion to Plex Mono, improves body readability.',
        stack: '"IBM Plex Sans", "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    {
        id: 'inter',
        label: 'Inter',
        description: 'Popular UI font optimized for screens with generous spacing.',
        stack: '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
    },
    {
        id: 'system',
        label: 'System UI',
        description: 'Uses native operating system UI font for a platform-aligned look.',
        stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
    },
    {
        id: 'jetbrains-mono',
        label: 'JetBrains Mono',
        description: 'Developer-focused monospace with tall x-height and friendly curves.',
        stack: '"JetBrains Mono", "Fira Code", "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace'
    },
    {
        id: 'fira-code',
        label: 'Fira Code',
        description: 'Popular monospace with programming ligatures and wide glyph support.',
        stack: '"Fira Code", "JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace'
    },
    {
        id: 'source-code-pro',
        label: 'Source Code Pro',
        description: 'Neutral Adobe monospace designed for high legibility.',
        stack: '"Source Code Pro", "Fira Code", "JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", monospace'
    },
    {
        id: 'paper-mono',
        label: 'Paper Mono',
        description: 'Beautiful modern monospace with distinctive character from Paper Design.',
        stack: '"Paper Mono", "JetBrains Mono", "Fira Code", "IBM Plex Mono", "SFMono-Regular", monospace',
        notes: 'Custom font'
    }
];

export const CODE_FONT_OPTIONS: FontOptionDefinition<MonoFontOption>[] = [
    {
        id: 'ibm-plex-mono',
        label: 'IBM Plex Mono',
        description: 'Balanced monospace with clear differentiation and IBM Plex family consistency.',
        stack: '"IBM Plex Mono", "JetBrains Mono", "Fira Code", "SFMono-Regular", "Menlo", monospace',
        notes: 'Default'
    },
    {
        id: 'jetbrains-mono',
        label: 'JetBrains Mono',
        description: 'Developer-focused font with tall x-height and friendly curves.',
        stack: '"JetBrains Mono", "Fira Code", "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace'
    },
    {
        id: 'fira-code',
        label: 'Fira Code',
        description: 'Popular monospace with programming ligatures and wide glyph support.',
        stack: '"Fira Code", "JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", "Menlo", monospace'
    },
    {
        id: 'source-code-pro',
        label: 'Source Code Pro',
        description: 'Neutral Adobe monospace designed for high legibility.',
        stack: '"Source Code Pro", "Fira Code", "JetBrains Mono", "IBM Plex Mono", "SFMono-Regular", monospace'
    },
    {
        id: 'paper-mono',
        label: 'Paper Mono',
        description: 'Beautiful modern monospace with distinctive character and excellent readability.',
        stack: '"Paper Mono", "JetBrains Mono", "Fira Code", "IBM Plex Mono", "SFMono-Regular", monospace',
        notes: 'Custom font'
    },
    {
        id: 'ibm-plex-sans',
        label: 'IBM Plex Sans',
        description: 'Sans-serif companion to Plex Mono for mixed content.',
        stack: '"IBM Plex Sans", "Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    },
    {
        id: 'inter',
        label: 'Inter',
        description: 'Sans-serif with excellent readability at small sizes.',
        stack: '"Inter", "SF Pro Text", -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", sans-serif'
    },
    {
        id: 'system',
        label: 'System UI',
        description: 'Native system font for platform consistency.',
        stack: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif'
    }
];

const buildFontMap = <T extends string>(options: FontOptionDefinition<T>[]) =>
    Object.fromEntries(options.map((option) => [option.id, option])) as Record<T, FontOptionDefinition<T>>;

export const UI_FONT_OPTION_MAP = buildFontMap(UI_FONT_OPTIONS);
export const CODE_FONT_OPTION_MAP = buildFontMap(CODE_FONT_OPTIONS);

export const DEFAULT_UI_FONT: UiFontOption = 'ibm-plex-mono';
export const DEFAULT_MONO_FONT: MonoFontOption = 'ibm-plex-mono';