import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { duneCodeDark, duneCodeLight } from '@/lib/codeTheme';
import { User, Bot, Copy, Check, Wrench, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Message, Part } from '@opencode-ai/sdk';
import type { ToolPart, ToolStateUnion } from '@/types/tool';

interface ChatMessageProps {
  message: {
    info: Message;
    parts: Part[];
  };
  isStreaming?: boolean;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming = false }) => {
  const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
  const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
  const isDark = document.documentElement.classList.contains('dark');
  const isUser = message.info.role === 'user';
  
  // Get provider ID from message info for assistant messages
  const providerID = !isUser && 'providerID' in message.info ? (message.info as any).providerID : null;
  
  const getProviderLogoUrl = (providerId: string) => {
    return `https://models.dev/logos/${providerId.toLowerCase()}.svg`;
  };
  
  // Filter out synthetic parts
  const visibleParts = message.parts.filter(part => 
    !('synthetic' in part && part.synthetic)
  );
  
  // Hide entire message if all parts are synthetic
  if (visibleParts.length === 0) {
    return null;
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const toggleToolExpanded = (toolId: string) => {
    setExpandedTools(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  };

  const getToolStateIcon = (status: ToolStateUnion['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-3 w-3 text-muted-foreground" />;
      case 'running':
        return <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full" />;
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-600" />;
      case 'error':
        return <XCircle className="h-3 w-3 text-red-600" />;
      default:
        return <Wrench className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const renderPart = (part: Part, index: number) => {
    switch (part.type) {
      case 'text':
        return (
          <div key={index} className="break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
              code({ className, children, ...props }: any) {
                const inline = !className?.startsWith('language-');
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');
                
                if (!inline && match) {
                  return (
                    <div className="relative group my-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute right-2 top-2 h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                        onClick={() => handleCopyCode(code)}
                      >
                        {copiedCode === code ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                      <div className="overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full">
                        <SyntaxHighlighter
                          style={isDark ? duneCodeDark : duneCodeLight}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: '1rem',
                            fontSize: '0.875rem',
                            lineHeight: '1.5',
                            background: isDark ? '#1C1B1A' : '#f5f1e8',
                            borderRadius: '0.5rem',
                            overflowX: 'auto'
                          }}
                        >
                          {code}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <code {...props} className={cn('bg-muted/50 px-1.5 py-0.5 rounded-md text-sm', className)}>
                    {children}
                  </code>
                );
              }
              }}
            >
              {part.text || ''}
            </ReactMarkdown>
          </div>
        );

      case 'reasoning':
        return (
          <div key={index} className="text-sm text-muted-foreground/70 italic border-l-2 border-muted pl-3 my-2">
            {'text' in part ? part.text : ''}
          </div>
        );

      case 'tool':
        const toolPart = part as any as ToolPart;
        const isExpanded = expandedTools.has(toolPart.id);
        const state = toolPart.state;
        
        return (
          <div key={index} className="my-2 border border-border/30 rounded-md bg-muted/20">
            {/* Tool Header - Always Visible */}
            <div 
              className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleToolExpanded(toolPart.id)}
            >
              <Wrench className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="text-xs font-medium text-muted-foreground flex-shrink-0">
                {toolPart.tool}
              </span>
              
              {/* Show description in collapsed state */}
              <span className="text-xs text-muted-foreground/80 truncate">
                {/* Prioritize human-readable description over technical details */}
                {('input' in state && state.input?.description) ? state.input.description :
                 ('metadata' in state && state.metadata?.description) ? state.metadata.description :
                 ('title' in state && state.title) ? state.title :
                 ('input' in state && state.input?.command) ? state.input.command : ''}
              </span>
              
              <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                {getToolStateIcon(state.status)}
                
                {state.status !== 'pending' && 'time' in state && (
                  <span className="text-xs text-muted-foreground">
                    {formatDuration(state.time.start, 'end' in state.time ? state.time.end : undefined)}
                  </span>
                )}
                
                <div className="text-muted-foreground/60">
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </div>
              </div>
            </div>

            {/* Tool Details - Expandable */}
            {isExpanded && (
              <div className="px-2 pb-2 space-y-2 border-t border-border/20">
                {/* Command/Input */}
                {'input' in state && state.input && Object.keys(state.input).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {state.input.command ? 'Command:' : 'Input:'}
                    </div>
                    {state.input.command ? (
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded block font-mono">
                        {state.input.command}
                      </code>
                    ) : (
                      <code className="text-xs bg-muted/50 px-2 py-1 rounded block overflow-auto max-h-20">
                        {JSON.stringify(state.input, null, 2)}
                      </code>
                    )}
                  </div>
                )}
                
                {/* Output or Error */}
                {state.status === 'completed' && 'output' in state && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                    <div className="text-xs bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800/30 max-h-32 overflow-auto">
                      {state.output}
                    </div>
                  </div>
                )}
                
                {state.status === 'error' && 'error' in state && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Error:</div>
                    <div className="text-xs bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 p-2 rounded border border-red-200 dark:border-red-800/30">
                      {state.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className={cn(
      'group px-4 py-3 transition-colors',
      isUser ? 'bg-muted/30' : 'hover:bg-muted/10'
    )}>
      <div className="max-w-3xl mx-auto flex gap-4">
        <div className="flex-shrink-0">
          {isUser ? (
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <User className="h-4 w-4 text-primary" />
            </div>
          ) : (
            <div className="w-9 h-9 rounded-lg bg-secondary/50 flex items-center justify-center">
              {providerID ? (
                <img 
                  src={getProviderLogoUrl(providerID)} 
                  alt={`${providerID} logo`}
                  className="h-4 w-4"
                  style={{
                    filter: isDark ? 'brightness(0.9) contrast(1.1) invert(1)' : 'brightness(0.9) contrast(1.1)'
                  }}
                  onError={(e) => {
                    // Fallback to Bot icon if logo fails to load
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    const fallback = target.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'block';
                  }}
                />
              ) : null}
              <Bot className={cn("h-4 w-4 text-muted-foreground", providerID && "hidden")} />
            </div>
          )}
        </div>
        
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm">
              {isUser ? 'You' : 'Assistant'}
            </span>
            {isStreaming && !isUser && (
              <span className="text-xs text-muted-foreground animate-pulse">Processing...</span>
            )}
          </div>
          <div className="space-y-3 text-[15px] leading-relaxed overflow-hidden">
            {visibleParts.map((part, index) => renderPart(part, index))}
          </div>
        </div>
      </div>
    </div>
  );
};