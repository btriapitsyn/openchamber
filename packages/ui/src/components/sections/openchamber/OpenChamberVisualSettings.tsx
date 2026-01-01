import React from 'react';
import { RiRestartLine } from '@remixicon/react';

import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ThemeMode } from '@/types/theme';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { cn } from '@/lib/utils';
import { ButtonSmall } from '@/components/ui/button-small';
import { NumberInput } from '@/components/ui/number-input';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';

interface Option<T extends string> {
    id: T;
    label: string;
    description?: string;
}

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

const TOOL_EXPANSION_OPTIONS: Array<{ value: 'collapsed' | 'activity' | 'detailed'; label: string; description: string }> = [
    { value: 'collapsed', label: 'Collapsed', description: 'Activity and tools start collapsed' },
    { value: 'activity', label: 'Summary', description: 'Activity expanded, tools collapsed' },
    { value: 'detailed', label: 'Detailed', description: 'Activity expanded, key tools expanded' },
];

const DIFF_LAYOUT_OPTIONS: Option<'dynamic' | 'inline' | 'side-by-side'>[] = [
    {
        id: 'dynamic',
        label: 'Dynamic',
        description: 'New files inline, modified files side-by-side. Responsive inline fallback only in Dynamic mode.',
    },
    {
        id: 'inline',
        label: 'Always inline',
        description: 'Show all file diffs as a single unified view.',
    },
    {
        id: 'side-by-side',
        label: 'Always side-by-side',
        description: 'Compare original and modified files next to each other.',
    },
];

export type VisibleSetting = 'theme' | 'fontSize' | 'spacing' | 'inputBarOffset' | 'toolOutput' | 'diffLayout' | 'reasoning' | 'queueMode';

interface OpenChamberVisualSettingsProps {
    /** Which settings to show. If undefined, shows all. */
    visibleSettings?: VisibleSetting[];
}

