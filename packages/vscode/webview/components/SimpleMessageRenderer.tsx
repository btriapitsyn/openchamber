import React from 'react';
import type { Message, Part } from '@opencode-ai/sdk';

interface SimpleMessageRendererProps {
  message: { info: Message; parts: Part[] };
}

export function SimpleMessageRenderer({ message }: SimpleMessageRendererProps) {
  const { info, parts } = message;
  const isUser = info.role === 'user';

  // Extract text content from parts
  const textContent = parts
    .filter((part): part is Part & { type: 'text' } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');

  // Check for tool calls
  const toolParts = parts.filter((part) => part.type === 'tool-invocation' || part.type === 'tool-result');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {/* Role indicator for assistant */}
        {!isUser && (
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Assistant
          </div>
        )}

        {/* Text content */}
        {textContent && (
          <div className="whitespace-pre-wrap break-words">{textContent}</div>
        )}

        {/* Tool activity indicator */}
        {toolParts.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50">
            {toolParts.map((part, idx) => (
              <ToolPartRenderer key={idx} part={part} />
            ))}
          </div>
        )}

        {/* Empty message placeholder */}
        {!textContent && toolParts.length === 0 && (
          <div className="text-muted-foreground italic">...</div>
        )}
      </div>
    </div>
  );
}

function ToolPartRenderer({ part }: { part: Part }) {
  if (part.type === 'tool-invocation') {
    const toolName = part.toolInvocation?.toolName || 'tool';
    const state = part.toolInvocation?.state || 'pending';

    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {state === 'pending' || state === 'streaming' ? (
          <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : state === 'result' ? (
          <span className="text-green-500">✓</span>
        ) : (
          <span className="text-red-500">✗</span>
        )}
        <span className="font-mono">{toolName}</span>
      </div>
    );
  }

  if (part.type === 'tool-result') {
    return (
      <div className="text-xs text-muted-foreground font-mono truncate">
        Result: {typeof part.result === 'string' ? part.result.slice(0, 50) : '...'}
      </div>
    );
  }

  return null;
}
