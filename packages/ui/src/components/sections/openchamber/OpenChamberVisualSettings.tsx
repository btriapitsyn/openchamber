import React from 'react';
import { RiRestartLine } from '@remixicon/react';

import { useThemeSystem } from '@/contexts/useThemeSystem';
import type { ThemeMode } from '@/types/theme';
import { useUIStore } from '@/stores/useUIStore';
import { useMessageQueueStore } from '@/stores/messageQueueStore';
import { cn, getModifierLabel } from '@/lib/utils';
import { ButtonSmall } from '@/components/ui/button-small';
import { NumberInput } from '@/components/ui/number-input';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { isVSCodeRuntime } from '@/lib/desktop';
import { useDeviceInfo } from '@/lib/device';
import {
    setDirectoryShowHidden,
    useDirectoryShowHidden,
} from '@/lib/directoryShowHidden';

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

const DIFF_VIEW_MODE_OPTIONS: Option<'single' | 'stacked'>[] = [
    {
        id: 'single',
        label: 'Single file',
        description: 'Show one file at a time in the Diff tab.',
    },
    {
        id: 'stacked',
        label: 'All files',
        description: 'Stack all changed files together in the Diff tab.',
    },
];

export type VisibleSetting = 'theme' | 'fontSize' | 'terminalFontSize' | 'spacing' | 'cornerRadius' | 'inputBarOffset' | 'toolOutput' | 'diffLayout' | 'dotfiles' | 'reasoning' | 'queueMode' | 'textJustificationActivity' | 'terminalQuickKeys';

interface OpenChamberVisualSettingsProps {
    /** Which settings to show. If undefined, shows all. */
    visibleSettings?: VisibleSetting[];
}

