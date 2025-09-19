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
}

/**
 * Smooth character-by-character text animation that runs independently of streaming state.
 * Uses an internal buffer system to accumulate text and animate at a consistent rate.
 */
export const SmoothTextAnimation: React.FC<SmoothTextAnimationProps> = ({
    targetText,
    messageId,
    shouldAnimate,
    speed = 30, // milliseconds between character reveals
    markdownComponents,
    onContentChange
}) => {
    // Internal state for animation
    const [displayedLength, setDisplayedLength] = React.useState(0);
    const displayedLengthRef = React.useRef(0);
    const animationRef = React.useRef<number | undefined>(undefined);
    const lastUpdateTimeRef = React.useRef(0);
    const isAnimatingRef = React.useRef(false);
    const hasCompletedRef = React.useRef(false);
    const targetTextRef = React.useRef(targetText);

    // Keep refs in sync with state/props
    React.useEffect(() => {
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
                
                console.log(`[SmoothTextAnimation] Animation frame: currentLength=${currentLength}, targetLength=${targetLength}`);
                
                if (currentLength >= targetLength) {
                    // Animation complete
                    isAnimatingRef.current = false;
                    hasCompletedRef.current = true;
                    animationRef.current = undefined;
                    
                    // Mark message as animated in the freshness detector
                    const freshnessDetector = MessageFreshnessDetector.getInstance();
                    freshnessDetector.markMessageAsAnimated(messageId, Date.now());
                    
                    return;
                }

                // Reveal one character at a time
                const newLength = Math.min(currentLength + 1, targetLength);
                setDisplayedLength(newLength);
                
                // Trigger scroll update during animation to keep content visible
                if (onContentChange) {
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
    const processedText = displayedText.replace(/(?<!\n)\n(?!\n)/g, '  \n');

    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={markdownComponents}
        >
            {processedText}
        </ReactMarkdown>
    );
};