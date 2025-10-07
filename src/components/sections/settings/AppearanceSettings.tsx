import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useMarkdownDisplayMode } from '@/hooks/useMarkdownDisplayMode';
import { cn } from '@/lib/utils';
import { MARKDOWN_MODE_VARIABLES, type MarkdownDisplayMode } from '@/lib/markdownDisplayModes';
import { createUserMarkdown } from '@/components/chat/message/markdownPresets';

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
                <CardContent className="grid gap-3 md:grid-cols-2">
                    {DISPLAY_MODE_OPTIONS.map((option) => {
                        const isActive = mode === option.id;
                        const previewStyle = MARKDOWN_PREVIEW_STYLES[option.id];
                        return (
                            <div
                                key={option.id}
                                className={cn(
                                    'flex flex-col gap-3 rounded-lg border p-4 transition-colors',
                                    isActive ? 'border-primary/60 bg-accent/70' : 'border-border/60 bg-background'
                                )}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div>
                                        <div className="typography-ui-header font-semibold text-foreground">
                                            {option.title}
                                        </div>
                                        <p className="typography-meta text-muted-foreground/80">
                                            {option.description}
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant={isActive ? 'default' : 'outline'}
                                        onClick={() => setMode(option.id)}
                                    >
                                        {isActive ? 'Selected' : 'Apply'}
                                    </Button>
                                </div>
                                <div
                                    className="rounded-md border border-border/40 bg-muted/20 p-4"
                                    style={previewStyle}
                                >
                                    <ReactMarkdown
                                        remarkPlugins={markdownConfig.remarkPlugins}
                                        components={markdownConfig.components}
                                    >
                                        {PREVIEW_MARKDOWN}
                                    </ReactMarkdown>
                                </div>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>
        </div>
    );
};
