import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { MARKDOWN_MODE_VARIABLES, type MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { createUserMarkdown } from '@/components/chat/message/markdownPresets';
import { CODE_FONT_OPTIONS, CODE_FONT_OPTION_MAP, UI_FONT_OPTIONS, UI_FONT_OPTION_MAP } from '@/lib/fontOptions';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

const PREVIEW_MARKDOWN = `### Sample Heading
Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed ac aliquet lacus. Nulla facilisi.

- Bullet one for quick tasks
- Bullet two with additional details`;

const MARKDOWN_PREVIEW_STYLES: Record<MarkdownDisplayMode, React.CSSProperties> = Object.entries(MARKDOWN_MODE_VARIABLES).reduce(
    (acc, [key, variables]) => {
        const style: React.CSSProperties = {};
        Object.entries(variables).forEach(([varName, value]) => {
            (style as any)[varName] = value;
        });
        acc[key as MarkdownDisplayMode] = style;
        return acc;
    },
    {} as Record<MarkdownDisplayMode, React.CSSProperties>
);

const CODE_PREVIEW_SNIPPET = `function greet(name: string) {
  return \`Hello, \${name}!\`;
}`;

const DISPLAY_MODE_OPTIONS: Array<{
    id: MarkdownDisplayMode;
    title: string;
    description: string;
}> = [
    {
        id: 'compact',
        title: 'Compact',
        description: 'Tighter layout with minimal spacing to show more information per screen.',
    },
    {
        id: 'comfort',
        title: 'Comfort',
        description: 'Increased spacing and clearer headings for easier reading.',
    },
];

export const AppearanceSettings: React.FC = () => {
    const [mode, setMode] = useMarkdownDisplayMode();
    const { uiFont, monoFont, setUiFont, setMonoFont } = useFontPreferences();
    const markdownConfig = React.useMemo(() => createUserMarkdown({ isMobile: false }), []);

    return (
        <div className="flex flex-col gap-4">
            <header className="space-y-1">
                <h1 className="typography-h2 font-semibold text-foreground">Appearance</h1>
                <p className="typography-meta text-muted-foreground/80">
                    Configure how markdown looks in chat: choose between a dense or a comfortable reading mode.
                </p>
            </header>

            <Card>
                <CardHeader>
                    <CardTitle className="typography-ui-header">Markdown Reading Mode</CardTitle>
                    <CardDescription>
                        The selected mode affects assistant, user, and tool messages.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={mode} onValueChange={(value: MarkdownDisplayMode) => setMode(value)}>
                        <SelectTrigger className="w-full justify-between md:min-w-[220px]">
                            <SelectValue>
                                {DISPLAY_MODE_OPTIONS.find((option) => option.id === mode)?.title ?? 'Choose mode'}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent
                            position="popper"
                            align="start"
                            sideOffset={6}
                            className="max-h-64 rounded-lg border bg-popover"
                            style={{
                                width: 'var(--radix-select-trigger-width)',
                                minWidth: 'var(--radix-select-trigger-width)',
                                maxWidth: 'calc(100vw - 2.5rem)'
                            }}
                        >
                            {DISPLAY_MODE_OPTIONS.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    <div className="flex flex-col">
                                        <span>{option.title}</span>
                                        <span className="typography-meta text-muted-foreground/70">
                                            {option.description}
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <div
                        className="rounded-md border border-border/40 bg-muted/20 p-4"
                        style={MARKDOWN_PREVIEW_STYLES[mode]}
                    >
                        <ReactMarkdown
                            remarkPlugins={markdownConfig.remarkPlugins}
                            components={markdownConfig.components}
                        >
                            {PREVIEW_MARKDOWN}
                        </ReactMarkdown>
                    </div>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="typography-ui-header">Interface Font</CardTitle>
                    <CardDescription>
                        Controls navigation, dialogs, and general interface text.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <Select value={uiFont} onValueChange={setUiFont}>
                        <SelectTrigger className="w-full justify-between md:min-w-[220px]">
                            <SelectValue>
                                {UI_FONT_OPTION_MAP[uiFont]?.label ?? 'Choose font'}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent
                            position="popper"
                            align="start"
                            sideOffset={6}
                            className="max-h-64 rounded-lg border bg-popover"
                            style={{
                                width: 'var(--radix-select-trigger-width)',
                                minWidth: 'var(--radix-select-trigger-width)',
                                maxWidth: 'calc(100vw - 2.5rem)'
                            }}
                        >
                            {UI_FONT_OPTIONS.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    <div className="flex flex-col">
                                        <span>{option.label}</span>
                                        <span className="typography-meta text-muted-foreground/70">
                                            {option.description}
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <CardTitle className="typography-ui-header">Code Font</CardTitle>
                    <CardDescription>
                        Affects code blocks, tool results, diagnostics, and other monospace elements.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Select value={monoFont} onValueChange={setMonoFont}>
                        <SelectTrigger className="w-full justify-between md:min-w-[220px]">
                            <SelectValue>
                                {CODE_FONT_OPTION_MAP[monoFont]?.label ?? 'Choose code font'}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent
                            position="popper"
                            align="start"
                            sideOffset={6}
                            className="max-h-64 rounded-lg border bg-popover"
                            style={{
                                width: 'var(--radix-select-trigger-width)',
                                minWidth: 'var(--radix-select-trigger-width)',
                                maxWidth: 'calc(100vw - 2.5rem)'
                            }}
                        >
                            {CODE_FONT_OPTIONS.map((option) => (
                                <SelectItem key={option.id} value={option.id}>
                                    <div className="flex flex-col">
                                        <span>{option.label}</span>
                                        <span className="typography-meta text-muted-foreground/70">
                                            {option.description}
                                        </span>
                                    </div>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <pre
                        className="rounded-md border border-border/40 bg-muted/20 p-4 text-sm leading-6 text-foreground/90"
                        style={{ fontFamily: CODE_FONT_OPTION_MAP[monoFont]?.stack }}
                    >
                        {CODE_PREVIEW_SNIPPET}
                    </pre>
                </CardContent>
            </Card>
        </div>
    );
};
