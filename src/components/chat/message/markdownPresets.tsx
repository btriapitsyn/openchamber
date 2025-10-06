import React from 'react';
import { ArrowSeparateVertical as Maximize2, Copy, Check } from 'iconoir-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import type { ToolPopupContent } from './types';

const remarkUserSoftBreaks = () => {
    return (tree: any) => {
        const processNode = (node: any) => {
            if (!node || !Array.isArray(node.children)) {
                return;
            }

            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];

                if (!child) {
                    continue;
                }

                if (child.type === 'code' || child.type === 'inlineCode') {
                    continue;
                }

                if (child.type === 'text' && typeof child.value === 'string' && child.value.includes('\n')) {
                    const normalized = child.value.replace(/\r\n/g, '\n');
                    const segments = normalized.split('\n');
                    const replacement: any[] = [];

                    segments.forEach((segment: string, index: number) => {
                        if (index > 0) {
                            replacement.push({ type: 'break' });
                        }
                        if (segment.length > 0) {
                            replacement.push({ type: 'text', value: segment });
                        }
                    });

                    if (replacement.length === 0) {
                        replacement.push({ type: 'break' });
                    }

                    node.children.splice(i, 1, ...replacement);
                    i += replacement.length - 1;
                } else {
                    processNode(child);
                }
            }
        };

        processNode(tree);
    };
};

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

interface ListAnimationCache {
    text: string;
    nodes: React.ReactNode[];
}

const ensureListNodeKey = (node: React.ReactNode, keyRef: React.MutableRefObject<number>) => {
    if (React.isValidElement(node)) {
        if (node.key != null) {
            return node;
        }
        const key = `flowlist-${keyRef.current++}`;
        return React.cloneElement(node, { key });
    }

    const key = `flowlist-${keyRef.current++}`;
    return (
        <React.Fragment key={key}>
            {node}
        </React.Fragment>
    );
};

const animateListContent = (
    animateText: any,
    children: React.ReactNode,
    cacheRef: React.MutableRefObject<ListAnimationCache | null>,
    keyRef: React.MutableRefObject<number>,
) => {
    if (typeof animateText !== 'function') {
        cacheRef.current = null;
        keyRef.current = 0;
        return children;
    }

    const childArray = React.Children.toArray(children);
    if (childArray.length === 0) {
        cacheRef.current = { text: '', nodes: [] };
        keyRef.current = 0;
        return null;
    }

    const isPlainText = childArray.every((child) => typeof child === 'string');
    if (!isPlainText) {
        cacheRef.current = null;
        keyRef.current = 0;
        return applyAnimation(animateText, children);
    }

    const text = childArray.join('');
    const previous = cacheRef.current;

    const rawNodes = React.Children.toArray(animateText(text));

    let result: React.ReactNode[] = [];

    if (!previous || !text.startsWith(previous.text)) {
        keyRef.current = 0;
        result = rawNodes.map((node) => ensureListNodeKey(node, keyRef));
    } else {
        const reuseCount = Math.min(previous.nodes.length, rawNodes.length);
        result = previous.nodes.slice(0, reuseCount);
        keyRef.current = reuseCount;

        for (let i = reuseCount; i < rawNodes.length; i++) {
            result.push(ensureListNodeKey(rawNodes[i], keyRef));
        }
    }

    cacheRef.current = { text, nodes: result };
    keyRef.current = result.length;

    return result;
};

