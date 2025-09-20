import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';

interface SmoothTextAnimationProps {
    targetText: string;
    messageId: string;
    shouldAnimate: boolean;
    speed?: number;
    markdownComponents: Record<string, React.ComponentType<Record<string, unknown>>>;
    onContentChange?: () => void; // Callback to trigger scroll updates during animation
    isUserScrolling?: boolean; // Flag to prevent scroll updates during user interaction
}

/**
 * Smooth character-by-character text animation that runs independently of streaming state.
 * Uses an internal buffer system to accumulate text and animate at a consistent rate.
 */
export const SmoothTextAnimation: React.FC<SmoothTextAnimationProps> = React.memo(({
    targetText,
    messageId,
    shouldAnimate,
    speed = 2, // milliseconds between character reveals (very fast testing - ~500 chars/sec)
    markdownComponents,
    onContentChange,
    isUserScrolling
}) => {
    // Internal state for animation
    const [displayedLength, setDisplayedLength] = React.useState(0);
    const displayedLengthRef = React.useRef(0);
    const animationRef = React.useRef<number | undefined>(undefined);
    const lastUpdateTimeRef = React.useRef(0);
    const lastScrollUpdateTimeRef = React.useRef(0);
    const scrollUpdateInterval = 25; // Even faster scroll updates during animation
    const isAnimatingRef = React.useRef(false);
    const hasCompletedRef = React.useRef(false);
    const targetTextRef = React.useRef(targetText);

    // Keep refs in sync with state/props - use layoutEffect for synchronous DOM updates
    React.useLayoutEffect(() => {
        displayedLengthRef.current = displayedLength;
    }, [displayedLength]);

    React.useEffect(() => {
        targetTextRef.current = targetText;
    }, [targetText]);

    // Clean up animation on unmount
    React.useEffect(() => {
        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = undefined;
            }
            lastScrollUpdateTimeRef.current = 0;
        };
    }, []);

    // Main animation logic - only runs when shouldAnimate changes
    React.useEffect(() => {
        // If animation is disabled or message already animated, show full text
        const freshnessDetector = MessageFreshnessDetector.getInstance();
        const hasBeenAnimated = freshnessDetector.hasBeenAnimated(messageId);
        
        if (!shouldAnimate || hasBeenAnimated) {
            if (displayedLengthRef.current !== targetText.length) {
                setDisplayedLength(targetText.length);
            }
            return;
        }

        // Don't animate empty text
        if (targetText.length === 0) {
            return;
        }
        
        // Reset animation state
        hasCompletedRef.current = false;
        isAnimatingRef.current = true;
        
        // Start from beginning
        setDisplayedLength(0);
        displayedLengthRef.current = 0;

        // Start the animation
        const animate = (timestamp: number) => {
            if (timestamp - lastUpdateTimeRef.current >= speed) {
                lastUpdateTimeRef.current = timestamp;

                const currentLength = displayedLengthRef.current;
                const targetLength = targetTextRef.current.length;
                
                // Animation frame debug (commented out for production)
                
                if (currentLength >= targetLength) {
                    // Animation caught up with current text - just pause
                    isAnimatingRef.current = false;
                    hasCompletedRef.current = true;
                    animationRef.current = undefined;
                    
                    return;
                }

                // Calculate characters to add based on speed
                const charsToAdd = speed <= 2 ? 10 : speed <= 5 ? 5 : speed <= 10 ? 3 : speed <= 20 ? 2 : 1;
                const newLength = Math.min(currentLength + charsToAdd, targetLength);
                setDisplayedLength(newLength);
                
                // Trigger scroll update during animation to keep content visible
                // BUT only if user hasn't scrolled up (simple rule)
                // Skip autoscroll for first few frames to prevent layout jumps
                const timeSinceLastScroll = timestamp - lastScrollUpdateTimeRef.current;
                if (onContentChange && !isUserScrolling && timeSinceLastScroll >= scrollUpdateInterval && currentLength > 10) {
                    lastScrollUpdateTimeRef.current = timestamp;
                    onContentChange();
                }
            }
            
            // Continue animation
            if (isAnimatingRef.current) {
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

    }, [shouldAnimate, messageId, speed]);

    // Handle text updates during animation
    React.useEffect(() => {
        // If text changed and we're animating, continue to new length
        if (isAnimatingRef.current && displayedLengthRef.current < targetText.length) {
            // Continue animation - the existing animation loop will handle it
        } else if (!isAnimatingRef.current && displayedLengthRef.current !== targetText.length) {
            // If not animating, update to show full text
            setDisplayedLength(targetText.length);
        }
    }, [targetText]);

    const displayedText = targetText.slice(0, displayedLength);

    // Convert single newlines to markdown line breaks (two spaces + newline)
    // This ensures that \n characters from the assistant are properly rendered as line breaks
    const processedText = React.useMemo(() => {
        return displayedText.replace(/(?<!\n)\n(?!\n)/g, '  \n');
    }, [displayedText]);



    // Container styles - CSS handles containment for performance
    const containerStyle = React.useMemo(() => ({
        position: 'relative',
        fontSize: 'var(--markdown-body-font-size, 0.875rem)',
        lineHeight: 'var(--markdown-body-line-height, 1.5rem)',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
        width: '100%',
        minHeight: '1.5rem'
    } as React.CSSProperties), []);

    return (
        <div style={containerStyle}>
            <div style={{
                width: '100%',
                overflow: 'visible'
            }}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        ...markdownComponents,
                        // Override specific components that might cause layout shifts
                        p: ({ children, ...props }: any) => (
                            <p style={{
                                margin: 0,
                                padding: 0,
                                lineHeight: 'var(--markdown-body-line-height, 1.5rem)',
                                fontSize: 'var(--markdown-body-font-size, 0.875rem)'
                            }} {...props}>
                                {children}
                            </p>
                        ),
                        h1: ({ children, ...props }: any) => (
                            <h1 style={{
                                margin: '0.25rem 0',
                                padding: 0,
                                lineHeight: 'var(--markdown-h1-line-height, 1.2)',
                                minHeight: '1.2em',
                                color: 'var(--markdown-heading1, var(--primary, #edb449))',
                                fontSize: 'var(--markdown-h1-font-size, 1.375rem)',
                                fontWeight: 'var(--markdown-h1-font-weight, 700)'
                            }} {...props}>
                                {children}
                            </h1>
                        ),
                        h2: ({ children, ...props }: any) => (
                            <h2 style={{
                                margin: '0.2rem 0',
                                padding: 0,
                                lineHeight: 'var(--markdown-h2-line-height, 1.25)',
                                minHeight: '1.2em',
                                color: 'var(--markdown-heading2, var(--primary, #edb449))',
                                fontSize: 'var(--markdown-h2-font-size, 1.125rem)',
                                fontWeight: 'var(--markdown-h2-font-weight, 600)'
                            }} {...props}>
                                {children}
                            </h2>
                        ),
                        h3: ({ children, ...props }: any) => (
                            <h3 style={{
                                margin: '0.15rem 0',
                                padding: 0,
                                lineHeight: 'var(--markdown-h3-line-height, 1.3)',
                                minHeight: '1.2em',
                                color: 'var(--markdown-heading3, var(--primary, #edb449))',
                                fontSize: 'var(--markdown-h3-font-size, 1rem)',
                                fontWeight: 'var(--markdown-h3-font-weight, 600)'
                            }} {...props}>
                                {children}
                            </h3>
                        ),
                         h4: ({ children, ...props }: any) => (
                             <h4 style={{
                                 margin: '0.125rem 0',
                                 padding: 0,
                                 lineHeight: 'var(--markdown-h4-line-height, 1.375rem)',
                                 minHeight: '1.2em',
                                 color: 'var(--markdown-heading4, var(--foreground, #cdccc3))',
                                 fontSize: 'var(--markdown-h4-font-size, 0.9375rem)',
                                 fontWeight: 'var(--markdown-h4-font-weight, 600)'
                             }} {...props}>
                                 {children}
                             </h4>
                         ),
                         h5: ({ children, ...props }: any) => (
                             <h5 style={{
                                 margin: '0.1rem 0',
                                 padding: 0,
                                 lineHeight: 'var(--markdown-h5-line-height, 1.25rem)',
                                 minHeight: '1.2em',
                                 color: 'var(--markdown-heading4, var(--foreground, #cdccc3))',
                                 fontSize: 'var(--markdown-h5-font-size, 0.875rem)',
                                 fontWeight: 'var(--markdown-h5-font-weight, 600)'
                             }} {...props}>
                                 {children}
                             </h5>
                         ),
                         h6: ({ children, ...props }: any) => (
                             <h6 style={{
                                 margin: '0.1rem 0',
                                 padding: 0,
                                 lineHeight: 'var(--markdown-h6-line-height, 1.125rem)',
                                 minHeight: '1.2em',
                                 color: 'var(--markdown-heading4, var(--foreground, #cdccc3))',
                                 fontSize: 'var(--markdown-h6-font-size, 0.8125rem)',
                                 fontWeight: 'var(--markdown-h6-font-weight, 600)'
                             }} {...props}>
                                 {children}
                             </h6>
                         ),
                        ul: ({ children, ...props }: any) => (
                            <ul style={{
                                margin: 0,
                                paddingLeft: '1.5rem',
                                color: 'var(--foreground, #cdccc3)',
                                fontSize: 'var(--markdown-list-font-size, 0.8125rem)',
                                lineHeight: 'var(--markdown-list-line-height, 1.375rem)'
                            }} {...props}>
                                {children}
                            </ul>
                        ),
                        ol: ({ children, ...props }: any) => (
                            <ol style={{
                                margin: 0,
                                paddingLeft: '1.5rem',
                                color: 'var(--foreground, #cdccc3)',
                                fontSize: 'var(--markdown-list-font-size, 0.8125rem)',
                                lineHeight: 'var(--markdown-list-line-height, 1.375rem)'
                            }} {...props}>
                                {children}
                            </ol>
                        ),
                         li: ({ children, ...props }: any) => (
                             <li style={{
                                 margin: 0,
                                 padding: 0,
                                 color: 'var(--foreground, #cdccc3)',
                                 fontSize: 'var(--markdown-list-font-size, 0.8125rem)',
                                 lineHeight: 'var(--markdown-list-line-height, 1.375rem)'
                             }} {...props}>
                                 {children}
                             </li>
                         ),
                        a: ({ children, ...props }: any) => (
                            <a style={{
                                color: 'var(--markdown-link, var(--primary, #61afef))',
                                textDecoration: 'underline'
                            }} {...props}>
                                {children}
                            </a>
                        ),
                        code: ({ children, ...props }: any) => (
                            <code style={{
                                backgroundColor: 'var(--markdown-inline-code-bg, var(--surface-subtle, #2a282620))',
                                color: 'var(--markdown-inline-code, var(--syntax-string, #98c379))',
                                padding: '0.125rem 0.25rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.85em'
                            }} {...props}>
                                {children}
                            </code>
                        ),
                         blockquote: ({ children, ...props }: any) => (
                             <blockquote style={{
                                 borderLeft: '3px solid var(--markdown-blockquote-border, var(--interactive-border, #3a3836))',
                                 paddingLeft: '1rem',
                                 margin: '0.5rem 0',
                                 color: 'var(--markdown-blockquote, var(--surface-muted-foreground, #9b9a93))',
                                 fontStyle: 'italic',
                                 contain: 'layout style paint',
                                 display: 'block',
                                 width: '100%',
                                 boxSizing: 'border-box',
                                 minHeight: '1.5rem',
                                 transform: 'translateZ(0)'
                             }} {...props}>
                                 {children}
                             </blockquote>
                         ),
                         pre: ({ children, ...props }: any) => (
                              <pre style={{
                                  margin: '0.5rem 0',
                                  padding: '0.5rem',
                                  backgroundColor: 'var(--syntax-background, #1a1817)',
                                  borderRadius: '0.375rem',
                                  overflow: 'auto',
                                  fontSize: 'var(--markdown-code-block-font-size, 0.6875rem)',
                                  lineHeight: 'var(--markdown-code-block-line-height, 1.35)',
                                  minHeight: '2rem'
                              }} {...props}>
                                  {children}
                              </pre>
                          ),
                          table: ({ children, ...props }: any) => (
                              <table style={{
                                  width: '100%',
                                  borderCollapse: 'collapse'
                              }} {...props}>
                                  {children}
                              </table>
                          ),
                         thead: ({ children, ...props }: any) => (
                             <thead style={{
                                 contain: 'layout',
                                 display: 'table-header-group'
                             }} {...props}>
                                 {children}
                             </thead>
                         ),
                          tbody: ({ children, ...props }: any) => (
                              <tbody style={{
                                  display: 'table-row-group'
                              }} {...props}>
                                  {children}
                              </tbody>
                          ),
                          tr: ({ children, ...props }: any) => (
                              <tr style={{
                                  display: 'table-row'
                              }} {...props}>
                                  {children}
                              </tr>
                          ),
                          th: ({ children, ...props }: any) => (
                              <th style={{
                                  padding: '0.5rem',
                                  border: '1px solid var(--interactive-border, #3a3836)',
                                  backgroundColor: 'var(--surface-muted, #1f1d1b)',
                                  fontWeight: '600',
                                  textAlign: 'left'
                              }} {...props}>
                                  {children}
                              </th>
                          ),
                          td: ({ children, ...props }: any) => (
                              <td style={{
                                  padding: '0.5rem',
                                  border: '1px solid var(--interactive-border, #3a3836)'
                              }} {...props}>
                                  {children}
                              </td>
                          ),
                          hr: ({ ...props }: any) => (
                              <hr style={{
                                  margin: '1rem 0',
                                  border: 'none',
                                  borderTop: '1px solid var(--markdown-hr, var(--interactive-border, #3a3836))'
                              }} {...props} />
                          ),
                          strong: ({ children, ...props }: any) => (
                              <strong style={{
                                  fontWeight: '600'
                              }} {...props}>
                                  {children}
                              </strong>
                          ),
                          em: ({ children, ...props }: any) => (
                              <em style={{
                                  fontStyle: 'italic'
                              }} {...props}>
                                  {children}
                              </em>
                          ),
                          del: ({ children, ...props }: any) => (
                              <del style={{
                                  textDecoration: 'line-through'
                              }} {...props}>
                                  {children}
                              </del>
                          ),
                         img: ({ ...props }: any) => (
                             <img style={{
                                 maxWidth: '100%',
                                 height: 'auto'
                             }} {...props} />
                         )
                    }}
                >
                    {processedText}
                </ReactMarkdown>
            </div>
        </div>
    );
});