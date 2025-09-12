import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { duneCodeDark, duneCodeLight } from '@/lib/codeTheme';
import { User, Bot, Copy, Check, Wrench, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight, Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

  const cleanOutput = (output: string) => {
    // Remove <file> wrapper if present
    let cleaned = output.replace(/^<file>\s*\n?/, '').replace(/\n?<\/file>\s*$/, '');
    
    // Remove line numbers (format: 00001| or similar)
    cleaned = cleaned.replace(/^\s*\d{5}\|\s?/gm, '');
    
    return cleaned.trim();
  };

  const formatInputForDisplay = (input: any) => {
    if (!input || typeof input !== 'object') {
      return String(input);
    }

    // Handle common input patterns
    if (input.filePath) {
      return input.filePath;
    }
    
    if (input.pattern && input.path) {
      return `"${input.pattern}" in ${input.path}`;
    }
    
    if (input.pattern) {
      return `Pattern: ${input.pattern}`;
    }
    
    if (input.command) {
      // Just return the command as-is, preserving any formatting from the backend
      return input.command;
    }
    
    // For other objects, show key-value pairs in a readable format
    const entries = Object.entries(input);
    if (entries.length === 1) {
      const [key, value] = entries[0];
      return `${key}: ${value}`;
    }
    
    // Multiple entries - show as key: value pairs
    return entries.map(([key, value]) => `${key}: ${value}`).join(', ');
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
    const cleaned = cleanOutput(output);
    
    // For edit tools, if output is empty but we have diff in metadata, parse and format the diff
    if ((toolName === 'edit' || toolName === 'multiedit') && cleaned.trim().length === 0 && metadata?.diff) {
      return metadata.diff;
    }
    
    return cleaned;
  };

  const getLanguageFromExtension = (filePath: string) => {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const extensionMap: Record<string, string> = {
      'js': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'jsx': 'javascript',
      'py': 'python',
      'md': 'markdown',
      'json': 'json',
      'yaml': 'yaml',
      'yml': 'yaml',
      'css': 'css',
      'html': 'html',
      'xml': 'xml',
      'sh': 'bash',
      'bash': 'bash',
      'zsh': 'bash',
      'sql': 'sql',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp'
    };
    return ext && extensionMap[ext] ? extensionMap[ext] : null;
  };

  const detectLanguageFromOutput = (output: string, toolName: string, input?: any) => {
    // Check if it's an edit operation
    if (toolName === 'edit' || toolName === 'multiedit') {
      // Check if output contains diff markers
      if (output.includes('@@') || output.includes('---') || output.includes('+++') || output.includes('-') || output.includes('+')) {
        return 'diff';
      }
      
      // For edit operations, detect language from file path
      const filePath = input?.file_path || input?.filePath;
      if (filePath) {
        const language = getLanguageFromExtension(filePath);
        if (language) {
          return language;
        }
      }
      
      return 'text';
    }
    
    // Check if it's a file read operation
    if (toolName === 'read' && input?.filePath) {
      const language = getLanguageFromExtension(input.filePath);
      if (language) {
        return language;
      }
    }
    
    // Check if it looks like JSON
    if (output.trim().startsWith('{') || output.trim().startsWith('[')) {
      try {
        JSON.parse(output.trim());
        return 'json';
      } catch {}
    }
    
    // Check if it looks like HTML/XML
    if (output.trim().startsWith('<')) {
      return 'html';
    }
    
    return 'text';
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
                          style={isDark ? duneCodeDark : duneCodeLight}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: '0.75rem',
                            fontSize: '0.75rem',
                            lineHeight: '1.4',
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
                  {toolPart.tool}
                </span>
                
                {/* Show description in collapsed state */}
                <span className="text-xs text-muted-foreground/60 truncate font-normal">
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
                </div>
              </div>
              
              <div className="flex items-center gap-1 flex-shrink-0">
                {/* Popup button - show when there's output or diff metadata */}
                {state.status === 'completed' && (
                  ('output' in state && state.output) || 
                  (state.metadata?.diff)
                ) && (
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
                      
                      setPopupContent({
                        open: true,
                        title: `${toolPart.tool} - ${state.input?.filePath || state.input?.file_path || state.input?.command || 'Output'}`,
                        content: content,
                        language: detectLanguageFromOutput(content, toolPart.tool, state.input),
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
                          style={isDark ? duneCodeDark : duneCodeLight}
                          language="bash"
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: '0.5rem',
                            fontSize: 'inherit',
                            lineHeight: '1.3',
                            background: 'transparent !important',
                            borderRadius: 0
                          }}
                          wrapLongLines={true}
                        >
                          {formatInputForDisplay(state.input)}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <pre className="text-xs bg-muted/50 px-2 py-1 rounded font-mono whitespace-pre-wrap break-words">
                        {formatInputForDisplay(state.input)}
                      </pre>
                    )}
                  </div>
                )}
                
                {/* Output or Error */}
                {state.status === 'completed' && 'output' in state && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground mb-1">Output:</div>
                    {(toolPart.tool === 'edit' || toolPart.tool === 'multiedit') && state.output?.trim().length === 0 && state.metadata?.diff ? (
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
                                      line.leftLine.type === 'removed' && "bg-red-100/50 dark:bg-red-900/20",
                                      line.leftLine.type === 'context' && "bg-transparent",
                                      line.leftLine.type === 'empty' && "bg-transparent"
                                    )}
                                  >
                                    <div className="flex">
                                      <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                        {line.leftLine.lineNumber || ''}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                      {line.leftLine.content && (
                                        <SyntaxHighlighter
                                          style={isDark ? duneCodeDark : duneCodeLight}
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
                                      line.rightLine.type === 'added' && "bg-green-100/50 dark:bg-green-900/20",
                                      line.rightLine.type === 'context' && "bg-transparent",
                                      line.rightLine.type === 'empty' && "bg-transparent"
                                    )}
                                  >
                                    <div className="flex">
                                      <span className="text-muted-foreground/60 w-8 flex-shrink-0 text-right pr-2 self-start">
                                        {line.rightLine.lineNumber || ''}
                                      </span>
                                      <div className="flex-1 min-w-0">
                                      {line.rightLine.content && (
                                        <SyntaxHighlighter
                                          style={isDark ? duneCodeDark : duneCodeLight}
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
                    ) : (
                      // Regular output view
                      <div className="text-xs bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                        <SyntaxHighlighter
                          style={isDark ? duneCodeDark : duneCodeLight}
                          language={detectLanguageFromOutput(formatEditOutput(state.output, toolPart.tool, state.metadata), toolPart.tool, state.input)}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: 0,
                            fontSize: '0.7rem',
                            lineHeight: '1.3',
                            background: 'transparent !important',
                            borderRadius: 0,
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
                    )}
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
              {isStreaming && !isUser && (
                <span className="text-xs text-muted-foreground/50 italic font-light">Processing...</span>
              )}
            </div>
            <div className="space-y-0.5 text-sm leading-normal overflow-hidden text-foreground/90">
              {visibleParts.map((part, index) => renderPart(part, index))}
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
              {popupContent.title}
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-auto rounded-lg border border-border/30 bg-muted/10">
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
                              "text-xs font-mono leading-relaxed px-3 py-1 overflow-hidden",
                              line.leftLine.type === 'removed' && "bg-red-100/50 dark:bg-red-900/20",
                              line.leftLine.type === 'context' && "bg-transparent",
                              line.leftLine.type === 'empty' && "bg-transparent"
                            )}
                          >
                            <div className="flex">
                              <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                {line.leftLine.lineNumber || ''}
                              </span>
                              <div className="flex-1 min-w-0">
                                {line.leftLine.content && (
                                  <SyntaxHighlighter
                                    style={isDark ? duneCodeDark : duneCodeLight}
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
                              "text-xs font-mono leading-relaxed px-3 py-1 overflow-hidden",
                              line.rightLine.type === 'added' && "bg-green-100/50 dark:bg-green-900/20",
                              line.rightLine.type === 'context' && "bg-transparent",
                              line.rightLine.type === 'empty' && "bg-transparent"
                            )}
                          >
                            <div className="flex">
                              <span className="text-muted-foreground/60 w-10 flex-shrink-0 text-right pr-3 self-start select-none">
                                {line.rightLine.lineNumber || ''}
                              </span>
                              <div className="flex-1 min-w-0">
                                {line.rightLine.content && (
                                  <SyntaxHighlighter
                                    style={isDark ? duneCodeDark : duneCodeLight}
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
            ) : (
              // Render regular code/output view
              <div className="p-4">
                <SyntaxHighlighter
                  style={isDark ? duneCodeDark : duneCodeLight}
                  language={popupContent.language || 'text'}
                  PreTag="div"
                  wrapLines={true}
                  wrapLongLines={true}
                  customStyle={{
                    margin: 0,
                    padding: '1rem',
                    fontSize: '0.8rem',
                    lineHeight: '1.5',
                    background: isDark ? '#1C1B1A' : '#f5f1e8',
                    borderRadius: '0.5rem',
                    overflowX: 'auto'
                  }}
                >
                  {popupContent.content}
                </SyntaxHighlighter>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};