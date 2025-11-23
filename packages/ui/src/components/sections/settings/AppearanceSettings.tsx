import React from 'react';
import ReactMarkdown from 'react-markdown';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ThemeMode } from '@/types/theme';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { useUIStore } from '@/stores/useUIStore';
import { MARKDOWN_MODE_VARIABLES, type MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { createUserMarkdown } from '@/components/chat/message/markdownPresets';
import { cn } from '@/lib/utils';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ButtonSmall } from '@/components/ui/button-small';

interface Option<T extends string> {
    id: T;
    label: string;
    description?: string;
}

const PREVIEW_MARKDOWN = `### Sample Heading
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac aliquet lacus.

- Bullet one for quick tasks
- Bullet two with additional details`;

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
        label: 'System',
    },
    {
        value: 'light',
        label: 'Light',
    },
    {
        value: 'dark',
        label: 'Dark',
    },
];

export const AppearanceSettings: React.FC = () => {
    const [mode, setMode] = useMarkdownDisplayMode();
    const isMobile = useUIStore(state => state.isMobile);
    const showReasoningTraces = useUIStore(state => state.showReasoningTraces);
    const setShowReasoningTraces = useUIStore(state => state.setShowReasoningTraces);
    const {
        themeMode,
        setThemeMode,
    } = useThemeSystem();
    const markdownConfig = React.useMemo(() => createUserMarkdown({ isMobile }), [isMobile]);

    return (
        <div className="w-full space-y-8">
            {/* Theme Preferences */}
            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Theme Mode
                    </h3>
                    <p className="typography-meta text-muted-foreground/80">
                        Choose between light, dark, or system-based theme.
                    </p>
                </div>

                {/* Button Group */}
                <div className="flex gap-1 w-fit">
                    {THEME_MODE_OPTIONS.map((option) => (
                        <ButtonSmall
                            key={option.value}
                            variant={themeMode === option.value ? 'default' : 'outline'}
                            onClick={() => setThemeMode(option.value)}
                        >
                            {option.label}
                        </ButtonSmall>
                    ))}
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
                        <ButtonSmall
                            key={option.id}
                            variant={mode === option.id ? 'default' : 'outline'}
                            onClick={() => setMode(option.id)}
                        >
                            {option.label}
                        </ButtonSmall>
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
                        <ScrollableOverlay outerClassName="h-full" className="p-0">
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
                        </ScrollableOverlay>
                    </div>
                </div>
            </div>

            {/* Assistant Thinking Visibility */}
            <div className="space-y-2">
                <div className="space-y-0.5">
                    <h3 className="typography-ui-label font-semibold text-foreground">
                        Thinking visibility
                    </h3>
                    <p className="typography-meta text-muted-foreground/75">
                        Toggle whether the assistant's internal reasoning blocks are visible in chat.
                    </p>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={showReasoningTraces}
                        onChange={(event) => setShowReasoningTraces(event.target.checked)}
                    />
                    <span className="typography-ui-label text-foreground">
                        Show thinking &amp; justification
                    </span>
                </label>
            </div>
        </div>
    );
};
