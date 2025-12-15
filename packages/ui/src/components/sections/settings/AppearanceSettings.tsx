import React from 'react';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ThemeMode } from '@/types/theme';
import { useUIStore } from '@/stores/useUIStore';
import { cn } from '@/lib/utils';
import { ButtonSmall } from '@/components/ui/button-small';
import { isVSCodeRuntime } from '@/lib/desktop';

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
    { value: 'detailed', label: 'Detailed', description: 'Activity and tools expanded' },
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

export const AppearanceSettings: React.FC = () => {
    const showReasoningTraces = useUIStore(state => state.showReasoningTraces);
    const setShowReasoningTraces = useUIStore(state => state.setShowReasoningTraces);
    const toolCallExpansion = useUIStore(state => state.toolCallExpansion);
    const setToolCallExpansion = useUIStore(state => state.setToolCallExpansion);
    const fontSize = useUIStore(state => state.fontSize);
    const setFontSize = useUIStore(state => state.setFontSize);
    const padding = useUIStore(state => state.padding);
    const setPadding = useUIStore(state => state.setPadding);
    const diffLayoutPreference = useUIStore(state => state.diffLayoutPreference);
    const setDiffLayoutPreference = useUIStore(state => state.setDiffLayoutPreference);
    const {
        themeMode,
        setThemeMode,
    } = useThemeSystem();

    return (
        <div className="w-full space-y-8">
            {!isVSCodeRuntime() && (
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

            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Font Size
                    </h3>
                    <p className="typography-meta text-muted-foreground">
                        {fontSize}% of default size
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                    />
                    <input
                        type="number"
                        min="50"
                        max="200"
                        step="5"
                        value={fontSize}
                        onChange={(e) => setFontSize(Number(e.target.value))}
                        className="w-20 px-2 py-1 text-center border border-border rounded bg-background text-foreground typography-ui-label"
                    />
                    <button
                        onClick={() => setFontSize(100)}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                        Reset
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-1">
                    <h3 className="typography-ui-header font-semibold text-foreground">
                        Spacing
                    </h3>
                    <p className="typography-meta text-muted-foreground">
                        {padding}% of default spacing
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <input
                        type="range"
                        min="50"
                        max="200"
                        step="5"
                        value={padding}
                        onChange={(e) => setPadding(Number(e.target.value))}
                        className="flex-1 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                    />
                    <input
                        type="number"
                        min="50"
                        max="200"
                        step="5"
                        value={padding}
                        onChange={(e) => setPadding(Number(e.target.value))}
                        className="w-20 px-2 py-1 text-center border border-border rounded bg-background text-foreground typography-ui-label"
                    />
                    <button
                        onClick={() => setPadding(100)}
                        className="px-2 py-1 text-xs border border-border rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                    >
                        Reset
                    </button>
                </div>
            </div>

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

            {}
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

            {}
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
        </div>
    );
};
