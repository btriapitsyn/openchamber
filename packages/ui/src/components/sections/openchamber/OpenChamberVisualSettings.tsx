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
        description: 'New inline, modified side-by-side.',
    },
    {
        id: 'inline',
        label: 'Always inline',
        description: 'Show as a single unified view.',
    },
    {
        id: 'side-by-side',
        label: 'Always side-by-side',
        description: 'Compare original and modified files.',
    },
];

const DIFF_VIEW_MODE_OPTIONS: Option<'single' | 'stacked'>[] = [
    {
        id: 'single',
        label: 'Single file',
        description: 'Show one file at a time.',
    },
    {
        id: 'stacked',
        label: 'All files',
        description: 'Stack all changed files together.',
    },
];

export type VisibleSetting = 'theme' | 'fontSize' | 'terminalFontSize' | 'spacing' | 'cornerRadius' | 'inputBarOffset' | 'toolOutput' | 'diffLayout' | 'dotfiles' | 'reasoning' | 'queueMode' | 'textJustificationActivity' | 'terminalQuickKeys' | 'persistDraft';

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
    const persistChatDraft = useUIStore(state => state.persistChatDraft);
    const setPersistChatDraft = useUIStore(state => state.setPersistChatDraft);
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

    const hasAppearanceSettings = shouldShow('theme') && !isVSCodeRuntime();
    const hasLayoutSettings = shouldShow('fontSize') || shouldShow('terminalFontSize') || shouldShow('spacing') || shouldShow('cornerRadius') || shouldShow('inputBarOffset');
    const hasBehaviorSettings = shouldShow('toolOutput') || shouldShow('diffLayout') || shouldShow('dotfiles') || shouldShow('reasoning') || shouldShow('queueMode') || shouldShow('textJustificationActivity') || shouldShow('terminalQuickKeys') || shouldShow('persistDraft');

    return (
        <div className="w-full h-full overflow-y-auto bg-background">
            <div className="mx-auto w-full max-w-4xl px-5 py-6">

                {/* --- Appearance & Themes --- */}
                {hasAppearanceSettings && (
                    <div className="mb-8">
                        <div className="mb-3 px-1">
                            <h3 className="typography-ui-header font-semibold text-foreground">
                                Theme Preferences
                            </h3>
                            <p className="typography-meta text-muted-foreground mt-0.5">
                                Customize the visual color scheme of OpenChamber.
                            </p>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
                            
                            <div className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="flex min-w-0 flex-col">
                                    <span className="typography-ui-label text-foreground">Color Mode</span>
                                    <span className="typography-meta text-muted-foreground">Select your interface color scheme</span>
                                </div>
                                <div className="flex items-center gap-1">
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

                            <div className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="flex min-w-0 flex-col">
                                    <span className="typography-ui-label text-foreground">Light Theme</span>
                                    <span className="typography-meta text-muted-foreground">Used when in light mode</span>
                                </div>
                                <Select value={selectedLightTheme?.metadata.id ?? ''} onValueChange={setLightThemePreference}>
                                    <SelectTrigger aria-label="Select light theme" className="w-fit">
                                        <SelectValue placeholder="Select theme" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {lightThemes.map((theme) => (
                                            <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                                {formatThemeLabel(theme.metadata.name, 'light')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex items-center justify-between gap-4 px-4 py-3">
                                <div className="flex min-w-0 flex-col">
                                    <span className="typography-ui-label text-foreground">Dark Theme</span>
                                    <span className="typography-meta text-muted-foreground">Used when in dark mode</span>
                                </div>
                                <Select value={selectedDarkTheme?.metadata.id ?? ''} onValueChange={setDarkThemePreference}>
                                    <SelectTrigger aria-label="Select dark theme" className="w-fit">
                                        <SelectValue placeholder="Select theme" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {darkThemes.map((theme) => (
                                            <SelectItem key={theme.metadata.id} value={theme.metadata.id}>
                                                {formatThemeLabel(theme.metadata.name, 'dark')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="mt-3 px-3 flex items-center justify-between">
                            <p className="typography-meta text-muted-foreground/70">
                                Import custom themes from ~/.config/openchamber/themes/
                            </p>
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
                                className="typography-meta text-muted-foreground hover:text-foreground hover:bg-interactive-hover/50 px-2 py-1 rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
                            >
                                <RiRestartLine className={cn('h-3.5 w-3.5', themesReloading && 'animate-spin')} />
                                Reload themes
                            </button>
                        </div>
                    </div>
                )}

                {/* --- UI Scaling & Layout --- */}
                {hasLayoutSettings && (
                    <div className="mb-8">
                        <div className="mb-3 px-1">
                            <h3 className="typography-ui-header font-semibold text-foreground">
                                UI Scaling & Layout
                            </h3>
                            <p className="typography-meta text-muted-foreground mt-0.5">
                                Adjust text sizes, spacing, and structural element scaling.
                            </p>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
                            
                            {shouldShow('fontSize') && !isMobile && (
                                <div className="flex items-center justify-between gap-6 px-4 py-3">
                                    <div className="flex min-w-0 flex-col w-1/3 shrink-0">
                                        <span className="typography-ui-label text-foreground">Font Size</span>
                                        <span className="typography-meta text-muted-foreground">Base interface text scale</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
                                        <input
                                            type="range"
                                            min="50"
                                            max="200"
                                            step="5"
                                            value={fontSize}
                                            onChange={(e) => setFontSize(Number(e.target.value))}
                                            className="flex-1 min-w-0 h-2 bg-[var(--surface-subtle)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:border-0"
                                        />
                                        <NumberInput
                                            value={fontSize}
                                            onValueChange={setFontSize}
                                            min={50}
                                            max={200}
                                            step={5}
                                            aria-label="Font size percentage"
                                            className="w-16"
                                        />
                                        <ButtonSmall
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setFontSize(100)}
                                            disabled={fontSize === 100}
                                            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Reset font size"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </ButtonSmall>
                                    </div>
                                </div>
                            )}

                            {shouldShow('terminalFontSize') && (
                                <div className="flex items-center justify-between gap-6 px-4 py-3">
                                    <div className="flex min-w-0 flex-col w-1/3 shrink-0">
                                        <span className="typography-ui-label text-foreground">Terminal Font Size</span>
                                        <span className="typography-meta text-muted-foreground">Scale text in the terminal view</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
                                        <input
                                            type="range"
                                            min="9"
                                            max="52"
                                            step="1"
                                            value={terminalFontSize}
                                            onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                                            className="flex-1 min-w-0 h-2 bg-[var(--surface-subtle)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:border-0"
                                        />
                                        {!isMobile ? (
                                            <NumberInput
                                                value={terminalFontSize}
                                                onValueChange={setTerminalFontSize}
                                                min={9}
                                                max={52}
                                                step={1}
                                                className="w-16"
                                            />
                                        ) : (
                                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                                {terminalFontSize}px
                                            </span>
                                        )}
                                        <ButtonSmall
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setTerminalFontSize(13)}
                                            disabled={terminalFontSize === 13}
                                            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Reset terminal font size"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </ButtonSmall>
                                    </div>
                                </div>
                            )}

                            {shouldShow('spacing') && (
                                <div className="flex items-center justify-between gap-6 px-4 py-3">
                                    <div className="flex min-w-0 flex-col w-1/3 shrink-0">
                                        <span className="typography-ui-label text-foreground">Spacing Density</span>
                                        <span className="typography-meta text-muted-foreground">Adjust padding around elements</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
                                        <input
                                            type="range"
                                            min="50"
                                            max="200"
                                            step="5"
                                            value={padding}
                                            onChange={(e) => setPadding(Number(e.target.value))}
                                            className="flex-1 min-w-0 h-2 bg-[var(--surface-subtle)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:border-0"
                                        />
                                        {!isMobile ? (
                                            <NumberInput
                                                value={padding}
                                                onValueChange={setPadding}
                                                min={50}
                                                max={200}
                                                step={5}
                                                className="w-16"
                                            />
                                        ) : (
                                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                                {padding}
                                            </span>
                                        )}
                                        <ButtonSmall
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setPadding(100)}
                                            disabled={padding === 100}
                                            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Reset spacing"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </ButtonSmall>
                                    </div>
                                </div>
                            )}

                            {shouldShow('cornerRadius') && (
                                <div className="flex items-center justify-between gap-6 px-4 py-3">
                                    <div className="flex min-w-0 flex-col w-1/3 shrink-0">
                                        <span className="typography-ui-label text-foreground">Corner Radius</span>
                                        <span className="typography-meta text-muted-foreground">Adjust rounded corners of inputs</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
                                        <input
                                            type="range"
                                            min="0"
                                            max="32"
                                            step="1"
                                            value={cornerRadius}
                                            onChange={(e) => setCornerRadius(Number(e.target.value))}
                                            className="flex-1 min-w-0 h-2 bg-[var(--surface-subtle)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:border-0"
                                        />
                                        {!isMobile ? (
                                            <NumberInput
                                                value={cornerRadius}
                                                onValueChange={setCornerRadius}
                                                min={0}
                                                max={32}
                                                step={1}
                                                className="w-16"
                                            />
                                        ) : (
                                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                                {cornerRadius}px
                                            </span>
                                        )}
                                        <ButtonSmall
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setCornerRadius(12)}
                                            disabled={cornerRadius === 12}
                                            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Reset corner radius"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </ButtonSmall>
                                    </div>
                                </div>
                            )}

                            {shouldShow('inputBarOffset') && (
                                <div className="flex items-center justify-between gap-6 px-4 py-3">
                                    <div className="flex min-w-0 flex-col w-1/3 shrink-0">
                                        <span className="typography-ui-label text-foreground">Input Bar Offset</span>
                                        <span className="typography-meta text-muted-foreground">Raise input bar to avoid obstructions</span>
                                    </div>
                                    <div className="flex items-center gap-3 flex-1 max-w-xs justify-end">
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            step="5"
                                            value={inputBarOffset}
                                            onChange={(e) => setInputBarOffset(Number(e.target.value))}
                                            className="flex-1 min-w-0 h-2 bg-[var(--surface-subtle)] rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--primary-base)] [&::-moz-range-thumb]:border-0"
                                        />
                                        {!isMobile ? (
                                            <NumberInput
                                                value={inputBarOffset}
                                                onValueChange={setInputBarOffset}
                                                min={0}
                                                max={100}
                                                step={5}
                                                className="w-16"
                                            />
                                        ) : (
                                            <span className="typography-ui-label font-medium text-foreground tabular-nums rounded-md border border-border bg-background px-2 py-1.5 min-w-[3.75rem] text-center">
                                                {inputBarOffset}px
                                            </span>
                                        )}
                                        <ButtonSmall
                                            type="button"
                                            variant="ghost"
                                            onClick={() => setInputBarOffset(0)}
                                            disabled={inputBarOffset === 0}
                                            className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
                                            aria-label="Reset input bar offset"
                                            title="Reset"
                                        >
                                            <RiRestartLine className="h-3.5 w-3.5" />
                                        </ButtonSmall>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                )}

                {/* --- Workspace Behavior --- */}
                {hasBehaviorSettings && (
                    <div className="mb-8">
                        <div className="mb-3 px-1">
                            <h3 className="typography-ui-header font-semibold text-foreground">
                                Workspace Behavior
                            </h3>
                            <p className="typography-meta text-muted-foreground mt-0.5">
                                Configure agent interactions, UI components, and defaults.
                            </p>
                        </div>
                        <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
                            
                            {shouldShow('toolOutput') && (
                                <div className="flex items-center justify-between gap-4 px-4 py-3">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Default Tool Output</span>
                                        <span className="typography-meta text-muted-foreground">
                                            {TOOL_EXPANSION_OPTIONS.find(o => o.value === toolCallExpansion)?.description}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1">
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
                                <>
                                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                                        <div className="flex min-w-0 flex-col">
                                            <span className="typography-ui-label text-foreground">Diff Layout</span>
                                            <span className="typography-meta text-muted-foreground">
                                                {DIFF_LAYOUT_OPTIONS.find(o => o.id === diffLayoutPreference)?.description}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
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
                                    </div>

                                    <div className="flex items-center justify-between gap-4 px-4 py-3">
                                        <div className="flex min-w-0 flex-col">
                                            <span className="typography-ui-label text-foreground">Diff View Mode</span>
                                            <span className="typography-meta text-muted-foreground">
                                                {DIFF_VIEW_MODE_OPTIONS.find(o => o.id === diffViewMode)?.description}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
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
                                    </div>
                                </>
                            )}

                            {shouldShow('dotfiles') && !isVSCodeRuntime() && (
                                <div className="flex items-center justify-between gap-4 px-4 py-3">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Hidden Files</span>
                                        <span className="typography-meta text-muted-foreground">Show dotfiles in directories</span>
                                    </div>
                                    <div className="flex items-center gap-1">
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
                            )}

                            {/* Toggles start here */}
                            
                            {shouldShow('queueMode') && (
                                <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Queue Messages</span>
                                        <span className="typography-meta text-muted-foreground">
                                            {queueModeEnabled ? `Enter queues messages, ${getModifierLabel()}+Enter sends` : `Enter sends immediately, ${getModifierLabel()}+Enter queues`}
                                        </span>
                                    </div>
                                    <Switch
                                        checked={queueModeEnabled}
                                        onCheckedChange={setQueueMode}
                                        className="data-[state=checked]:bg-[var(--primary-base)]"
                                    />
                                </label>
                            )}

                            {shouldShow('persistDraft') && (
                                <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Persist Draft</span>
                                        <span className="typography-meta text-muted-foreground">
                                            Save typed messages across app reloads
                                        </span>
                                    </div>
                                    <Switch
                                        checked={persistChatDraft}
                                        onCheckedChange={setPersistChatDraft}
                                        className="data-[state=checked]:bg-[var(--primary-base)]"
                                    />
                                </label>
                            )}

                            {shouldShow('reasoning') && (
                                <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Show Reasoning Traces</span>
                                        <span className="typography-meta text-muted-foreground">
                                            Display the agent's internal thinking process
                                        </span>
                                    </div>
                                    <Switch
                                        checked={showReasoningTraces}
                                        onCheckedChange={setShowReasoningTraces}
                                        className="data-[state=checked]:bg-[var(--primary-base)]"
                                    />
                                </label>
                            )}

                            {shouldShow('textJustificationActivity') && (
                                <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Text Justification Activity</span>
                                        <span className="typography-meta text-muted-foreground">
                                            Show justification details in the activity feed
                                        </span>
                                    </div>
                                    <Switch
                                        checked={showTextJustificationActivity}
                                        onCheckedChange={setShowTextJustificationActivity}
                                        className="data-[state=checked]:bg-[var(--primary-base)]"
                                    />
                                </label>
                            )}

                            {shouldShow('terminalQuickKeys') && !isMobile && (
                                <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30">
                                    <div className="flex min-w-0 flex-col">
                                        <span className="typography-ui-label text-foreground">Terminal Quick Keys</span>
                                        <span className="typography-meta text-muted-foreground">
                                            Show Esc, Ctrl, Arrows in terminal view
                                        </span>
                                    </div>
                                    <Switch
                                        checked={showTerminalQuickKeysOnDesktop}
                                        onCheckedChange={setShowTerminalQuickKeysOnDesktop}
                                        className="data-[state=checked]:bg-[var(--primary-base)]"
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                )}
                
            </div>
        </div>
    );
};