export const OpenChamberVisualSettings: React.FC<OpenChamberVisualSettingsProps> = ({ visibleSettings }) => {
    const { isMobile } = useDeviceInfo();
    const directoryShowHidden = useDirectoryShowHidden();
    const showReasoningTraces = useUIStore(state => state.showReasoningTraces);
    const setShowReasoningTraces = useUIStore(state => state.setShowReasoningTraces);
    const showTextJustificationActivity = useUIStore(state => state.showTextJustificationActivity);
    const setShowTextJustificationActivity = useUIStore(state => state.setShowTextJustificationActivity);
    const toolCallExpansion = useUIStore(state => state.toolCallExpansion);
    const setToolCallExpansion = useUIStore(state => state.setToolCallExpansion);
    const fontSize = useUIStore(state => state.fontSize);
    const setFontSize = useUIStore(state => state.setFontSize);
    const terminalFontSize = useUIStore(state => state.terminalFontSize);
    const setTerminalFontSize = useUIStore(state => state.setTerminalFontSize);
    const padding = useUIStore(state => state.padding);
    const setPadding = useUIStore(state => state.setPadding);
    const cornerRadius = useUIStore(state => state.cornerRadius);
    const setCornerRadius = useUIStore(state => state.setCornerRadius);
    const inputBarOffset = useUIStore(state => state.inputBarOffset);
    const setInputBarOffset = useUIStore(state => state.setInputBarOffset);
    const diffLayoutPreference = useUIStore(state => state.diffLayoutPreference);
    const setDiffLayoutPreference = useUIStore(state => state.setDiffLayoutPreference);
    const diffViewMode = useUIStore(state => state.diffViewMode);
    const setDiffViewMode = useUIStore(state => state.setDiffViewMode);
    const showTerminalQuickKeysOnDesktop = useUIStore(state => state.showTerminalQuickKeysOnDesktop);
    const setShowTerminalQuickKeysOnDesktop = useUIStore(state => state.setShowTerminalQuickKeysOnDesktop);
    const queueModeEnabled = useMessageQueueStore(state => state.queueModeEnabled);
    const setQueueMode = useMessageQueueStore(state => state.setQueueMode);
    const {
        themeMode,
        setThemeMode,
        availableThemes,
        customThemesLoading,
        reloadCustomThemes,
        lightThemeId,
        darkThemeId,
        setLightThemePreference,
        setDarkThemePreference,
    } = useThemeSystem();

    const [themesReloading, setThemesReloading] = React.useState(false);

    const lightThemes = React.useMemo(
        () => availableThemes
            .filter((theme) => theme.metadata.variant === 'light')
            .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
        [availableThemes],
    );

    const darkThemes = React.useMemo(
        () => availableThemes
            .filter((theme) => theme.metadata.variant === 'dark')
            .sort((a, b) => a.metadata.name.localeCompare(b.metadata.name)),
        [availableThemes],
    );

    const selectedLightTheme = React.useMemo(
        () => lightThemes.find((theme) => theme.metadata.id === lightThemeId) ?? lightThemes[0],
        [lightThemes, lightThemeId],
    );

    const selectedDarkTheme = React.useMemo(
        () => darkThemes.find((theme) => theme.metadata.id === darkThemeId) ?? darkThemes[0],
        [darkThemes, darkThemeId],
    );

    const formatThemeLabel = React.useCallback((themeName: string, variant: 'light' | 'dark') => {
        const suffix = variant === 'dark' ? ' Dark' : ' Light';
        return themeName.endsWith(suffix) ? themeName.slice(0, -suffix.length) : themeName;
    }, []);

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

                    <div className="flex gap-10">
                        <div className="flex flex-col gap-1.5">
                            <h4 className="typography-ui-label font-medium text-foreground">Light Theme</h4>
                            <Select value={selectedLightTheme?.metadata.id ?? ''} onValueChange={setLightThemePreference}>
                                <SelectTrigger aria-label="Select light theme" className="min-w-32">
                                    <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64 min-w-40">
                                    {lightThemes.map((theme) => (
                                        <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                            {formatThemeLabel(theme.metadata.name, 'light')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <h4 className="typography-ui-label font-medium text-foreground">Dark Theme</h4>
                            <Select value={selectedDarkTheme?.metadata.id ?? ''} onValueChange={setDarkThemePreference}>
                                <SelectTrigger aria-label="Select dark theme" className="min-w-32">
                                    <SelectValue placeholder="Select theme" />
                                </SelectTrigger>
                                <SelectContent className="max-h-64 min-w-40">
                                    {darkThemes.map((theme) => (
                                        <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                            {formatThemeLabel(theme.metadata.name, 'dark')}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <button
                            type="button"
                            disabled={customThemesLoading || themesReloading}
                            onClick={async () => {
                                setThemesReloading(true);
                                try {
                                    await reloadCustomThemes();
                                } finally {
                                    setThemesReloading(false);
                                }
                            }}
                            className="typography-ui-label text-muted-foreground hover:text-foreground hover:underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                            <RiRestartLine className={cn('h-3.5 w-3.5', themesReloading && 'animate-spin')} />
                            Reload custom themes
                        </button>
                        <p className="typography-meta text-muted-foreground/70">
                            Import themes from ~/.config/openchamber/themes/
                        </p>
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
                            className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                            aria-label="Reset font size"
                            title="Reset"
                        >
                            <RiRestartLine className="h-3.5 w-3.5" />
                        </ButtonSmall>
                    </div>
                </div>
            )}

            {shouldShow('terminalFontSize') && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Terminal Font Size
                        </h3>

                    </div>
                    {isMobile ? (
                        <div className="flex items-center gap-2 w-full">
                            <input
                                type="range"
                                min="9"
                                max="52"
                                step="1"
                                value={terminalFontSize}
                                onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                                className="flex-1 min-w-0 h-3 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                                aria-label="Terminal font size"
                            />

                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                {terminalFontSize}px
                            </span>

                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setTerminalFontSize(13)}
                                disabled={terminalFontSize === 13}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset terminal font size"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 w-full max-w-md">
                            <input
                                type="range"
                                min="9"
                                max="52"
                                step="1"
                                value={terminalFontSize}
                                onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                                className="flex-1 min-w-0 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                            />
                            <NumberInput
                                value={terminalFontSize}
                                onValueChange={setTerminalFontSize}
                                min={9}
                                max={52}
                                step={1}
                                aria-label="Terminal font size"
                            />
                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setTerminalFontSize(13)}
                                disabled={terminalFontSize === 13}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset terminal font size"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    )}
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
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
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
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset spacing"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    )}
                </div>
            )}

            {shouldShow('terminalQuickKeys') && !isMobile && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Show terminal optional key bar
                        </h3>
                        <p className="typography-ui text-muted-foreground">
                            Esc, Ctrl, arrows, Enter.
                        </p>
                    </div>

                    <Switch
                        checked={showTerminalQuickKeysOnDesktop}
                        onCheckedChange={setShowTerminalQuickKeysOnDesktop}
                        className="data-[state=checked]:bg-status-info"
                    />
                </div>
            )}

            {shouldShow('cornerRadius') && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Input Field Corner Radius
                        </h3>
                    </div>

                    {isMobile ? (
                        <div className="flex items-center gap-2 w-full">
                            <input
                                type="range"
                                min="0"
                                max="32"
                                step="1"
                                value={cornerRadius}
                                onChange={(e) => setCornerRadius(Number(e.target.value))}
                                className="flex-1 min-w-0 h-3 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                                aria-label="Corner radius in pixels"
                            />

                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                {cornerRadius}px
                            </span>

                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setCornerRadius(12)}
                                disabled={cornerRadius === 12}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset corner radius"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 w-full max-w-md">
                            <input
                                type="range"
                                min="0"
                                max="32"
                                step="1"
                                value={cornerRadius}
                                onChange={(e) => setCornerRadius(Number(e.target.value))}
                                className="flex-1 min-w-0 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                                aria-label="Corner radius in pixels"
                            />
                            <NumberInput
                                value={cornerRadius}
                                onValueChange={setCornerRadius}
                                min={0}
                                max={32}
                                step={1}
                                aria-label="Corner radius in pixels"
                            />
                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setCornerRadius(12)}
                                disabled={cornerRadius === 12}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset corner radius"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    )}
                </div>
            )}

            {shouldShow('inputBarOffset') && (
                <div className="space-y-4">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Input Bar Offset
                        </h3>
                        <p className="typography-meta text-muted-foreground">
                            Raise the input bar to avoid screen obstructions.
                        </p>
                    </div>

                    {isMobile ? (
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
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset input bar offset"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 w-full max-w-md">
                            <input
                                type="range"
                                min="0"
                                max="100"
                                step="5"
                                value={inputBarOffset}
                                onChange={(e) => setInputBarOffset(Number(e.target.value))}
                                className="flex-1 min-w-0 h-2 bg-muted rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-0"
                                aria-label="Input bar offset in pixels"
                            />
                            <NumberInput
                                value={inputBarOffset}
                                onValueChange={setInputBarOffset}
                                min={0}
                                max={100}
                                step={5}
                                aria-label="Input bar offset in pixels"
                            />
                            <ButtonSmall
                                type="button"
                                variant="ghost"
                                onClick={() => setInputBarOffset(0)}
                                disabled={inputBarOffset === 0}
                                className="h-8 w-8 px-0 border border-border bg-background hover:bg-interactive-hover disabled:opacity-100 disabled:bg-background"
                                aria-label="Reset input bar offset"
                                title="Reset"
                            >
                                <RiRestartLine className="h-3.5 w-3.5" />
                            </ButtonSmall>
                        </div>
                    )}
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

            {shouldShow('diffLayout') && !isMobile && !isVSCodeRuntime() && (
                <div className="space-y-6">
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

                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Diff view (Diff tab)
                        </h3>
                        <p className="typography-meta text-muted-foreground/80">
                            Choose whether the Diff tab defaults to a single file or all files.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 w-fit">
                            {DIFF_VIEW_MODE_OPTIONS.map((option) => (
                                <ButtonSmall
                                    key={option.id}
                                    variant={diffViewMode === option.id ? 'default' : 'outline'}
                                    className={cn(diffViewMode === option.id ? undefined : 'text-foreground')}
                                    onClick={() => setDiffViewMode(option.id)}
                                >
                                    {option.label}
                                </ButtonSmall>
                            ))}
                        </div>
                        <p className="typography-meta text-muted-foreground/80 max-w-xl">
                            {DIFF_VIEW_MODE_OPTIONS.find((option) => option.id === diffViewMode)?.description}
                        </p>
                    </div>

                </div>
            )}

            {shouldShow('dotfiles') && !isVSCodeRuntime() && (
                <div className="space-y-3">
                    <div className="space-y-1">
                        <h3 className="typography-ui-header font-semibold text-foreground">
                            Hidden files (Chat)
                        </h3>
                        <p className="typography-meta text-muted-foreground/80">
                            Show or hide dotfiles in file lists and directory pickers.
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex gap-1 w-fit">
                            {[
                                { id: 'hide', label: 'Hide', value: false },
                                { id: 'show', label: 'Show', value: true },
                            ].map((option) => (
                                <ButtonSmall
                                    key={option.id}
                                    variant={directoryShowHidden === option.value ? 'default' : 'outline'}
                                    className={cn(directoryShowHidden === option.value ? undefined : 'text-foreground')}
                                    onClick={() => setDirectoryShowHidden(option.value)}
                                >
                                    {option.label}
                                </ButtonSmall>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {shouldShow('reasoning') && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                        checked={showReasoningTraces}
                        onChange={setShowReasoningTraces}
                    />
                    <span className="typography-ui-header font-semibold text-foreground">
                        Show thinking / reasoning traces
                    </span>
                </label>
            )}

            {shouldShow('textJustificationActivity') && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                        checked={showTextJustificationActivity}
                        onChange={setShowTextJustificationActivity}
                    />
                    <span className="typography-ui-header font-semibold text-foreground">
                        Show text justification in activity
                    </span>
                </label>
            )}

            {shouldShow('queueMode') && (
                <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                            checked={queueModeEnabled}
                            onChange={setQueueMode}
                        />
                        <span className="typography-ui-header font-semibold text-foreground">
                            Queue messages by default
                        </span>
                    </label>
                    <p className="typography-meta text-muted-foreground pl-5">
                        {queueModeEnabled 
                            ? `Enter queues messages, ${getModifierLabel()}+Enter sends immediately.` 
                            : `Enter sends immediately, ${getModifierLabel()}+Enter queues messages.`}
                    </p>
                </div>
            )}
        </div>
    );
};
