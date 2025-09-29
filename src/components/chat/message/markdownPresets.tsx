import React from 'react';
import { Maximize2, Copy, Check } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import type { ToolPopupContent } from './types';

interface AssistantMarkdownContext {
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    allowAnimation: boolean;
}

const applyAnimation = (animateText: any, content: React.ReactNode) => {
    if (typeof animateText === 'function') {
        return animateText(content);
    }
    return content;
};

const baseMarkdownStyle = {
    fontSize: 'var(--text-markdown)',
    lineHeight: '1.45',
    letterSpacing: 'var(--markdown-body-letter-spacing)',
    fontWeight: 'var(--markdown-body-font-weight)',
    whiteSpace: 'normal',
} as React.CSSProperties;

export const createAssistantMarkdownComponents = ({
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    onShowPopup,
    allowAnimation,
}: AssistantMarkdownContext) => ({
    h1: ({ children, animateText, className, ...rest }: any) => (
        <h1
            {...rest}
            className={cn('mt-2 mb-1 font-semibold', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading1)' }}
        >
            {applyAnimation(animateText, children)}
        </h1>
    ),
    h2: ({ children, animateText, className, ...rest }: any) => (
        <h2
            {...rest}
            className={cn('mt-2 mb-1 font-semibold', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading2)' }}
        >
            {applyAnimation(animateText, children)}
        </h2>
    ),
    h3: ({ children, animateText, className, ...rest }: any) => (
        <h3
            {...rest}
            className={cn('mt-2 mb-1 font-semibold', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading3)' }}
        >
            {applyAnimation(animateText, children)}
        </h3>
    ),
    h4: ({ children, animateText, className, ...rest }: any) => (
        <h4
            {...rest}
            className={cn('mt-1 mb-1 font-medium', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading4, var(--foreground))' }}
        >
            {applyAnimation(animateText, children)}
        </h4>
    ),
    p: ({ children, animateText, className, ...rest }: any) => (
        <p
            {...rest}
            className={cn('mb-1', className)}
            style={baseMarkdownStyle}
        >
            {applyAnimation(animateText, children)}
        </p>
    ),
    ul: ({ children, animateText, className, ...rest }: any) => (
        <ul
            {...rest}
            className={cn('list-disc pl-4 mb-1', className)}
            style={{ ...baseMarkdownStyle, '--tw-prose-bullets': 'var(--markdown-list-marker)' } as React.CSSProperties}
        >
            {children}
        </ul>
    ),
    ol: ({ children, animateText, className, start, ...rest }: any) => (
        <ol
            {...rest}
            className={cn('list-decimal pl-4 mb-1', className)}
            style={{ ...baseMarkdownStyle, '--tw-prose-counters': 'var(--markdown-list-marker)' } as React.CSSProperties}
            start={start}
        >
            {children}
        </ol>
    ),
    li: ({ children, animateText, className, value, checked, ...rest }: any) => (
        <li
            {...rest}
            className={cn('text-foreground/90', className)}
            style={baseMarkdownStyle}
            value={value}
            data-checked={checked}
        >
            {applyAnimation(animateText, children)}
        </li>
    ),
    blockquote: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <blockquote
                {...rest}
                className={cn(
                    'border-l-4 border-muted pl-4 my-1 italic text-muted-foreground',
                    allowAnimation && 'flowtoken-blockquote-animating',
                    className
                )}
                style={{ ...baseMarkdownStyle, whiteSpace: 'normal' }}
            >
                {content}
            </blockquote>
        );
    },
    hr: ({ className, ...rest }: any) => (
        <hr {...rest} className={cn('my-4 border-t border-border', className)} />
    ),
    a: ({ children, animateText, className, href, title, ...rest }: any) => (
        <a
            {...rest}
            href={href}
            title={title}
            className={cn('hover:underline', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--markdown-link)' }}
            target="_blank"
            rel="noopener noreferrer"
        >
            {applyAnimation(animateText, children)}
        </a>
    ),
    strong: ({ children, animateText, className, ...rest }: any) => (
        <strong
            {...rest}
            className={cn('font-semibold text-foreground', className)}
            style={baseMarkdownStyle}
        >
            {applyAnimation(animateText, children)}
        </strong>
    ),
    em: ({ children, animateText, className, ...rest }: any) => (
        <em
            {...rest}
            className={cn('italic', className)}
            style={baseMarkdownStyle}
        >
            {applyAnimation(animateText, children)}
        </em>
    ),
    code: ({ className, children, animateText: _animateText, ...props }: any) => {
        const inline = !className?.startsWith('language-');
        const match = /language-(\w+)/.exec(className || '');
        const code = String(children).replace(/\n$/, '');

        if (!inline && match) {
            return (
                <div className="relative group my-0">
                    <div className="absolute right-2 top-2 flex gap-1 z-10">
                        <Button
                            size="sm"
                            variant="ghost"
                            className={cn(
                                'transition-opacity',
                                isMobile ? 'h-6 px-1.5 opacity-70 hover:opacity-100' : 'h-7 px-2 opacity-0 group-hover:opacity-100'
                            )}
                            onClick={() => {
                                onShowPopup({
                                    open: true,
                                    title: `Code Block - ${match[1]}`,
                                    content: code,
                                    language: match[1],
                                    isDiff: false,
                                });
                            }}
                        >
                            <Maximize2 className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                        </Button>
                        <Button
                            size="sm"
                            variant="ghost"
                            className={cn(
                                'transition-opacity',
                                isMobile ? 'h-6 px-1.5 opacity-70 hover:opacity-100' : 'h-7 px-2 opacity-0 group-hover:opacity-100'
                            )}
                            onClick={() => onCopyCode(code)}
                        >
                            {copiedCode === code ? (
                                <Check className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                            ) : (
                                <Copy className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                            )}
                        </Button>
                    </div>
                    <div
                        className={cn(
                            'overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full',
                            isMobile ? 'p-3 pr-16' : 'p-3'
                        )}
                    >
                        <SyntaxHighlighter
                            style={syntaxTheme}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{
                                margin: 0,
                                padding: 0,
                                ...typography.markdown.codeBlock,
                                background: 'var(--syntax-background)',
                                borderRadius: 0,
                                overflowX: 'auto',
                            }}
                        >
                            {code}
                        </SyntaxHighlighter>
                    </div>
                </div>
            );
        }

        return (
            <code
                {...props}
                className={cn('px-0.5 font-mono font-medium', className)}
                style={{
                    ...typography.markdown.code,
                    color: 'var(--markdown-inline-code)',
                    backgroundColor: 'var(--markdown-inline-code-bg)',
                }}
            >
                {children}
            </code>
        );
    },
});

export const createUserMarkdown = () => ({
    remarkPlugins: [remarkGfm],
    components: {
        p: ({ children }: any) => (
            <p className="mb-1 whitespace-pre-wrap typography-markdown" style={baseMarkdownStyle}>
                {children}
            </p>
        ),
        h1: ({ children }: any) => (
            <h1 className="mt-2 mb-1 typography-markdown font-bold" style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading1)' }}>
                {children}
            </h1>
        ),
        h2: ({ children }: any) => (
            <h2 className="mt-2 mb-1 typography-markdown font-semibold" style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading2)' }}>
                {children}
            </h2>
        ),
        h3: ({ children }: any) => (
            <h3 className="mt-2 mb-1 typography-markdown font-semibold" style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading3)' }}>
                {children}
            </h3>
        ),
        h4: ({ children }: any) => (
            <h4 className="mt-1 mb-1 typography-markdown font-medium" style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}>
                {children}
            </h4>
        ),
        ul: ({ children }: any) => (
            <ul className="list-disc pl-5 mb-1 typography-markdown" style={baseMarkdownStyle}>
                {children}
            </ul>
        ),
        ol: ({ children }: any) => (
            <ol className="list-decimal pl-5 mb-1 typography-markdown" style={baseMarkdownStyle}>
                {children}
            </ol>
        ),
        li: ({ children }: any) => (
            <li className="typography-markdown" style={baseMarkdownStyle}>
                {children}
            </li>
        ),
        blockquote: ({ children }: any) => (
            <blockquote
                className="border-l-4 pl-4 my-1 typography-markdown"
                style={{ ...baseMarkdownStyle, borderColor: 'var(--markdown-blockquote-border)', color: 'var(--markdown-blockquote)' }}
            >
                {children}
            </blockquote>
        ),
        hr: () => <hr className="my-4 border-t border-border" />,
        a: ({ href, children }: any) => (
            <a
                href={href}
                className="hover:underline typography-markdown"
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-link)' }}
                target="_blank"
                rel="noopener noreferrer"
            >
                {children}
            </a>
        ),
        strong: ({ children }: any) => (
            <strong className="font-semibold text-foreground typography-markdown" style={baseMarkdownStyle}>
                {children}
            </strong>
        ),
        em: ({ children }: any) => (
            <em className="italic typography-markdown" style={baseMarkdownStyle}>
                {children}
            </em>
        ),
        code: ({ children }: any) => (
            <code
                className="typography-code"
                style={{
                    ...typography.markdown.code,
                    color: 'var(--markdown-inline-code)',
                    backgroundColor: 'var(--markdown-inline-code-bg)',
                    padding: '0.125rem 0.25rem',
                    borderRadius: '0.25rem',
                }}
            >
                {children}
            </code>
        ),
        pre: ({ children }: any) => (
            <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono typography-code whitespace-pre-wrap overflow-x-auto">
                {children}
            </pre>
        ),
    },
});