const ListItemAnimatedContent: React.FC<{
    animateText: any;
    allowAnimation: boolean;
    children: React.ReactNode;
}> = ({ animateText, allowAnimation, children }) => {
    const cacheRef = React.useRef<ListAnimationCache | null>(null);
    const keyRef = React.useRef(0);

    const content = React.useMemo(() => {
        if (!allowAnimation) {
            cacheRef.current = null;
            keyRef.current = 0;
            return children;
        }

        return animateListContent(animateText, children, cacheRef, keyRef);
    }, [allowAnimation, animateText, children]);

    return <>{content}</>;
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
    h1: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h1
                {...rest}
                className={cn('mt-2 mb-1 font-semibold', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading1)', fontWeight: 'var(--markdown-h1-font-weight, 700)' }}
            >
                {content}
            </h1>
        );
    },
    h2: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h2
                {...rest}
                className={cn('mt-2 mb-1 font-semibold', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading2)', fontWeight: 'var(--markdown-h2-font-weight, 700)' }}
            >
                {content}
            </h2>
        );
    },
    h3: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h3
                {...rest}
                className={cn('mt-2 mb-1 font-semibold', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading3)', fontWeight: 'var(--markdown-h3-font-weight, 600)' }}
            >
                {content}
            </h3>
        );
    },
    h4: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h4
                {...rest}
                className={cn('mt-1 mb-1 font-medium', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading4, var(--foreground))', fontWeight: 'var(--markdown-h4-font-weight, 600)' }}
            >
                {content}
            </h4>
        );
    },
    h5: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h5
                {...rest}
                className={cn('mt-1 mb-1 font-medium', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading5, var(--foreground))', fontWeight: 'var(--markdown-h5-font-weight, 600)' }}
            >
                {content}
            </h5>
        );
    },
    h6: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <h6
                {...rest}
                className={cn('mt-1 mb-1 font-medium text-muted-foreground/80', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading6, var(--muted-foreground))', fontWeight: 'var(--markdown-h6-font-weight, 600)', letterSpacing: 'var(--markdown-h6-letter-spacing, 0)' }}
            >
                {content}
            </h6>
        );
    },
    p: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <p
                {...rest}
                className={cn('mb-1', className)}
                style={baseMarkdownStyle}
            >
                {content}
            </p>
        );
    },
    ul: ({ children, animateText: _animateText, className, ...rest }: any) => (
        <ul
            {...rest}
            className={cn(
                'list-disc mb-1',
                isMobile ? 'list-inside pl-5' : 'list-outside pl-6',
                className
            )}
            style={{
                ...baseMarkdownStyle,
                listStylePosition: isMobile ? 'inside' : 'outside',
                paddingInlineStart: isMobile ? '1.25rem' : '1.5rem',
                marginInlineStart: isMobile ? '0' : '0.25rem',
                textTransform: 'none',
                fontVariant: 'normal',
                '--tw-prose-bullets': 'var(--markdown-list-marker)'
            } as React.CSSProperties}
        >
            {children}
        </ul>
    ),
    ol: ({ children, animateText: _animateText, className, start, ...rest }: any) => (
        <ol
            {...rest}
            className={cn(
                'list-decimal mb-1',
                isMobile ? 'list-inside pl-5' : 'list-outside pl-6',
                className
            )}
            style={{
                ...baseMarkdownStyle,
                listStylePosition: isMobile ? 'inside' : 'outside',
                paddingInlineStart: isMobile ? '1.25rem' : '1.5rem',
                marginInlineStart: isMobile ? '0' : '0.25rem',
                textTransform: 'none',
                fontVariant: 'normal',
                '--tw-prose-counters': 'var(--markdown-list-marker)'
            } as React.CSSProperties}
            start={start}
        >
            {children}
        </ol>
    ),
    li: ({ children, animateText, className, value, checked, ...rest }: any) => {
        return (
            <li
                {...rest}
                className={cn('text-foreground/90', isMobile && 'ps-0', className)}
                style={{
                    ...baseMarkdownStyle,
                    paddingInlineStart: isMobile ? '0.125rem' : undefined,
                    textTransform: 'none',
                    fontVariant: 'normal',
                }}
                value={value}
                data-checked={checked}
            >
                <ListItemAnimatedContent animateText={animateText} allowAnimation={allowAnimation}>
                    {children}
                </ListItemAnimatedContent>
            </li>
        );
    },
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
    hr: ({ animateText: _animateText, className, ...rest }: any) => (
        <hr {...rest} className={cn('my-4 border-t border-border', className)} />
    ),
    a: ({ children, animateText, className, href, title, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <a
                {...rest}
                href={href}
                title={title}
                className={cn('hover:underline', className)}
                style={{ ...baseMarkdownStyle, color: 'var(--markdown-link)' }}
                target="_blank"
                rel="noopener noreferrer"
            >
                {content}
            </a>
        );
    },
    strong: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <strong
                {...rest}
                className={cn('font-semibold text-foreground', className)}
                style={{
                    ...baseMarkdownStyle,
                    fontWeight: 'var(--markdown-strong-font-weight, 600)',
                }}
            >
                {content}
            </strong>
        );
    },
    em: ({ children, animateText, className, ...rest }: any) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <em
                {...rest}
                className={cn('italic', className)}
                style={baseMarkdownStyle}
            >
                {content}
            </em>
        );
    },
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
    table: ({ children, className, ...rest }: any) => (
        <div className={cn('my-2 overflow-x-auto rounded-lg border border-border/30', className)} {...rest}>
            <table className="min-w-full border-collapse typography-markdown">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }: any) => (
        <thead className="bg-muted/20">
            {children}
        </thead>
    ),
    tbody: ({ children }: any) => (
        <tbody>
            {children}
        </tbody>
    ),
    tr: ({ children }: any) => (
        <tr className="border-b border-border/20">
            {children}
        </tr>
    ),
    th: ({ children, className, ...rest }: any) => (
        <th
            {...rest}
            className={cn('px-3 py-1 text-left font-semibold border border-border/30', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--foreground)', fontWeight: 600 }}
        >
            {children}
        </th>
    ),
    td: ({ children, className, ...rest }: any) => (
        <td
            {...rest}
            className={cn('px-3 py-1 border border-border/30', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}
        >
            {children}
        </td>
    ),
});

