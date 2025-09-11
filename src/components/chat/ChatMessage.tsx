import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { User, Bot, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Message, Part } from '@opencode-ai/sdk';

interface ChatMessageProps {
  message: {
    info: Message;
    parts: Part[];
  };
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming = false }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const isDark = document.documentElement.classList.contains('dark');
  const isUser = message.info.role === 'user';

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const renderPart = (part: Part, index: number) => {
    switch (part.type) {
      case 'text':
        return (
          <ReactMarkdown
            key={index}
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }: any) {
                const inline = !className?.startsWith('language-');
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');
                
                if (!inline && match) {
                  return (
                    <div className="relative group">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleCopyCode(code)}
                      >
                        {copiedCode === code ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <SyntaxHighlighter
                        style={isDark ? oneDark : oneLight}
                        language={match[1]}
                        PreTag="div"
                      >
                        {code}
                      </SyntaxHighlighter>
                    </div>
                  );
                }
                
                return (
                  <code {...props} className={cn('bg-muted px-1 py-0.5 rounded', className)}>
                    {children}
                  </code>
                );
              }
            }}
          >
            {part.text || ''}
          </ReactMarkdown>
        );

      case 'reasoning':
        return (
          <div key={index} className="text-sm text-muted-foreground italic">
            {'text' in part ? part.text : ''}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn('flex gap-3 p-4', isUser ? 'bg-muted/50' : '')}>
      <div className="flex-shrink-0">
        {isUser ? (
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm mb-1 flex items-center gap-2">
          {isUser ? 'You' : 'Assistant'}
          {isStreaming && !isUser && (
            <span className="text-xs text-muted-foreground">Processing...</span>
          )}
        </div>
        <div className="space-y-2">
          {message.parts.map((part, index) => renderPart(part, index))}
        </div>
      </div>
    </div>
  );
};