import React from 'react';

interface StreamingTextProps {
  text: string;
  isStreaming: boolean;
  speed?: number; // milliseconds per character
}

/**
 * Component that displays text with a typewriter effect during streaming.
 * Shows text progressively character by character or word by word.
 */
export const StreamingText: React.FC<StreamingTextProps> = ({ 
  text, 
  isStreaming, 
  speed = 10 // 10ms per character for smooth effect
}) => {
  const [displayedText, setDisplayedText] = React.useState('');
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const intervalRef = React.useRef<NodeJS.Timeout | undefined>(undefined);

  React.useEffect(() => {
    // If not streaming, show all text immediately
    if (!isStreaming) {
      setDisplayedText(text);
      setCurrentIndex(text.length);
      return;
    }

    // Reset when text changes significantly (new message)
    if (text.length < displayedText.length) {
      setDisplayedText('');
      setCurrentIndex(0);
    }

    // Start animation if we have new text to display
    if (currentIndex < text.length) {
      intervalRef.current = setTimeout(() => {
        // Add next chunk of text
        const nextChunk = text.slice(currentIndex, currentIndex + getChunkSize(text, currentIndex));
        setDisplayedText(prev => prev + nextChunk);
        setCurrentIndex(prev => prev + nextChunk.length);
      }, speed);
    }

    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [text, currentIndex, isStreaming, displayedText.length, speed]);

  // When streaming completes, ensure all text is shown
  React.useEffect(() => {
    if (!isStreaming && displayedText !== text) {
      setDisplayedText(text);
      setCurrentIndex(text.length);
    }
  }, [isStreaming, text, displayedText]);

  // Get chunk size - can be word-based or character-based
  function getChunkSize(fullText: string, index: number): number {
    // For fast streaming, show multiple characters at once
    if (speed <= 5) {
      return 3; // Show 3 characters at a time for very fast speed
    }
    
    // For moderate speed, show 1 character
    if (speed <= 20) {
      return 1;
    }
    
    // For slower speed, we can show word by word
    const nextSpace = fullText.indexOf(' ', index);
    if (nextSpace === -1) {
      return fullText.length - index; // Rest of the text
    }
    return nextSpace - index + 1; // Include the space
  }

  return (
    <>
      {displayedText}
      {isStreaming && currentIndex < text.length && (
        <span className="animate-pulse opacity-60">▊</span>
      )}
    </>
  );
};