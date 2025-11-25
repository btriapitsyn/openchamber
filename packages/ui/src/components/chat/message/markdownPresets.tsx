/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import remarkGfm from 'remark-gfm';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { typography } from '@/lib/typography';
import type { MarkdownComponentMap } from '../StreamingAnimatedText';

const remarkUserSoftBreaks = () => {
    return (tree: Record<string, unknown>) => {
        const processNode = (node: Record<string, unknown>) => {
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
                    const replacement: Record<string, unknown>[] = [];

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
    syntaxTheme: { [key: string]: React.CSSProperties };
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    allowAnimation: boolean;
}

const applyAnimation = (animateText: ((content: React.ReactNode) => React.ReactNode) | undefined, content: React.ReactNode) => {
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
    animateText: ((content: React.ReactNode) => React.ReactNode) | undefined,
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
    animateText: ((content: React.ReactNode) => React.ReactNode) | undefined;
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



const baseMarkdownStyle: React.CSSProperties = {
    fontSize: 'var(--text-markdown)',
    lineHeight: 'var(--markdown-body-line-height)',
    letterSpacing: 'var(--markdown-body-letter-spacing)',
    fontWeight: 'var(--markdown-body-font-weight)',
    whiteSpace: 'normal',
};

export const createAssistantMarkdownComponents = ({
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    allowAnimation,
}: AssistantMarkdownContext): MarkdownComponentMap => ({
     h1: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h1
                 {...rest}
                 className={cn('font-semibold', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '700',
                     color: 'var(--markdown-heading1)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {content}
             </h1>
         );
     },
     h2: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h2
                 {...rest}
                 className={cn('font-semibold', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '700',
                     color: 'var(--markdown-heading2)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {content}
             </h2>
         );
     },
     h3: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h3
                 {...rest}
                 className={cn('font-semibold', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading3)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {content}
             </h3>
         );
     },
     h4: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h4
                 {...rest}
                 className={cn('font-medium', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading4, var(--foreground))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {content}
             </h4>
         );
     },
     h5: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h5
                 {...rest}
                 className={cn('font-medium', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading5, var(--markdown-heading4, var(--foreground)))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {content}
             </h5>
         );
     },
     h6: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <h6
                 {...rest}
                 className={cn('font-medium', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading6, var(--markdown-heading4, var(--foreground)))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {content}
             </h6>
         );
     },
     p: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
         const content = allowAnimation ? applyAnimation(animateText, children) : children;
         return (
             <p
                 {...rest}
                 className={cn('typography-markdown', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     lineHeight: 'var(--markdown-body-line-height)',
                     letterSpacing: 'var(--markdown-body-letter-spacing)',
                     fontWeight: 'var(--markdown-body-font-weight)',
                     whiteSpace: 'normal',
                     marginBlockStart: '0',
                     marginBlockEnd: 'var(--markdown-paragraph-spacing)',
                 }}
             >
                 {content}
             </p>
         );
     },
    ul: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
        void animateText;
        return (
            <ul
                {...rest}
                className={cn('list-disc', 'typography-markdown', className)}
                style={{
                    fontSize: 'var(--text-markdown)',
                    lineHeight: 'var(--markdown-body-line-height)',
                    letterSpacing: 'var(--markdown-body-letter-spacing)',
                    fontWeight: 'var(--markdown-body-font-weight)',
                    whiteSpace: 'normal',
                    marginBlockStart: '0',
                    marginBlockEnd: 'var(--markdown-list-spacing)',
                    listStylePosition: isMobile ? 'inside' : 'outside',
                    paddingInlineStart: isMobile ? 'var(--markdown-list-indent-mobile)' : 'var(--markdown-list-indent)',
                    marginInlineStart: isMobile ? '0' : 'var(--markdown-list-margin-inline)',
                    textTransform: 'none',
                    fontVariant: 'normal',
                    '--tw-prose-bullets': 'var(--markdown-list-marker)',
                } as React.CSSProperties}
            >
                {children}
            </ul>
        );
    },
    ol: ({ children, animateText, className, start, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; start?: number; [key: string]: unknown }) => {
        void animateText;
        return (
            <ol
                {...rest}
                className={cn('typography-markdown', 'markdown-ordered-list', className)}
                style={{
                    fontSize: 'var(--text-markdown)',
                    lineHeight: 'var(--markdown-body-line-height)',
                    letterSpacing: 'var(--markdown-body-letter-spacing)',
                    fontWeight: 'var(--markdown-body-font-weight)',
                    whiteSpace: 'normal',
                    marginBlockStart: '0',
                    marginBlockEnd: 'var(--markdown-list-spacing)',
                    listStyle: 'none',
                    paddingInlineStart: isMobile
                        ? 'var(--markdown-ordered-indent-mobile)'
                        : 'var(--markdown-ordered-indent)',
                    marginInlineStart: '0',
                } as React.CSSProperties}
                start={start}
            >
                {children}
            </ol>
        );
    },
     li: ({ children, animateText, className, value, checked, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; value?: number; checked?: boolean; [key: string]: unknown }) => {
         return (
             <li
                 {...rest}
                 className={cn('text-foreground/90', 'typography-markdown', isMobile && 'ps-0', className)}
                 style={{
                     fontSize: 'var(--text-markdown)',
                     lineHeight: 'var(--markdown-body-line-height)',
                     letterSpacing: 'var(--markdown-body-letter-spacing)',
                     fontWeight: 'var(--markdown-body-font-weight)',
                     whiteSpace: 'normal',
                     marginBlockStart: '0',
                     marginBlockEnd: 'var(--markdown-list-item-gap)',
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
    blockquote: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
        const content = allowAnimation ? applyAnimation(animateText, children) : children;
        return (
            <blockquote
                {...rest}
                className={cn(
                    'border-l-4 border-muted italic text-muted-foreground',
                    allowAnimation && 'flowtoken-blockquote-animating',
                    className
                )}
                style={{
                    ...baseMarkdownStyle,
                    marginBlockStart: 'var(--markdown-blockquote-spacing)',
                    marginBlockEnd: 'var(--markdown-blockquote-spacing)',
                    paddingInlineStart: 'var(--markdown-blockquote-padding)',
                    whiteSpace: 'normal',
                }}
            >
                {content}
            </blockquote>
        );
    },
    hr: ({ animateText, className, ...rest }: { animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
        void animateText;
        return (
            <hr
                {...rest}
                className={cn('border-t border-border', className)}
                style={{
                    marginBlockStart: 'var(--markdown-divider-spacing)',
                    marginBlockEnd: 'var(--markdown-divider-spacing)',
                }}
            />
        );
    },
    a: ({ children, animateText, className, href, title, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; href?: string; title?: string; [key: string]: unknown }) => {
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
    strong: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
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
    em: ({ children, animateText, className, ...rest }: { children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; className?: string; [key: string]: unknown }) => {
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
    code: ({ className, children, animateText, ...props }: { className?: string; children?: React.ReactNode; animateText?: (content: React.ReactNode) => React.ReactNode; [key: string]: unknown }) => {
        void animateText;
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
                            onClick={() => onCopyCode(code)}
                        >
                            {copiedCode === code ? (
                                <RiCheckLine className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                            ) : (
                                <RiFileCopyLine className={isMobile ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
                            )}
                        </Button>
                    </div>
                    <div
                        className={cn(
                            'overflow-x-auto rounded-xl border dark:border-white/[0.06] border-black/[0.08] max-w-full overflow-hidden',
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
                                background: 'var(--chat-background)',
                                whiteSpace: 'pre-wrap',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
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
                    backgroundColor: 'var(--chat-background)',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                }}
            >
                {children}
            </code>
        );
    },
    table: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
        <div
            className={cn('overflow-hidden rounded-xl border border-border/30', className)}
            style={{
                marginBlockStart: 'var(--markdown-table-spacing)',
                marginBlockEnd: 'var(--markdown-table-spacing)',
            }}
            {...rest}
        >
            <table className="min-w-full border-collapse typography-markdown">
                {children}
            </table>
        </div>
    ),
    thead: ({ children }: { children?: React.ReactNode }) => (
        <thead className="bg-muted/20">
            {children}
        </thead>
    ),
    tbody: ({ children }: { children?: React.ReactNode }) => (
        <tbody>
            {children}
        </tbody>
    ),
    tr: ({ children }: { children?: React.ReactNode }) => (
        <tr className="border-b border-border/20">
            {children}
        </tr>
    ),
    th: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
        <th
            {...rest}
            className={cn('px-3 py-1 text-left font-semibold border border-border/30', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--foreground)', fontWeight: 600 }}
        >
            {children}
        </th>
    ),
    td: ({ children, className, ...rest }: { children?: React.ReactNode; className?: string; [key: string]: unknown }) => (
        <td
            {...rest}
            className={cn('px-3 py-1 border border-border/30', className)}
            style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}
        >
            {children}
        </td>
    ),
});

interface UserMarkdownOptions {
    isMobile?: boolean;
}

export const createUserMarkdown = ({ isMobile = false }: UserMarkdownOptions = {}) => ({
    remarkPlugins: [remarkGfm, remarkUserSoftBreaks()],
    components: {


         p: ({ children }: { children?: React.ReactNode }) => (
             <p
                 className="typography-markdown whitespace-pre-wrap"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     lineHeight: 'var(--markdown-body-line-height)',
                     letterSpacing: 'var(--markdown-body-letter-spacing)',
                     fontWeight: 'var(--markdown-body-font-weight)',
                     whiteSpace: 'pre-wrap',
                     marginBlockStart: '0',
                     marginBlockEnd: 'var(--markdown-paragraph-spacing)',
                 }}
             >
                 {children}
             </p>
         ),
         h1: ({ children }: { children?: React.ReactNode }) => (
             <h1
                 className="typography-markdown font-bold"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '700',
                     color: 'var(--markdown-heading1)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {children}
             </h1>
         ),
         h2: ({ children }: { children?: React.ReactNode }) => (
             <h2
                 className="typography-markdown font-semibold"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '700',
                     color: 'var(--markdown-heading2)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {children}
             </h2>
         ),
         h3: ({ children }: { children?: React.ReactNode }) => (
             <h3
                 className="typography-markdown font-semibold"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading3)',
                     marginBlockStart: 'var(--markdown-heading-primary-top)',
                     marginBlockEnd: 'var(--markdown-heading-primary-bottom)',
                 }}
             >
                 {children}
             </h3>
         ),
         h4: ({ children }: { children?: React.ReactNode }) => (
             <h4
                 className="typography-markdown font-medium"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading4, var(--foreground))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {children}
             </h4>
         ),
         h5: ({ children }: { children?: React.ReactNode }) => (
             <h5
                 className="typography-markdown font-medium"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading5, var(--markdown-heading4, var(--foreground)))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {children}
             </h5>
         ),
         h6: ({ children }: { children?: React.ReactNode }) => (
             <h6
                 className="typography-markdown font-medium"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     fontWeight: '600',
                     color: 'var(--markdown-heading6, var(--markdown-heading4, var(--foreground)))',
                     marginBlockStart: 'var(--markdown-heading-secondary-top)',
                     marginBlockEnd: 'var(--markdown-heading-secondary-bottom)',
                 }}
             >
                 {children}
             </h6>
         ),
        ul: ({ children }: { children?: React.ReactNode }) => (
            <ul
                className="list-disc typography-markdown"
                style={{
                    fontSize: 'var(--text-markdown)',
                    lineHeight: 'var(--markdown-body-line-height)',
                    letterSpacing: 'var(--markdown-body-letter-spacing)',
                    fontWeight: 'var(--markdown-body-font-weight)',
                    whiteSpace: 'normal',
                    marginBlockStart: '0',
                    marginBlockEnd: 'var(--markdown-list-spacing)',
                    listStylePosition: isMobile ? 'inside' : 'outside',
                    paddingInlineStart: isMobile ? 'var(--markdown-list-indent-mobile)' : 'var(--markdown-list-indent)',
                    marginInlineStart: isMobile ? '0' : 'var(--markdown-list-margin-inline)',
                    textTransform: 'none',
                    fontVariant: 'normal',
                    '--tw-prose-bullets': 'var(--markdown-list-marker)',
                } as React.CSSProperties}
            >
                {children}
            </ul>
        ),
        ol: ({ children }: { children?: React.ReactNode }) => (
            <ol
                className="typography-markdown markdown-ordered-list"
                style={{
                    fontSize: 'var(--text-markdown)',
                    lineHeight: 'var(--markdown-body-line-height)',
                    letterSpacing: 'var(--markdown-body-letter-spacing)',
                    fontWeight: 'var(--markdown-body-font-weight)',
                    whiteSpace: 'normal',
                    marginBlockStart: '0',
                    marginBlockEnd: 'var(--markdown-list-spacing)',
                    listStyle: 'none',
                    paddingInlineStart: isMobile
                        ? 'var(--markdown-ordered-indent-mobile)'
                        : 'var(--markdown-ordered-indent)',
                    marginInlineStart: 0,
                } as React.CSSProperties}
            >
                {children}
            </ol>
        ),
         li: ({ children }: { children?: React.ReactNode }) => (
             <li
                 className="typography-markdown"
                 style={{
                     fontSize: 'var(--text-markdown)',
                     lineHeight: 'var(--markdown-body-line-height)',
                     letterSpacing: 'var(--markdown-body-letter-spacing)',
                     fontWeight: 'var(--markdown-body-font-weight)',
                     whiteSpace: 'normal',
                     marginBlockStart: '0',
                     marginBlockEnd: 'var(--markdown-list-item-gap)',
                     textTransform: 'none',
                     fontVariant: 'normal',
                 }}
             >
                 {children}
             </li>
         ),
        blockquote: ({ children }: { children?: React.ReactNode }) => (
            <blockquote
                className="border-l-4 typography-markdown italic"
                style={{
                    ...baseMarkdownStyle,
                    marginBlockStart: 'var(--markdown-blockquote-spacing)',
                    marginBlockEnd: 'var(--markdown-blockquote-spacing)',
                    paddingInlineStart: 'var(--markdown-blockquote-padding)',
                    borderColor: 'var(--markdown-blockquote-border)',
                    color: 'var(--markdown-blockquote)',
                }}
            >
                {children}
            </blockquote>
        ),
        hr: () => (
            <hr
                className="border-t border-border"
                style={{
                    marginBlockStart: 'var(--markdown-divider-spacing)',
                    marginBlockEnd: 'var(--markdown-divider-spacing)',
                }}
            />
        ),
        a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
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
        strong: ({ children }: { children?: React.ReactNode }) => (
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
        em: ({ children }: { children?: React.ReactNode }) => (
            <em className="italic typography-markdown" style={baseMarkdownStyle}>
                {children}
            </em>
        ),
        code: ({ children }: { children?: React.ReactNode }) => (
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
        pre: ({ children }: { children?: React.ReactNode }) => (
            <pre className="bg-muted/30 p-3 rounded-xl border border-border/20 font-mono typography-code whitespace-pre-wrap overflow-x-auto">
                {children}
            </pre>
        ),
        table: ({ children }: { children?: React.ReactNode }) => (
            <div
                className="overflow-x-auto border border-border/30"
                style={{
                    marginBlockStart: 'var(--markdown-table-spacing)',
                    marginBlockEnd: 'var(--markdown-table-spacing)',
                }}
            >
                <table className="min-w-full border-collapse typography-markdown">
                    {children}
                </table>
            </div>
        ),
        thead: ({ children }: { children?: React.ReactNode }) => (
            <thead className="bg-muted/20">
                {children}
            </thead>
        ),
        tbody: ({ children }: { children?: React.ReactNode }) => (
            <tbody>
                {children}
            </tbody>
        ),
        tr: ({ children }: { children?: React.ReactNode }) => (
            <tr className="border-b border-border/20">
                {children}
            </tr>
        ),
        th: ({ children }: { children?: React.ReactNode }) => (
            <th className="px-4 py-2 text-left font-semibold border border-border/30" style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}>
                {children}
            </th>
        ),
        td: ({ children }: { children?: React.ReactNode }) => (
            <td className="px-4 py-2 border border-border/30" style={{ ...baseMarkdownStyle, color: 'var(--foreground)' }}>
                {children}
            </td>
        ),
    },
});
