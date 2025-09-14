import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface AnimatedStreamingTextProps {
  text: string;
  isStreaming: boolean;
  speed?: number;
  markdownComponents: any; // Markdown component overrides
}

/**
 * Renders markdown text with smooth character-by-character animation during streaming.
 * Shows a cursor while typing and renders markdown properly.
 */
export const AnimatedStreamingText: React.FC<AnimatedStreamingTextProps> = ({ 
  text, 
  isStreaming, 
  speed = 5,
  markdownComponents
}) => {
  const [displayedLength, setDisplayedLength] = React.useState(0);
  const intervalRef = React.useRef<NodeJS.Timeout | undefined>(undefined);
  const lastTextRef = React.useRef<string>('');

  React.useEffect(() => {
    // If not streaming, show all text immediately
    if (!isStreaming) {
      setDisplayedLength(text.length);
      return;
    }

    // Check if text changed (new content added)
    if (text.length > lastTextRef.current.length) {
      // Text is growing - continue animation from current position
      lastTextRef.current = text;
    } else if (text.length < lastTextRef.current.length) {
      // Text got shorter (new message) - reset
      setDisplayedLength(0);
      lastTextRef.current = text;
    }

    // Animate if we have more text to show
    if (displayedLength < text.length) {
      intervalRef.current = setTimeout(() => {
        // Calculate how many characters to add
        const charsToAdd = speed <= 5 ? 2 : 1; // Faster speed = more chars at once
        setDisplayedLength(prev => Math.min(prev + charsToAdd, text.length));
      }, speed);
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [text, displayedLength, isStreaming, speed]);

  // When streaming stops, show all remaining text
  React.useEffect(() => {
    if (!isStreaming) {
      setDisplayedLength(text.length);
    }
  }, [isStreaming, text.length]);

  const displayedText = text.slice(0, displayedLength);
  const showCursor = isStreaming && displayedLength < text.length;

  return (
    <>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {displayedText}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-[2px] h-[1em] bg-foreground/50 animate-pulse ml-0.5" />
      )}
    </>
  );
};