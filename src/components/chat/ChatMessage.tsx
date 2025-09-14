import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { User, Bot, Copy, Check, Wrench, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight, Maximize2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageFilesDisplay } from './FileAttachment';
import { IncrementalStreamingText } from './IncrementalStreamingText';
import { cn } from '@/lib/utils';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { getToolMetadata, detectToolOutputLanguage, formatToolInput, getLanguageFromExtension } from '@/lib/toolHelpers';
import { TOOL_DISPLAY_STYLES } from '@/lib/toolDisplayConfig';
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
  const [popupContent, setPopupContent] = React.useState<{
    open: boolean;
    title: string;
    content: string;
    language?: string;
    isDiff?: boolean;
    diffHunks?: any[];
    metadata?: any;
  }>({ open: false, title: '', content: '' });
  const isDark = document.documentElement.classList.contains('dark');
  const isUser = message.info.role === 'user';

  // Get the current theme for syntax highlighting
  const { currentTheme } = useThemeSystem();
  const syntaxTheme = React.useMemo(() => {
    return currentTheme ? generateSyntaxTheme(currentTheme) : (isDark ? defaultCodeDark : defaultCodeLight);
  }, [currentTheme, isDark]);

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
        return <div className="animate-spin h-3 w-3 border-2 border-t-transparent rounded-full" style={{ borderColor: 'var(--status-info)' }} />;
      case 'completed':
        return <CheckCircle className="h-3 w-3" style={{ color: 'var(--status-success)' }} />;
      case 'error':
        return <XCircle className="h-3 w-3" style={{ color: 'var(--status-error)' }} />;
      default:
        return <Wrench className="h-3 w-3 text-muted-foreground" />;
    }
  };

  const formatDuration = (start: number, end?: number) => {
    const duration = end ? end - start : Date.now() - start;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  const cleanOutput = (output: string) => {
    // Remove <file> wrapper if present
    let cleaned = output.replace(/^<file>\s*\n?/, '').replace(/\n?<\/file>\s*$/, '');

    // Remove line numbers (format: 00001| or similar)
    cleaned = cleaned.replace(/^\s*\d{5}\|\s?/gm, '');

    return cleaned.trim();
  };

  const formatInputForDisplay = (input: any, toolName?: string) => {
    if (!input || typeof input !== 'object') {
      return String(input);
    }

    // Use the helper function for better formatting
    return formatToolInput(input, toolName || '');
  };

  // Check if output contains LSP diagnostics
  const hasLspDiagnostics = (output: string): boolean => {
    if (!output) return false;
    return output.includes('<file_diagnostics>') ||
           output.includes('This file has errors') ||
           output.includes('please fix');
  };

  // Strip LSP diagnostics from output
  const stripLspDiagnostics = (output: string): string => {
    if (!output) return '';
    // Remove diagnostic messages but keep any other content
    return output.replace(/This file has errors.*?<\/file_diagnostics>/s, '').trim();
  };

  const parseDiffToLines = (diffText: string) => {
    const lines = diffText.split('\n');
    let currentFile = '';
    const hunks: Array<{
      file: string;
      oldStart: number;
      newStart: number;
      lines: Array<{
        leftLine: {
          type: 'context' | 'removed' | 'empty';
          lineNumber: number | null;
          content: string;
        };
        rightLine: {
          type: 'context' | 'added' | 'empty';
          lineNumber: number | null;
          content: string;
        };
      }>;
    }> = [];

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      // Skip header lines
      if (line.startsWith('Index:') || line.startsWith('===') || line.startsWith('---') || line.startsWith('+++')) {
        if (line.startsWith('Index:')) {
          currentFile = line.split(' ')[1].split('/').pop() || 'file';
        }
        i++;
        continue;
      }

      // Parse hunk header (@@)
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/);
        const oldStart = match ? parseInt(match[1]) : 0;
        const newStart = match ? parseInt(match[2]) : 0;

        // First pass: collect all changes
        const changes: Array<{
          type: 'context' | 'added' | 'removed';
          content: string;
          oldLine?: number;
          newLine?: number;
        }> = [];

        let oldLineNum = oldStart;
        let newLineNum = newStart;
        let j = i + 1; // Skip the @@ line

        while (j < lines.length && !lines[j].startsWith('@@') && !lines[j].startsWith('Index:')) {
          const contentLine = lines[j];
          if (contentLine.startsWith('+')) {
            changes.push({
              type: 'added',
              content: contentLine.substring(1),
              newLine: newLineNum
            });
            newLineNum++;
          } else if (contentLine.startsWith('-')) {
            changes.push({
              type: 'removed',
              content: contentLine.substring(1),
              oldLine: oldLineNum
            });
            oldLineNum++;
          } else if (contentLine.startsWith(' ')) {
            changes.push({
              type: 'context',
              content: contentLine.substring(1),
              oldLine: oldLineNum,
              newLine: newLineNum
            });
            oldLineNum++;
            newLineNum++;
          }
          j++;
        }

        // Second pass: create properly aligned lines using two-pass algorithm
        const alignedLines: Array<{
          leftLine: {
            type: 'context' | 'removed' | 'empty';
            lineNumber: number | null;
            content: string;
          };
          rightLine: {
            type: 'context' | 'added' | 'empty';
            lineNumber: number | null;
            content: string;
          };
        }> = [];

        // Proper alignment algorithm: identical context lines must appear at same visual row
        // Create separate arrays for left and right sides
        const leftSide: Array<{type: 'context' | 'removed', lineNumber: number, content: string}> = [];
        const rightSide: Array<{type: 'context' | 'added', lineNumber: number, content: string}> = [];

        // Populate left and right sides
        changes.forEach(change => {
          if (change.type === 'context') {
            leftSide.push({ type: 'context', lineNumber: change.oldLine!, content: change.content });
            rightSide.push({ type: 'context', lineNumber: change.newLine!, content: change.content });
          } else if (change.type === 'removed') {
            leftSide.push({ type: 'removed', lineNumber: change.oldLine!, content: change.content });
          } else if (change.type === 'added') {
            rightSide.push({ type: 'added', lineNumber: change.newLine!, content: change.content });
          }
        });

        // Find alignment points - context lines with matching content
        const alignmentPoints: Array<{leftIdx: number, rightIdx: number}> = [];

        leftSide.forEach((leftItem, leftIdx) => {
          if (leftItem.type === 'context') {
            const rightIdx = rightSide.findIndex((rightItem, rIdx) =>
              rightItem.type === 'context' &&
              rightItem.content === leftItem.content &&
              !alignmentPoints.some(ap => ap.rightIdx === rIdx)
            );
            if (rightIdx >= 0) {
              alignmentPoints.push({ leftIdx, rightIdx });
            }
          }
        });

        // Sort alignment points
        alignmentPoints.sort((a, b) => a.leftIdx - b.leftIdx);

        // Build aligned output using alignment points
        let leftIdx = 0;
        let rightIdx = 0;
        let alignIdx = 0;

        while (leftIdx < leftSide.length || rightIdx < rightSide.length) {
          const nextAlign = alignIdx < alignmentPoints.length ? alignmentPoints[alignIdx] : null;

          // If we reached an alignment point
          if (nextAlign && leftIdx === nextAlign.leftIdx && rightIdx === nextAlign.rightIdx) {
            // Align matching context lines
            const leftItem = leftSide[leftIdx];
            const rightItem = rightSide[rightIdx];

            alignedLines.push({
              leftLine: {
                type: 'context',
                lineNumber: leftItem.lineNumber,
                content: leftItem.content
              },
              rightLine: {
                type: 'context',
                lineNumber: rightItem.lineNumber,
                content: rightItem.content
              }
            });

            leftIdx++;
            rightIdx++;
            alignIdx++;
          }
          // Process items before next alignment point
          else {
            const needProcessLeft = leftIdx < leftSide.length && (
              !nextAlign || leftIdx < nextAlign.leftIdx
            );
            const needProcessRight = rightIdx < rightSide.length && (
              !nextAlign || rightIdx < nextAlign.rightIdx
            );

            if (needProcessLeft && needProcessRight) {
              // Process both sides
              const leftItem = leftSide[leftIdx];
              const rightItem = rightSide[rightIdx];

              alignedLines.push({
                leftLine: {
                  type: leftItem.type,
                  lineNumber: leftItem.lineNumber,
                  content: leftItem.content
                },
                rightLine: {
                  type: rightItem.type,
                  lineNumber: rightItem.lineNumber,
                  content: rightItem.content
                }
              });

              leftIdx++;
              rightIdx++;
            }
            else if (needProcessLeft) {
              // Only left side
              const leftItem = leftSide[leftIdx];
              alignedLines.push({
                leftLine: {
                  type: leftItem.type,
                  lineNumber: leftItem.lineNumber,
                  content: leftItem.content
                },
                rightLine: {
                  type: 'empty',
                  lineNumber: null,
                  content: ''
                }
              });
              leftIdx++;
            }
            else if (needProcessRight) {
              // Only right side
              const rightItem = rightSide[rightIdx];
              alignedLines.push({
                leftLine: {
                  type: 'empty',
                  lineNumber: null,
                  content: ''
                },
                rightLine: {
                  type: rightItem.type,
                  lineNumber: rightItem.lineNumber,
                  content: rightItem.content
                }
              });
              rightIdx++;
            }
            else {
              break;
            }
          }
        }


        hunks.push({
          file: currentFile,
          oldStart,
          newStart,
          lines: alignedLines
        });

        i = j; // Skip to end of this hunk
        continue;
      }

      i++;
    }

    return hunks;
  };

  const formatEditOutput = (output: string, toolName: string, metadata?: any) => {
    let cleaned = cleanOutput(output);

    // For edit tools, strip LSP diagnostics if present
    if ((toolName === 'edit' || toolName === 'multiedit') && hasLspDiagnostics(cleaned)) {
      cleaned = stripLspDiagnostics(cleaned);
    }

    // For edit tools, if output is empty but we have diff in metadata, parse and format the diff
    if ((toolName === 'edit' || toolName === 'multiedit') && cleaned.trim().length === 0 && metadata?.diff) {
      return metadata.diff;
    }

    return cleaned;
  };



  const detectLanguageFromOutput = (output: string, toolName: string, input?: any) => {
    // Use the new helper function from toolHelpers
    return detectToolOutputLanguage(toolName, output, input);
  };

  const renderPart = (part: Part, index: number) => {
    switch (part.type) {
      case 'text':
        // Use incremental animation for assistant messages (both during and after streaming)
        if (!isUser) {
          // Use part.id as stable key to prevent recreation
          const partKey = part.id || `${message.info.id}-${index}`;
          return (
            <div key={partKey} className="break-words">
              <IncrementalStreamingText
                targetText={part.text || ''}
                isStreaming={isStreaming}
                speed={3}
                markdownComponents={{
              h1: ({ children }: any) => <h1 className="text-2xl font-bold mt-4 mb-2" style={{ color: 'var(--markdown-heading1)' }}>{children}</h1>,
              h2: ({ children }: any) => <h2 className="text-xl font-semibold mt-3 mb-2" style={{ color: 'var(--markdown-heading2)' }}>{children}</h2>,
              h3: ({ children }: any) => <h3 className="text-lg font-semibold mt-2 mb-1" style={{ color: 'var(--markdown-heading3)' }}>{children}</h3>,
              h4: ({ children }: any) => <h4 className="text-base font-semibold mt-2 mb-1 text-foreground">{children}</h4>,
              p: ({ children }: any) => <p className="mb-2 leading-relaxed">{children}</p>,
              ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-1" style={{ '--tw-prose-bullets': 'var(--markdown-list-marker)' } as React.CSSProperties}>{children}</ul>,
              ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-1" style={{ '--tw-prose-counters': 'var(--markdown-list-marker)' } as React.CSSProperties}>{children}</ol>,
              li: ({ children }: any) => <li className="leading-relaxed text-foreground/90">{children}</li>,
              blockquote: ({ children }: any) => (
                <blockquote className="border-l-4 border-muted pl-4 my-2 italic text-muted-foreground">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-4 border-t border-border" />,
              a: ({ href, children }: any) => (
                <a href={href} className="hover:underline" style={{ color: 'var(--markdown-link)' }} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }: any) => <em className="italic">{children}</em>,
              code({ className, children, ...props }: any) {
                const inline = !className?.startsWith('language-');
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return (
                    <div className="relative group my-2">
                      <div className="absolute right-2 top-2 flex gap-1 z-10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setPopupContent({
                              open: true,
                              title: `Code Block - ${match[1]}`,
                              content: code,
                              language: match[1],
                              isDiff: false
                            });
                          }}
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopyCode(code)}
                        >
                          {copiedCode === code ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full">
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: TOOL_DISPLAY_STYLES.padding.popup,
                            fontSize: TOOL_DISPLAY_STYLES.fontSize.inline,
                            lineHeight: TOOL_DISPLAY_STYLES.lineHeight.inline,
                            background: 'transparent',
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
                  <code {...props} className={cn('px-0.5 font-mono text-[0.85em] font-medium', className)} style={{ color: 'var(--markdown-inline-code)', backgroundColor: 'var(--markdown-inline-code-bg)' }}>
                    {children}
                  </code>
                );
               }
              }}
              />
            </div>
          );
        }
        
        // For non-streaming messages, use regular ReactMarkdown
        return (
          <div key={index} className="break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
              h1: ({ children }: any) => <h1 className="text-2xl font-bold mt-4 mb-2" style={{ color: 'var(--markdown-heading1)' }}>{children}</h1>,
              h2: ({ children }: any) => <h2 className="text-xl font-semibold mt-3 mb-2" style={{ color: 'var(--markdown-heading2)' }}>{children}</h2>,
              h3: ({ children }: any) => <h3 className="text-lg font-semibold mt-2 mb-1" style={{ color: 'var(--markdown-heading3)' }}>{children}</h3>,
              h4: ({ children }: any) => <h4 className="text-base font-semibold mt-2 mb-1 text-foreground">{children}</h4>,
              p: ({ children }: any) => <p className="mb-2 leading-relaxed">{children}</p>,
              ul: ({ children }: any) => <ul className="list-disc pl-5 mb-2 space-y-1" style={{ '--tw-prose-bullets': 'var(--markdown-list-marker)' } as React.CSSProperties}>{children}</ul>,
              ol: ({ children }: any) => <ol className="list-decimal pl-5 mb-2 space-y-1" style={{ '--tw-prose-counters': 'var(--markdown-list-marker)' } as React.CSSProperties}>{children}</ol>,
              li: ({ children }: any) => <li className="leading-relaxed text-foreground/90">{children}</li>,
              blockquote: ({ children }: any) => (
                <blockquote className="border-l-4 border-muted pl-4 my-2 italic text-muted-foreground">
                  {children}
                </blockquote>
              ),
              hr: () => <hr className="my-4 border-t border-border" />,
              a: ({ href, children }: any) => (
                <a href={href} className="hover:underline" style={{ color: 'var(--markdown-link)' }} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              ),
              strong: ({ children }: any) => <strong className="font-semibold text-foreground">{children}</strong>,
              em: ({ children }: any) => <em className="italic">{children}</em>,
              code({ className, children, ...props }: any) {
                const inline = !className?.startsWith('language-');
                const match = /language-(\w+)/.exec(className || '');
                const code = String(children).replace(/\n$/, '');

                if (!inline && match) {
                  return (
                    <div className="relative group my-2">
                      <div className="absolute right-2 top-2 flex gap-1 z-10">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setPopupContent({
                              open: true,
                              title: `Code Block - ${match[1]}`,
                              content: code,
                              language: match[1],
                              isDiff: false
                            });
                          }}
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleCopyCode(code)}
                        >
                          {copiedCode === code ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                      <div className="overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full">
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: TOOL_DISPLAY_STYLES.padding.popup,
                            fontSize: TOOL_DISPLAY_STYLES.fontSize.inline,
                            lineHeight: TOOL_DISPLAY_STYLES.lineHeight.inline,
                            background: 'transparent',
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
                  <code {...props} className={cn('px-0.5 font-mono text-[0.85em] font-medium', className)} style={{ color: 'var(--markdown-inline-code)', backgroundColor: 'var(--markdown-inline-code-bg)' }}>
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
          <div key={index} className="text-xs text-muted-foreground/50 italic border-l-2 border-muted/30 pl-3 my-1 font-light">
            {'text' in part ? part.text : ''}
          </div>
        );

      case 'tool':
        const toolPart = part as any as ToolPart;
        const isExpanded = expandedTools.has(toolPart.id);
        const state = toolPart.state;

        return (
          <div key={index} className="my-1.5 border border-border/30 rounded-md bg-muted/20">
            {/* Tool Header - Always Visible */}
            <div
              className="flex items-center gap-2 px-2 py-1 cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => toggleToolExpanded(toolPart.id)}
            >
              <div
                className="flex-1 flex items-center gap-2"
              >
                <Wrench className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-bold text-foreground flex-shrink-0">
                  {getToolMetadata(toolPart.tool).displayName}
                </span>

                {/* Show description in collapsed state */}
                <span className="text-xs text-muted-foreground/60 truncate font-normal">
                  {/* Prioritize human-readable description over technical details */}
                  {('input' in state && state.input?.description) ? state.input.description :
                   ('metadata' in state && state.metadata?.description) ? state.metadata.description :
                   ('title' in state && state.title) ? state.title :
                   ('input' in state && state.input?.command) ?
                     // For commands, show only the first line or truncate long commands
                     state.input.command.split('\n')[0].substring(0, 100) + (state.input.command.length > 100 ? '...' : '') :
                   ''}
                </span>

                <div className="flex items-center gap-2 ml-auto flex-shrink-0">
                  {/* LSP Error Indicator */}
                  {state.status === 'completed' && 'output' in state && hasLspDiagnostics(state.output) && (
                    <div className="flex items-center gap-1" title="LSP detected errors in this file">
                      <AlertTriangle className="h-3 w-3" style={{ color: 'var(--status-warning)' }} />
                    </div>
                  )}

                  {getToolStateIcon(state.status)}

                  {state.status !== 'pending' && 'time' in state && (
                    <span className="text-xs text-muted-foreground">
                      {formatDuration(state.time.start, 'end' in state.time ? state.time.end : undefined)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Popup button - show for all completed tools */}
                {state.status === 'completed' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      const isDiff = (toolPart.tool === 'edit' || toolPart.tool === 'multiedit') && state.metadata?.diff;
                      const hasOutput = 'output' in state && state.output;
                      const content = isDiff && state.metadata?.diff ?
                        state.metadata.diff :
                        (hasOutput ? formatEditOutput(state.output, toolPart.tool, state.metadata) : '');

                      // Detect the language for syntax highlighting
                      const detectedLanguage = detectLanguageFromOutput(content, toolPart.tool, state.input);

                      setPopupContent({
                        open: true,
                        title: `${getToolMetadata(toolPart.tool).displayName}${state.input?.filePath || state.input?.file_path ? ' - ' + (state.input?.filePath || state.input?.file_path) : ''}`,
                        content: content,
                        language: detectedLanguage,
                        isDiff: isDiff,
                        diffHunks: isDiff ? parseDiffToLines(state.metadata.diff) : undefined,
                        metadata: { input: state.input, tool: toolPart.tool }
                      });
                    }}
                  >
                    <Maximize2 className="h-3 w-3" />
                  </Button>
                )}

                {/* Expand/collapse button */}
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleToolExpanded(toolPart.id);
                  }}
                >
                  {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                </Button>
              </div>
            </div>

            {/* Tool Details - Expandable */}
            {isExpanded && (
              <div className="px-2 pb-1.5 pt-1.5 space-y-1.5 border-t border-border/20">
                {/* Command/Input */}
                {'input' in state && state.input && Object.keys(state.input).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">
                      {state.input.command ? 'Command:' : 'Input:'}
                    </div>
                    {state.input.command && toolPart.tool === 'bash' ? (
                      <div className="text-xs bg-muted/30 rounded border border-border/20 overflow-hidden">
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language="bash"
                          PreTag="div"
                          customStyle={{
                            ...TOOL_DISPLAY_STYLES.getCollapsedStyles(),
                            fontSize: 'inherit', // Inherit from parent text-xs
                          }}
                                          wrapLongLines={true}
                        >
                          {formatInputForDisplay(state.input, toolPart.tool)}
                        </SyntaxHighlighter>
                      </div>
                    ) : toolPart.tool === 'write' && state.input.content ? (
                      <div className="text-xs bg-muted/30 rounded border border-border/20 overflow-hidden">
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language={getLanguageFromExtension(state.input.filePath || state.input.file_path || '') || 'text'}
                          PreTag="div"
                          customStyle={{
                            ...TOOL_DISPLAY_STYLES.getCollapsedStyles(),
                            fontSize: 'inherit', // Inherit from parent text-xs
                          }}
                                          wrapLongLines={true}
                        >
                          {state.input.content}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <pre className="text-xs bg-muted/50 px-2 py-1 rounded font-mono whitespace-pre-wrap break-words text-foreground/90">
                        {formatInputForDisplay(state.input, toolPart.tool)}
                      </pre>
                    )}
                  </div>
                )}

                {/* Output or Error */}
                {state.status === 'completed' && 'output' in state && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                    {(toolPart.tool === 'edit' || toolPart.tool === 'multiedit') && (state.output?.trim().length === 0 || hasLspDiagnostics(state.output)) && state.metadata?.diff ? (
                      // Custom line-by-line diff view for edit tools
                      <div className="text-xs bg-muted/30 rounded border border-border/20 max-h-60 overflow-y-auto">
                        {parseDiffToLines(state.metadata.diff).map((hunk, hunkIdx) => (
                          <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                            <div className="bg-muted/20 px-2 py-1 text-xs font-medium text-muted-foreground border-b border-border/10">
                              {hunk.file} (line {hunk.oldStart})
                            </div>
                            <div>
                      {(hunk.lines as any[]).map((line: any, lineIdx: number) => (
                                <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                  {/* Left side - Old file */}
                                  <div
                                    className={cn(
                                      "text-xs font-mono leading-tight px-2 py-0.5 overflow-hidden",
                                      line.leftLine.type === 'context' && "bg-transparent",
                                      line.leftLine.type === 'empty' && "bg-transparent"
                                    )}
                                    style={line.leftLine.type === 'removed' ? { backgroundColor: 'var(--tools-edit-removed-bg)' } : {}}
                                  >
                                    <div className="flex">
                                      <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                        {line.leftLine.lineNumber || ''}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                      {line.leftLine.content && (
                                        <SyntaxHighlighter
                                          style={syntaxTheme}
                                          language={getLanguageFromExtension(state.input?.file_path || state.input?.filePath || hunk.file) || 'text'}
                                          PreTag="div"
                                          wrapLines={true}
                                          wrapLongLines={true}
                                          customStyle={{
                                            margin: 0,
                                            padding: 0,
                                            fontSize: 'inherit',
                                            lineHeight: 'inherit',
                                            background: 'transparent !important',
                                            borderRadius: 0,
                                            overflow: 'visible',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all',
                                            overflowWrap: 'anywhere'
                                          }}
                                          codeTagProps={{
                                            style: {
                                              background: 'transparent !important'
                                            }
                                          }}
                                        >
                                          {line.leftLine.content}
                                        </SyntaxHighlighter>
                                      )}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Right side - New file */}
                                  <div
                                    className={cn(
                                      "text-xs font-mono leading-tight px-2 py-0.5 overflow-hidden",
                                      line.rightLine.type === 'context' && "bg-transparent",
                                      line.rightLine.type === 'empty' && "bg-transparent"
                                    )}
                                    style={line.rightLine.type === 'added' ? { backgroundColor: 'var(--tools-edit-added-bg)' } : {}}
                                  >
                                    <div className="flex">
                                      <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                        {line.rightLine.lineNumber || ''}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                      {line.rightLine.content && (
                                        <SyntaxHighlighter
                                          style={syntaxTheme}
                                          language={getLanguageFromExtension(state.input?.file_path || state.input?.filePath || hunk.file) || 'text'}
                                          PreTag="div"
                                          wrapLines={true}
                                          wrapLongLines={true}
                                          customStyle={{
                                            margin: 0,
                                            padding: 0,
                                            fontSize: 'inherit',
                                            lineHeight: 'inherit',
                                            background: 'transparent !important',
                                            borderRadius: 0,
                                            overflow: 'visible',
                                            whiteSpace: 'pre-wrap',
                                            wordBreak: 'break-all',
                                            overflowWrap: 'anywhere'
                                          }}
                                          codeTagProps={{
                                            style: {
                                              background: 'transparent !important'
                                            }
                                          }}
                                        >
                                          {line.rightLine.content}
                                        </SyntaxHighlighter>
                                      )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : state.output && state.output.trim() ? (
                      // Regular output view - always use syntax highlighting for consistency
                      <div className="text-xs bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                        <SyntaxHighlighter
                          style={syntaxTheme}
                          language={detectLanguageFromOutput(formatEditOutput(state.output, toolPart.tool, state.metadata), toolPart.tool, state.input)}
                          PreTag="div"
                          customStyle={{
                            ...TOOL_DISPLAY_STYLES.getCollapsedStyles(),
                            padding: 0, // No padding for output
                            overflowX: 'visible'
                          }}
                          codeTagProps={{
                            style: {
                              background: 'transparent !important'
                            }
                          }}
                          wrapLongLines={true}
                        >
                          {formatEditOutput(state.output, toolPart.tool, state.metadata)}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      // No output message in collapsed view
                      <div className="text-xs bg-muted/30 p-3 rounded border border-border/20 text-muted-foreground/70">
                        No output produced
                      </div>
                    )}
                  </div>
                )}

                {state.status === 'error' && 'error' in state && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Error:</div>
                    <div className="text-xs p-2 rounded border" style={{
                      backgroundColor: 'var(--status-error-background)',
                      color: 'var(--status-error)',
                      borderColor: 'var(--status-error-border)'
                    }}>
                      {state.error}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );

      case 'file':
        // File parts are rendered separately using MessageFilesDisplay
        return null;

      default:
        return null;
    }
  };

  return (
    <>
      <div className="group px-4 py-3">
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
            <div className="flex items-start gap-2 mb-1">
              <h3 className={cn(
                "font-bold text-base tracking-tight leading-none",
                isUser ? "text-primary" : "text-foreground"
              )}>
                {isUser ? 'You' : 'Assistant'}
              </h3>
              {!isUser && (
                <span className={cn(
                  "text-xs italic font-light transition-opacity",
                  isStreaming ? "text-muted-foreground/50" : "opacity-0"
                )}>
                  Processing...
                </span>
              )}
            </div>
            <div className="space-y-0.5 text-sm leading-normal overflow-hidden text-foreground/90">
              {visibleParts.map((part, index) => renderPart(part, index))}
              <MessageFilesDisplay files={visibleParts} />
            </div>
          </div>
        </div>
      </div>

      {/* Popup Dialog for viewing content in larger window */}
      <Dialog open={popupContent.open} onOpenChange={(open) => setPopupContent(prev => ({ ...prev, open }))}>
        <DialogContent
          className="overflow-hidden flex flex-col p-4 gap-3"
          style={{ maxWidth: '95vw', width: '95vw', maxHeight: '90vh' }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground text-sm">
              <Wrench className="h-3.5 w-3.5 text-foreground" />
              <span className="truncate">{popupContent.title}</span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-auto rounded-lg border border-border/30 bg-muted/10">
            {/* Show tool-specific input information */}
            {popupContent.metadata?.input && Object.keys(popupContent.metadata.input).length > 0 && (
              <div className="border-b border-border/20 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {popupContent.metadata.tool === 'bash' ? 'Command:' :
                   popupContent.metadata.tool === 'task' ? 'Task Details:' :
                   'Input:'}
                </div>
                {popupContent.metadata.tool === 'bash' && popupContent.metadata.input.command ? (
                  <div className="bg-muted/30 rounded border border-border/20 overflow-hidden">
                    <SyntaxHighlighter
                      style={syntaxTheme}
                      language="bash"
                      PreTag="div"
                      customStyle={TOOL_DISPLAY_STYLES.getPopupStyles()}
                      wrapLongLines={true}
                    >
                      {popupContent.metadata.input.command}
                    </SyntaxHighlighter>
                  </div>
                ) : popupContent.metadata.tool === 'task' && popupContent.metadata.input.prompt ? (
                  <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={{ fontSize: TOOL_DISPLAY_STYLES.fontSize.popup, lineHeight: TOOL_DISPLAY_STYLES.lineHeight.popup }}>
{popupContent.metadata.input.description ? `Task: ${popupContent.metadata.input.description}\n` : ''}
{popupContent.metadata.input.subagent_type ? `Agent Type: ${popupContent.metadata.input.subagent_type}\n` : ''}
{`Instructions:\n${popupContent.metadata.input.prompt}`}
                  </pre>
                ) : popupContent.metadata.tool === 'write' && popupContent.metadata.input.content ? (
                  <div className="bg-muted/30 rounded border border-border/20 overflow-hidden">
                    <SyntaxHighlighter
                      style={syntaxTheme}
                      language={getLanguageFromExtension(popupContent.metadata.input.filePath || popupContent.metadata.input.file_path || '') || 'text'}
                      PreTag="div"
                      customStyle={TOOL_DISPLAY_STYLES.getPopupStyles()}
                      wrapLongLines={true}
                    >
                      {popupContent.metadata.input.content}
                    </SyntaxHighlighter>
                  </div>
                ) : (
                  <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={{ fontSize: TOOL_DISPLAY_STYLES.fontSize.popup, lineHeight: TOOL_DISPLAY_STYLES.lineHeight.popup }}>
                    {formatInputForDisplay(popupContent.metadata.input, popupContent.metadata.tool)}
                  </pre>
                )}
              </div>
            )}

            {popupContent.isDiff && popupContent.diffHunks ? (
              // Render diff view
              <div className="text-xs">
                {popupContent.diffHunks.map((hunk, hunkIdx) => (
                  <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                    <div className="bg-muted/20 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10">
                      {hunk.file} (line {hunk.oldStart})
                    </div>
                    <div>
                      {hunk.lines.map((line: any, lineIdx: number) => (
                        <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                          {/* Left side - Old file */}
                          <div
                            className={cn(
                              "text-xs font-mono px-3 py-0.5 overflow-hidden",
                              line.leftLine.type === 'context' && "bg-transparent",
                              line.leftLine.type === 'empty' && "bg-transparent"
                            )}
                            style={{
                              lineHeight: '1.1',
                              ...(line.leftLine.type === 'removed' ? { backgroundColor: 'var(--tools-edit-removed-bg)' } : {})
                            }}
                          >
                            <div className="flex">
                              <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                {line.leftLine.lineNumber || ''}
                              </span>
                              <div className="flex-1 min-w-0">
                                {line.leftLine.content && (
                                  <SyntaxHighlighter
                                    style={syntaxTheme}
                                    language={getLanguageFromExtension(popupContent.metadata?.input?.file_path || popupContent.metadata?.input?.filePath || hunk.file) || 'text'}
                                    PreTag="div"
                                    wrapLines={true}
                                    wrapLongLines={true}
                                    customStyle={{
                                      margin: 0,
                                      padding: 0,
                                      fontSize: 'inherit',
                                      lineHeight: 'inherit',
                                      background: 'transparent !important',
                                      borderRadius: 0,
                                      overflow: 'visible',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      overflowWrap: 'anywhere'
                                    }}
                                    codeTagProps={{
                                      style: {
                                        background: 'transparent !important'
                                      }
                                    }}
                                  >
                                    {line.leftLine.content}
                                  </SyntaxHighlighter>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* Right side - New file */}
                          <div
                            className={cn(
                              "text-xs font-mono px-3 py-0.5 overflow-hidden",
                              line.rightLine.type === 'context' && "bg-transparent",
                              line.rightLine.type === 'empty' && "bg-transparent"
                            )}
                            style={{
                              lineHeight: '1.1',
                              ...(line.rightLine.type === 'added' ? { backgroundColor: 'var(--tools-edit-added-bg)' } : {})
                            }}
                          >
                            <div className="flex">
                              <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                {line.rightLine.lineNumber || ''}
                              </span>
                              <div className="flex-1 min-w-0">
                                {line.rightLine.content && (
                                  <SyntaxHighlighter
                                    style={syntaxTheme}
                                    language={getLanguageFromExtension(popupContent.metadata?.input?.file_path || popupContent.metadata?.input?.filePath || hunk.file) || 'text'}
                                    PreTag="div"
                                    wrapLines={true}
                                    wrapLongLines={true}
                                    customStyle={{
                                      margin: 0,
                                      padding: 0,
                                      fontSize: 'inherit',
                                      lineHeight: 'inherit',
                                      background: 'transparent !important',
                                      borderRadius: 0,
                                      overflow: 'visible',
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-all',
                                      overflowWrap: 'anywhere'
                                    }}
                                    codeTagProps={{
                                      style: {
                                        background: 'transparent !important'
                                      }
                                    }}
                                  >
                                    {line.rightLine.content}
                                  </SyntaxHighlighter>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : popupContent.content ? (
              // Always render as syntax-highlighted code for consistency
              <div className="p-4">
                <SyntaxHighlighter
                  style={syntaxTheme}
                  language={popupContent.language || 'text'}
                  PreTag="div"
                  wrapLongLines={true}
                  customStyle={TOOL_DISPLAY_STYLES.getPopupContainerStyles()}
                  codeTagProps={{
                    style: {
                      background: 'transparent !important'
                    }
                  }}
                >
                  {popupContent.content}
                </SyntaxHighlighter>
              </div>
            ) : (
              // No output message
              <div className="p-8 text-muted-foreground text-sm">
                <div className="mb-2">Command completed successfully</div>
                <div className="text-xs">No output was produced</div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