export const OpenChamberVisualSettings: React.FC<OpenChamberVisualSettingsProps> = ({ visibleSettings }) => {
    const { isMobile } = useDeviceInfo();
    const showReasoningTraces = useUIStore(state => state.showReasoningTraces);
    const setShowReasoningTraces = useUIStore(state => state.setShowReasoningTraces);
    const toolCallExpansion = useUIStore(state => state.toolCallExpansion);
    const setToolCallExpansion = useUIStore(state => state.setToolCallExpansion);
    const fontSize = useUIStore(state => state.fontSize);
    const setFontSize = useUIStore(state => state.setFontSize);
    const padding = useUIStore(state => state.padding);
    const setPadding = useUIStore(state => state.setPadding);
    const inputBarOffset = useUIStore(state => state.inputBarOffset);
    const setInputBarOffset = useUIStore(state => state.setInputBarOffset);
    const diffLayoutPreference = useUIStore(state => state.diffLayoutPreference);
    const setDiffLayoutPreference = useUIStore(state => state.setDiffLayoutPreference);
    const queueModeEnabled = useMessageQueueStore(state => state.queueModeEnabled);
    const setQueueMode = useMessageQueueStore(state => state.setQueueMode);
    const {
        themeMode,
        setThemeMode,
    } = useThemeSystem();

    const shouldShow = (setting: VisibleSetting): boolean => {
        if (!visibleSettings) return true;
        return visibleSettings.includes(setting);
    };

    return (
        <div className="w-full space-y-8">
            {shouldShow('theme') && !isVSCodeRuntime() && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Theme Mode
                        </h3>
                    </div>

                    <div className="flex gap-1 w-fit">
                        {THEME_MODE_OPTIONS.map((option) => (
                            <ButtonSmall
                                key={option.value}
                                variant={themeMode === option.value ? 'default' : 'outline'}
                                className={cn(themeMode === option.value ? undefined : 'text-foreground')}
                                onClick={() => setThemeMode(option.value)}
                            >
                                {option.label}
                            </ButtonSmall>
                        ))}
                    </div>
                </div>
            )}

            {shouldShow('fontSize') && !isMobile && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Font Size
                        </h3>

                    </div>
                    <div className="flex items-center gap-3 w-full max-w-md">
                        <input
                            type="range"
                            min="50"
                            max="200"
                            step="5"
                            value={fontSize}
                            onChange={(e) => setFontSize(Number(e.target.value))}
                            className="flex-1 min-w-0 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                        />
                        <NumberInput
                            value={fontSize}
                            onValueChange={setFontSize}
                            min={50}
                            max={200}
                            step={5}
                            aria-label="Font size percentage"
                        />
                        <ButtonSmall
                            type="button"
                            variant="ghost"
                            onClick={() => setFontSize(100)}
                            disabled={fontSize === 100}
                            className="h-8 w-8 px-0 border border-border bg-background hover:bg-accent disabled:opacity-100 disabled:bg-background"
                            aria-label="Reset font size"
                            title="Reset"
                        >
                            <RiRestartLine className="h-3.5 w-3.5" />
                        </ButtonSmall>
                    </div>
                </div>
            )}

            {shouldShow('spacing') && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Spacing
                        </h3>

                    </div>

                    {isMobile ? (
                        <div className="flex items-center gap-2 w-full">
                            <input
                                type="range"
                                min="50"
                                max="200"
                                step="5"
                                value={padding}
                                onChange={(e) => setPadding(Number(e.target.value))}
                                className="flex-1 min-w-0 h-3 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                                aria-label="Spacing percentage"
                            />

                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                {padding}
                            </span>

                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setPadding(100)}
                                disabled={padding === 100}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-accent disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset spacing"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 w-full max-w-md">
                            <input
                                type="range"
                                min="50"
                                max="200"
                                step="5"
                                value={padding}
                                onChange={(e) => setPadding(Number(e.target.value))}
                                className="flex-1 min-w-0 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                            />
                            <NumberInput
                                value={padding}
                                onValueChange={setPadding}
                                min={50}
                                max={200}
                                step={5}
                                aria-label="Spacing percentage"
                            />
                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setPadding(100)}
                                disabled={padding === 100}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-accent disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset spacing"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    )}
                </div>
            )}

            {shouldShow('inputBarOffset') && isMobile && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Input Bar Offset
                        </h3>
                        <p className="typography-meta text-muted-foreground">
                            Raise the input bar for phones with curved screen edges.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 w-full">
                        <input
                            type="range"
                            min="0"
                            max="100"
                            step="5"
                            value={inputBarOffset}
                            onChange={(e) => setInputBarOffset(Number(e.target.value))}
                            className="flex-1 min-w-0 h-3 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                            aria-label="Input bar offset in pixels"
                        />

                        <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                            {inputBarOffset}px
                        </span>

                        <ButtonSmall
                            type="button"
                            variant="ghost"
                            onClick={() => setInputBarOffset(0)}
                            disabled={inputBarOffset === 0}
                            className="h-8 w-8 px-0 border border-border bg-background hover:bg-accent disabled:opacity-100 disabled:bg-background"
                            aria-label="Reset input bar offset"
                            title="Reset"
                        >
                            <RiRestartLine className="h-3.5 w-3.5" />
                        </ButtonSmall>
                    </div>
                </div>
            )}

            {shouldShow('toolOutput') && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Default Tool Output
                        </h3>
                        <p className="typography-meta text-muted-foreground">
                            {TOOL_EXPANSION_OPTIONS.find(o => o.value === toolCallExpansion)?.description}
                        </p>
                    </div>
                    <div className="flex gap-1 w-fit">
                        {TOOL_EXPANSION_OPTIONS.map((option) => (
                            <ButtonSmall
                                key={option.value}
                                variant={toolCallExpansion === option.value ? 'default' : 'outline'}
                                className={cn(toolCallExpansion === option.value ? undefined : 'text-foreground')}
                                onClick={() => setToolCallExpansion(option.value)}
                            >
                                {option.label}
                            </ButtonSmall>
                        ))}
                    </div>
                </div>
            )}

            {shouldShow('diffLayout') && !isMobile && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Diff layout (Diff tab)
                        </h3>
                        <p className="typography-meta text-muted-foreground/80">
                            Choose the default layout for file diffs. You can still override layout per file from the Diff tab.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 w-fit">
                            {DIFF_LAYOUT_OPTIONS.map((option) => (
                                <ButtonSmall
                                    key={option.id}
                                    variant={diffLayoutPreference === option.id ? 'default' : 'outline'}
                                    className={cn(diffLayoutPreference === option.id ? undefined : 'text-foreground')}
                                    onClick={() => setDiffLayoutPreference(option.id)}
                                >
                                    {option.label}
                                </ButtonSmall>
                            ))}
                        </div>
                        <p className="typography-meta text-muted-foreground/80 max-w-xl">
                            {DIFF_LAYOUT_OPTIONS.find((option) => option.id === diffLayoutPreference)?.description}
                        </p>
                    </div>
                </div>
            )}

            {shouldShow('reasoning') && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        className="h-3.5 w-3.5 accent-primary"
                        checked={showReasoningTraces}
                        onChange={(event) => setShowReasoningTraces(event.target.checked)}
                    />
                    <span className="typography-ui-header font-semibold text-foreground">
                        Show thinking / reasoning traces
                    </span>
                </label>
            )}

            {shouldShow('queueMode') && (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-primary"
                            checked={queueModeEnabled}
                            onChange={(event) => setQueueMode(event.target.checked)}
                        />
                        <span className="typography-ui-header font-semibold text-foreground">
                            Queue messages by default
                        </span>
                    </label>
                    <p className="typography-meta text-muted-foreground pl-5">
                        {queueModeEnabled 
                            ? 'Enter queues messages, Ctrl+Enter sends immediately.' 
                            : 'Enter sends immediately, Ctrl+Enter queues messages.'}
                    </p>
                </div>
            )}
        </div>
    );
};
