import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface IncrementalStreamingTextProps {
  targetText: string;
  isStreaming: boolean;
  speed?: number;
  markdownComponents: any;
}

/**
 * Animates text as it streams in.
 */
export const IncrementalStreamingText: React.FC<IncrementalStreamingTextProps> = ({ 
  targetText, 
  isStreaming, 
  speed = 3,
  markdownComponents
}) => {
  const [displayedLength, setDisplayedLength] = React.useState(0);
  const lastTargetRef = React.useRef(0);
  const animationRef = React.useRef<number | undefined>(undefined);
  const lastTimeRef = React.useRef(0);
  
  React.useEffect(() => {
    // If not streaming, show everything
    if (!isStreaming) {
      setDisplayedLength(targetText.length);
      lastTargetRef.current = targetText.length;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
      return;
    }
    
    // Check if we have new content (new chunk arrived)
    if (targetText.length <= lastTargetRef.current) {
      return; // No new content
    }
    
    // Update our target
    lastTargetRef.current = targetText.length;
    
    // If already animating, let it continue to the new target
    if (animationRef.current) {
      return;
    }
    
    // Start animating
    const animate = (timestamp: number) => {
      if (timestamp - lastTimeRef.current >= speed) {
        lastTimeRef.current = timestamp;
        
        setDisplayedLength(current => {
          if (current >= lastTargetRef.current) {
            animationRef.current = undefined;
            return current;
          }
          
          const charsToAdd = speed <= 2 ? 3 : speed <= 5 ? 2 : 1;
          const newLength = Math.min(current + charsToAdd, lastTargetRef.current);
          
          animationRef.current = requestAnimationFrame(animate);
          return newLength;
        });
      } else {
        animationRef.current = requestAnimationFrame(animate);
      }
    };
    
    animationRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [targetText.length, isStreaming, speed]);
  
  const displayedText = targetText.slice(0, displayedLength);
  
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {displayedText}
    </ReactMarkdown>
  );
};