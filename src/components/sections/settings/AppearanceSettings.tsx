import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
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
import {
    CaretDown as ChevronDownIcon,
    CaretRight as ChevronRight,
    TextAlignLeft,
    Code
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

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
    const { isMobile: deviceIsMobile } = useDeviceInfo();
    const isActuallyMobile = isMobile || deviceIsMobile;
    const markdownConfig = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    // Mobile panel states
    const [isUiFontPanelOpen, setIsUiFontPanelOpen] = React.useState(false);
    const [isCodeFontPanelOpen, setIsCodeFontPanelOpen] = React.useState(false);

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

                {/* Button Group */}
                <div className="flex gap-2 max-w-sm">
                    {DISPLAY_MODE_OPTIONS.map((option) => (
                        <Button
                            key={option.id}
                            size="sm"
                            variant={mode === option.id ? 'default' : 'outline'}
                            onClick={() => setMode(option.id)}
                            className="flex-1 h-6 px-2 text-xs"
                        >
                            {option.label}
                        </Button>
                    ))}
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

                {/* Font Selector */}
                {isActuallyMobile ? (
                    <button
                        type="button"
                        onClick={() => setIsUiFontPanelOpen(true)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-left typography-ui-label text-foreground shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <TextAlignLeft className="h-4 w-4 text-muted-foreground" />
                            <span>{UI_FONT_OPTION_MAP[uiFont]?.label || 'Select font...'}</span>
                        </div>
                        <ChevronDownIcon className="h-4 w-4 text-muted-foreground/80" />
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {UI_FONT_OPTIONS.map((option) => (
                            <Button
                                key={option.id}
                                size="sm"
                                variant={uiFont === option.id ? 'default' : 'outline'}
                                onClick={() => setUiFont(option.id)}
                                className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                            >
                                <span className="typography-ui-label font-medium">{option.label}</span>
                            </Button>
                        ))}
                    </div>
                )}

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

                {/* Font Selector */}
                {isActuallyMobile ? (
                    <button
                        type="button"
                        onClick={() => setIsCodeFontPanelOpen(true)}
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-left typography-ui-label text-foreground shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <Code className="h-4 w-4 text-muted-foreground" />
                            <span>{CODE_FONT_OPTION_MAP[monoFont]?.label || 'Select font...'}</span>
                        </div>
                        <ChevronDownIcon className="h-4 w-4 text-muted-foreground/80" />
                    </button>
                ) : (
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        {CODE_FONT_OPTIONS.map((option) => (
                            <Button
                                key={option.id}
                                size="sm"
                                variant={monoFont === option.id ? 'default' : 'outline'}
                                onClick={() => setMonoFont(option.id)}
                                className="h-auto flex-col items-start gap-1 px-3 py-2 text-left"
                            >
                                <span className="typography-ui-label font-medium">{option.label}</span>
                            </Button>
                        ))}
                    </div>
                )}

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

            {/* Mobile Overlay Panels */}
            {isActuallyMobile && (
                <>
                    <MobileOverlayPanel
                        open={isUiFontPanelOpen}
                        onClose={() => setIsUiFontPanelOpen(false)}
                        title="Interface Font"
                    >
                        <div className="space-y-1">
                            {UI_FONT_OPTIONS.map((option) => {
                                const isSelected = uiFont === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => {
                                            setUiFont(option.id);
                                            setIsUiFontPanelOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full flex-col items-start rounded-md border border-border/40 bg-background/95 px-3 py-2 text-left',
                                            isSelected && 'border-primary/60 bg-primary/10'
                                        )}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className="typography-ui-label font-medium text-foreground">
                                                {option.label}
                                            </span>
                                            {isSelected && (
                                                <div className="h-2 w-2 rounded-full bg-primary" />
                                            )}
                                        </div>
                                        {option.description && (
                                            <span className="typography-meta text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </MobileOverlayPanel>

                    <MobileOverlayPanel
                        open={isCodeFontPanelOpen}
                        onClose={() => setIsCodeFontPanelOpen(false)}
                        title="Code Font"
                    >
                        <div className="space-y-1">
                            {CODE_FONT_OPTIONS.map((option) => {
                                const isSelected = monoFont === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => {
                                            setMonoFont(option.id);
                                            setIsCodeFontPanelOpen(false);
                                        }}
                                        className={cn(
                                            'flex w-full flex-col items-start rounded-md border border-border/40 bg-background/95 px-3 py-2 text-left',
                                            isSelected && 'border-primary/60 bg-primary/10'
                                        )}
                                    >
                                        <div className="flex w-full items-center justify-between">
                                            <span className="typography-ui-label font-medium text-foreground">
                                                {option.label}
                                            </span>
                                            {isSelected && (
                                                <div className="h-2 w-2 rounded-full bg-primary" />
                                            )}
                                        </div>
                                        {option.description && (
                                            <span className="typography-meta text-muted-foreground">
                                                {option.description}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </MobileOverlayPanel>
                </>
            )}
        </div>
    );
};