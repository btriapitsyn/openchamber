import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import type { ThemeMode } from '@/types/theme';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { useTypographySizes, formatTypographyLabel, remToPx, pxToRem } from '@/hooks/useTypographySizes';
import { useUIStore } from '@/stores/useUIStore';
import { MARKDOWN_MODE_VARIABLES, type MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { createUserMarkdown } from '@/components/chat/message/markdownPresets';
import {
    CODE_FONT_OPTIONS,
    CODE_FONT_OPTION_MAP,
    UI_FONT_OPTIONS,
    UI_FONT_OPTION_MAP,
} from '@/lib/fontOptions';
import {
    TYPOGRAPHY_SCALE_OPTIONS,
    detectTypographyScale,
} from '@/lib/typographyPresets';
import { SEMANTIC_TYPOGRAPHY, type SemanticTypographyKey } from '@/lib/typography';
import {
    CaretDown as ChevronDownIcon,
    CaretRight as ChevronRight,
    TextAlignLeft,
    Code,
    ArrowsClockwise,
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { saveAppearancePreferences } from '@/lib/appearancePersistence';
import { isDesktopRuntime } from '@/lib/desktop';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

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

const THEME_MODE_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
    {
        value: 'system',
        label: 'Match system',
    },
    {
        value: 'light',
        label: 'Always use light',
    },
    {
        value: 'dark',
        label: 'Always use dark',
    },
];

export const OpenchamberSettings: React.FC = () => {
    const [mode, setMode] = useMarkdownDisplayMode();
    const { uiFont, monoFont, setUiFont, setMonoFont } = useFontPreferences();
    const { typographySizes, setTypographySizes, resetTypographySizes } = useTypographySizes();
    const isMobile = useUIStore(state => state.isMobile);
    const {
        availableThemes,
        themeMode,
        setThemeMode,
        lightThemeId,
        darkThemeId,
        setLightThemePreference,
        setDarkThemePreference,
    } = useThemeSystem();
    const markdownConfig = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);
    const [isSaving, setIsSaving] = React.useState(false);
    const desktopRuntime = isDesktopRuntime();

    // Mobile panel states
    const [isUiFontPanelOpen, setIsUiFontPanelOpen] = React.useState(false);
    const [isCodeFontPanelOpen, setIsCodeFontPanelOpen] = React.useState(false);

    // Typography state
    const currentScale = React.useMemo(
        () => detectTypographyScale(typographySizes),
        [typographySizes]
    );
    const [expandedTypography, setExpandedTypography] = React.useState(false);
    const lightThemes = React.useMemo(
        () => availableThemes.filter((theme) => theme.metadata.variant === 'light'),
        [availableThemes]
    );
    const darkThemes = React.useMemo(
        () => availableThemes.filter((theme) => theme.metadata.variant === 'dark'),
        [availableThemes]
    );

    const handleSavePreferences = React.useCallback(async () => {
        if (!desktopRuntime) {
            toast.info('Saving appearance settings is available in the desktop app.');
            return;
        }

        setIsSaving(true);
        const success = await saveAppearancePreferences({
            uiFont,
            monoFont,
            markdownDisplayMode: mode,
            typographySizes: {
                markdown: typographySizes.markdown,
                code: typographySizes.code,
                uiHeader: typographySizes.uiHeader,
                uiLabel: typographySizes.uiLabel,
                meta: typographySizes.meta,
                micro: typographySizes.micro,
            },
        });

        if (success) {
            toast.success('Appearance settings saved');
        } else {
            toast.error('Failed to save appearance settings');
        }

        setIsSaving(false);
    }, [desktopRuntime, mode, monoFont, typographySizes, uiFont]);

    return (
        <div className="w-full space-y-8">
            {/* Theme Preferences */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <h2 className="typography-ui-header font-semibold text-foreground">
                        Theme Preferences
                    </h2>
                    <p className="typography-meta text-muted-foreground/80">
                        Control how OpenChamber selects light and dark themes across devices.
                    </p>
                </div>

                <div className="space-y-2">
                    <label className="typography-ui-label font-medium text-foreground">
                        Theme mode
                    </label>
                    <Select value={themeMode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
                        <SelectTrigger className="w-fit h-6 rounded-lg">
                            <SelectValue placeholder="Select theme mode" />
                        </SelectTrigger>
                        <SelectContent>
                            {THEME_MODE_OPTIONS.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                        <label className="typography-ui-label font-medium text-foreground">
                            Default light theme
                        </label>
                        <Select value={lightThemeId} onValueChange={setLightThemePreference}>
                            <SelectTrigger className="w-fit h-6 rounded-lg">
                                <SelectValue placeholder="Select light theme" />
                            </SelectTrigger>
                            <SelectContent>
                                {lightThemes.map((theme) => (
                                    <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                        {theme.metadata.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="typography-meta text-muted-foreground/70">
                            Applied whenever light mode is active.
                        </p>
                    </div>
                    <div className="space-y-2">
                        <label className="typography-ui-label font-medium text-foreground">
                            Default dark theme
                        </label>
                        <Select value={darkThemeId} onValueChange={setDarkThemePreference}>
                            <SelectTrigger className="w-fit h-6 rounded-lg">
                                <SelectValue placeholder="Select dark theme" />
                            </SelectTrigger>
                            <SelectContent>
                                {darkThemes.map((theme) => (
                                    <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                        {theme.metadata.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="typography-meta text-muted-foreground/70">
                            Used when dark mode is active.
                        </p>
                    </div>
                </div>
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
                <div className="flex gap-1 w-fit">
                    {DISPLAY_MODE_OPTIONS.map((option) => (
                        <Button
                            key={option.id}
                            size="sm"
                            variant={mode === option.id ? 'default' : 'outline'}
                            onClick={() => setMode(option.id)}
                            className="h-6 px-2 text-xs"
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
                            "rounded-xl border border-border/40 bg-muted/20",
                            "h-[160px] sm:h-[180px]",
                            "overflow-hidden"
                        )}
                    >
                        <div className="h-full overflow-y-auto overflow-x-hidden">
                            <div
                                className="p-3 sm:p-4"
                                style={Object.entries(MARKDOWN_MODE_VARIABLES[mode]).reduce<Record<string, string>>(
                                    (acc, [key, value]) => {
                                        acc[key] = value;
                                        return acc;
                                    },
                                    {}
                                )}
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
                {isMobile ? (
                    <button
                        type="button"
                        onClick={() => setIsUiFontPanelOpen(true)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-left typography-ui-label text-foreground shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <TextAlignLeft className="h-4 w-4 text-muted-foreground" />
                            <span>{UI_FONT_OPTION_MAP[uiFont]?.label || 'Select font...'}</span>
                        </div>
                        <ChevronDownIcon className="h-4 w-4 text-muted-foreground/80" />
                    </button>
                ) : (
                    <div className="flex flex-wrap gap-1 w-fit">
                        {UI_FONT_OPTIONS.map((option) => (
                            <Button
                                key={option.id}
                                size="sm"
                                variant={uiFont === option.id ? 'default' : 'outline'}
                                onClick={() => setUiFont(option.id)}
                                className="h-6 px-2 text-xs"
                            >
                                {option.label}
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
                {isMobile ? (
                    <button
                        type="button"
                        onClick={() => setIsCodeFontPanelOpen(true)}
                        className="flex w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-background px-3 py-2 text-left typography-ui-label text-foreground shadow-xs"
                    >
                        <div className="flex items-center gap-2">
                            <Code className="h-4 w-4 text-muted-foreground" />
                            <span>{CODE_FONT_OPTION_MAP[monoFont]?.label || 'Select font...'}</span>
                        </div>
                        <ChevronDownIcon className="h-4 w-4 text-muted-foreground/80" />
                    </button>
                ) : (
                    <div className="flex flex-wrap gap-1 w-fit">
                        {CODE_FONT_OPTIONS.map((option) => (
                            <Button
                                key={option.id}
                                size="sm"
                                variant={monoFont === option.id ? 'default' : 'outline'}
                                onClick={() => setMonoFont(option.id)}
                                className="h-6 px-2 text-xs font-mono"
                            >
                                {option.label}
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
                            "rounded-xl border border-border/40 bg-muted/20",
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

            {/* Typography Settings Section - Desktop Only */}
            {!isMobile && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Typography Sizes
                        </h3>
                        <p className="typography-meta text-muted-foreground/80">
                            Adjust font sizes for different content types across the interface.
                        </p>
                    </div>

                {/* Scale Preset Buttons */}
                <div className="flex flex-wrap gap-1 w-fit">
                    {TYPOGRAPHY_SCALE_OPTIONS.map((option) => (
                        <Button
                            key={option.id}
                            size="sm"
                            variant={currentScale === option.id ? 'default' : 'outline'}
                            onClick={() => setTypographySizes(option.sizes)}
                            className="h-6 px-2 text-xs"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>

                {/* Helper Text */}
                {currentScale !== 'custom' && (
                    <p className="typography-meta text-muted-foreground/70">
                        {TYPOGRAPHY_SCALE_OPTIONS.find((opt) => opt.id === currentScale)?.description}
                    </p>
                )}

                {/* Advanced Controls - Collapsible */}
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={() => setExpandedTypography(!expandedTypography)}
                        className="inline-flex w-full items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-2 h-6 hover:bg-muted/30 transition-colors text-xs font-medium"
                    >
                        <span className="text-foreground">
                            Advanced Typography Controls
                            {currentScale === 'custom' && (
                                <span className="text-muted-foreground ml-2">(Custom)</span>
                            )}
                        </span>
                        {expandedTypography ? (
                            <ChevronDownIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                    </button>

                    {expandedTypography && (
                        <div className="space-y-3 rounded-xl border border-border/40 bg-muted/10 p-4">
                            {(Object.keys(SEMANTIC_TYPOGRAPHY) as SemanticTypographyKey[]).map((key) => (
                                <div key={key} className="flex items-center justify-between gap-4">
                                    <label className="typography-ui-label text-foreground font-medium min-w-[140px]">
                                        {formatTypographyLabel(key)}
                                    </label>
                                    <div className="flex items-center gap-2 flex-1 max-w-xs">
                                        <input
                                            type="range"
                                            min="10"
                                            max="20"
                                            step="0.5"
                                            value={remToPx(typographySizes[key])}
                                            onChange={(e) => {
                                                const newSizes = { ...typographySizes };
                                                newSizes[key] = pxToRem(parseFloat(e.target.value));
                                                setTypographySizes(newSizes);
                                            }}
                                            className="flex-1 h-2 rounded-xl appearance-none cursor-pointer bg-border/40 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                                        />
                                        <span className="typography-meta text-muted-foreground font-mono w-12 text-right">
                                            {remToPx(typographySizes[key]).toFixed(0)}px
                                        </span>
                                    </div>
                                </div>
                            ))}

                            <div className="flex justify-end pt-2 border-t border-border/40">
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={resetTypographySizes}
                                    className="gap-2"
                                >
                                    <ArrowsClockwise className="h-4 w-4" />
                                    Reset to Default
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Live Preview */}
                <div className="space-y-2">
                    <h4 className="typography-ui-label font-medium text-foreground">Typography Preview</h4>
                    <div
                        className={cn(
                            "rounded-xl border border-border/40 bg-muted/20",
                            "p-4 space-y-3"
                        )}
                    >
                        <div className="space-y-1">
                            <div className="typography-micro text-muted-foreground uppercase tracking-wider">
                                micro text
                            </div>
                            <p className="typography-meta text-muted-foreground">
                                Meta information and secondary details
                            </p>
                            <p className="typography-ui-label text-foreground">
                                UI Labels and form controls
                            </p>
                            <p className="typography-ui-header font-semibold text-foreground">
                                UI Headers and section titles
                            </p>
                            <pre
                                className="typography-code font-mono text-foreground/90 bg-muted/30 p-2 rounded"
                                style={{ fontFamily: CODE_FONT_OPTION_MAP[monoFont]?.stack }}
                            >
                                Code blocks and technical content
                            </pre>
                            <div className="typography-markdown text-foreground">
                                Markdown content: The quick brown fox jumps over the lazy dog
                            </div>
                        </div>
                    </div>
                </div>
                </div>
            )}

            {/* Persist Settings */}
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/70 p-4">
                <div className="flex flex-col gap-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Persist Appearance Settings
                    </h3>
                    <p className="typography-meta text-muted-foreground/80">
                        Save the current font and typography preferences so they reload automatically in the desktop app.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        type="button"
                        onClick={handleSavePreferences}
                        disabled={isSaving || !desktopRuntime}
                        className="min-w-[140px]"
                    >
                        {isSaving ? 'Saving…' : 'Save settings'}
                    </Button>
                    {!desktopRuntime && (
                        <span className="typography-meta text-muted-foreground/70">
                            Available only in the desktop application.
                        </span>
                    )}
                </div>
            </div>

            {/* Mobile Overlay Panels */}
            {isMobile && (
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
                                            'flex w-full flex-col items-start rounded-xl border border-border/40 bg-background/95 px-3 py-2 text-left',
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
                                            'flex w-full flex-col items-start rounded-xl border border-border/40 bg-background/95 px-3 py-2 text-left',
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
