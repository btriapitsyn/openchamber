import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { useUIStore } from '@/stores/useUIStore';
import { MARKDOWN_MODE_VARIABLES, type MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { createUserMarkdown } from '@/components/chat/message/markdownPresets';
import {
    CODE_FONT_OPTIONS,
    CODE_FONT_OPTION_MAP,
    UI_FONT_OPTIONS,
    UI_FONT_OPTION_MAP,
    type MonoFontOption,
    type UiFontOption,
} from '@/lib/fontOptions';
import { CaretDown as ChevronDownIcon } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface Option<T extends string> {
    id: T;
    label: string;
    description?: string;
}

const PREVIEW_MARKDOWN = `### Sample Heading
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac aliquet lacus.

- Bullet one for quick tasks
- Bullet two with additional details`;

const CODE_PREVIEW_SNIPPET = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}`;

const DISPLAY_MODE_OPTIONS: Option<MarkdownDisplayMode>[] = [
    {
        id: 'compact',
        label: 'Compact',
        description: 'Tighter layout with minimal spacing to show more information per screen.',
    },
    {
        id: 'comfort',
        label: 'Comfort',
        description: 'Increased spacing and clearer headings for easier reading.',
    },
];

export const AppearanceSettings: React.FC = () => {
    const [mode, setMode] = useMarkdownDisplayMode();
    const { uiFont, monoFont, setUiFont, setMonoFont } = useFontPreferences();
    const isMobile = useUIStore(state => state.isMobile);
    const markdownConfig = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    return (
        <div className="w-full max-w-3xl space-y-8">
            {/* Header */}
            <div className="space-y-1">
                <h2 className="typography-h2 font-semibold text-foreground">Appearance</h2>
                <p className="typography-meta text-muted-foreground/80">
                    Customize the visual appearance of the interface.
                </p>
            </div>

            {/* Markdown Reading Mode Section */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Markdown Reading Mode
                    </h3>
                    <p className="typography-meta text-muted-foreground/80">
                        Control the density and spacing of markdown content in messages.
                    </p>
                </div>

                {/* Select Field */}
                <div className="relative">
                    <select
                        value={mode}
                        onChange={(e) => setMode(e.target.value as MarkdownDisplayMode)}
                        className="w-full appearance-none rounded-md border border-border/60 bg-background px-3 py-2 pr-8 typography-ui-label text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                        {DISPLAY_MODE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                </div>

                {/* Helper Text */}
                {DISPLAY_MODE_OPTIONS.find((opt) => opt.id === mode)?.description && (
                    <p className="typography-meta text-muted-foreground/70">
                        {DISPLAY_MODE_OPTIONS.find((opt) => opt.id === mode)?.description}
                    </p>
                )}

                {/* Preview Box */}
                <div className="relative w-full">
                    <div
                        className={cn(
                            "rounded-md border border-border/40 bg-muted/20",
                            "h-[160px] sm:h-[180px]",
                            "overflow-y-auto overflow-x-hidden"
                        )}
                    >
                        <div
                            className="p-3 sm:p-4"
                            style={Object.entries(MARKDOWN_MODE_VARIABLES[mode]).reduce((acc, [key, value]) => {
                                (acc as any)[key] = value;
                                return acc;
                            }, {})}
                        >
                            <ReactMarkdown
                                remarkPlugins={markdownConfig.remarkPlugins}
                                components={markdownConfig.components}
                            >
                                {PREVIEW_MARKDOWN}
                            </ReactMarkdown>
                        </div>
                    </div>
                </div>
            </div>

            {/* Interface Font Section */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Interface Font
                    </h3>
                    <p className="typography-meta text-muted-foreground/80">
                        Choose the font family for navigation, buttons, and UI text.
                    </p>
                </div>

                {/* Select Field */}
                <div className="relative">
                    <select
                        value={uiFont}
                        onChange={(e) => setUiFont(e.target.value as UiFontOption)}
                        className="w-full appearance-none rounded-md border border-border/60 bg-background px-3 py-2 pr-8 typography-ui-label text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                        {UI_FONT_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                </div>

                {/* Helper Text */}
                {UI_FONT_OPTION_MAP[uiFont]?.description && (
                    <p className="typography-meta text-muted-foreground/70">
                        {UI_FONT_OPTION_MAP[uiFont].description}
                    </p>
                )}
            </div>

            {/* Code Font Section */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Code Font
                    </h3>
                    <p className="typography-meta text-muted-foreground/80">
                        Select the monospace font for code blocks and technical content.
                    </p>
                </div>

                {/* Select Field */}
                <div className="relative">
                    <select
                        value={monoFont}
                        onChange={(e) => setMonoFont(e.target.value as MonoFontOption)}
                        className="w-full appearance-none rounded-md border border-border/60 bg-background px-3 py-2 pr-8 typography-ui-label text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    >
                        {CODE_FONT_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80" />
                </div>

                {/* Helper Text */}
                {CODE_FONT_OPTION_MAP[monoFont]?.description && (
                    <p className="typography-meta text-muted-foreground/70">
                        {CODE_FONT_OPTION_MAP[monoFont].description}
                    </p>
                )}

                {/* Preview Box */}
                <div className="relative w-full">
                    <pre
                        className={cn(
                            "rounded-md border border-border/40 bg-muted/20",
                            "h-[100px] sm:h-[110px]",
                            "overflow-y-auto overflow-x-auto",
                            "p-3 sm:p-4",
                            "text-sm leading-6 text-foreground/90"
                        )}
                        style={{
                            fontFamily: CODE_FONT_OPTION_MAP[monoFont]?.stack,
                            margin: 0
                        }}
                    >
                        {CODE_PREVIEW_SNIPPET}
                    </pre>
                </div>
            </div>
        </div>
    );
};