export const createUserMarkdown = () => ({
    remarkPlugins: [remarkGfm, remarkUserSoftBreaks()],
    components: {
        p: ({ children }: any) => (
            <p className="mb-1 whitespace-pre-wrap typography-markdown" style={{ ...baseMarkdownStyle, whiteSpace: 'pre-wrap' }}>
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
        h5: ({ children }: any) => (
            <h5 className="mt-1 mb-1 typography-markdown font-medium" style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading5, var(--foreground))', fontWeight: 'var(--markdown-h5-font-weight, 600)' }}>
                {children}
            </h5>
        ),
        h6: ({ children }: any) => (
            <h6 className="mt-1 mb-1 typography-markdown font-medium text-muted-foreground/80" style={{ ...baseMarkdownStyle, color: 'var(--markdown-heading6, var(--muted-foreground))', fontWeight: 'var(--markdown-h6-font-weight, 600)' }}>
                {children}
            </h6>
        ),
        ul: ({ children }: any) => (
            <ul
                className="list-disc list-outside pl-6 mb-1 typography-markdown"
                style={{
                    ...baseMarkdownStyle,
                    paddingInlineStart: '1.5rem',
                    marginInlineStart: '0.25rem',
                }}
            >
                {children}
            </ul>
        ),
        ol: ({ children }: any) => (
            <ol
                className="list-decimal list-outside pl-6 mb-1 typography-markdown"
                style={{
                    ...baseMarkdownStyle,
                    paddingInlineStart: '1.5rem',
                    marginInlineStart: '0.25rem',
                }}
            >
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
            <strong
                className="font-semibold text-foreground typography-markdown"
                style={{
                    ...baseMarkdownStyle,
                    fontWeight: 'var(--markdown-strong-font-weight, 600)',
                }}
            >
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
        table: ({ children }: any) => (
            <div className="my-4 overflow-x-auto">
                <table className="min-w-full border-collapse border border-border/30 typography-markdown">
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }: any) => (
            <thead className="bg-muted/20">
                {children}
            </thead>
        ),
        tbody: ({ children }: any) => (
            <tbody>
                {children}
            </tbody>
        ),
        tr: ({ children }: any) => (
            <tr className="border-b border-border/20">
                {children}
            </tr>
        ),
        th: ({ children }: any) => (
            <th className="px-4 py-2 text-left font-semibold border border-border/30" style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}>
                {children}
            </th>
        ),
        td: ({ children }: any) => (
            <td className="px-4 py-2 border border-border/30" style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}>
                {children}
            </td>
        ),
    },
});
