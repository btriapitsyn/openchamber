import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { defaultCodeDark, defaultCodeLight } from '@/lib/codeTheme';
import { User, Bot, Copy, Check, Wrench, Clock, CheckCircle, XCircle, ChevronDown, ChevronRight, Maximize2, AlertTriangle, X, Terminal, FileEdit, FileText, FileCode, FolderOpen, Globe, Search, GitBranch, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MessageFilesDisplay } from './FileAttachment';
import { cn } from '@/lib/utils';
import { useThemeSystem } from '@/contexts/ThemeSystemContext';
import { generateSyntaxTheme } from '@/lib/theme/syntaxThemeGenerator';
import { getToolMetadata, detectToolOutputLanguage, formatToolInput, getLanguageFromExtension } from '@/lib/toolHelpers';
import { toolDisplayStyles } from '@/lib/typography';
import { typography } from '@/lib/typography';
import { getAgentColor } from '@/lib/agentColors';
import { MessageFreshnessDetector } from '@/lib/messageFreshness';
import { SmoothTextAnimation } from './SmoothTextAnimation';
import { useSessionStore } from '@/stores/useSessionStore';
import type { Message, Part } from '@opencode-ai/sdk';
import type { ToolPart, ToolStateUnion } from '@/types/tool';

interface ChatMessageProps {
    message: {
        info: Message;
        parts: Part[];
    };
    isStreaming?: boolean;
    onContentChange?: () => void; // Callback to trigger scroll updates during animation
    isUserScrolling?: boolean; // Flag to prevent scroll updates during user interaction
    onAnimationComplete?: () => void; // Callback when animation finishes

}

// Map tool names to appropriate icons
const getToolIcon = (toolName: string, size: 'small' | 'default' = 'small') => {
    const iconClass = size === 'small' ? "h-3 w-3 text-muted-foreground flex-shrink-0" : "h-3.5 w-3.5 text-muted-foreground flex-shrink-0";
    const tool = toolName.toLowerCase();

    // File operations
    if (tool === 'edit' || tool === 'multiedit' || tool === 'str_replace' || tool === 'str_replace_based_edit_tool') {
        return <FileEdit className={iconClass} />;
    }
    if (tool === 'write' || tool === 'create' || tool === 'file_write') {
        return <FileText className={iconClass} />;
    }
    if (tool === 'read' || tool === 'view' || tool === 'file_read' || tool === 'cat') {
        return <FileCode className={iconClass} />;
    }

    // Shell/Terminal
    if (tool === 'bash' || tool === 'shell' || tool === 'cmd' || tool === 'terminal') {
        return <Terminal className={iconClass} />;
    }

    // Directory operations
    if (tool === 'list' || tool === 'ls' || tool === 'dir' || tool === 'list_files') {
        return <FolderOpen className={iconClass} />;
    }

    // Search operations
    if (tool === 'search' || tool === 'grep' || tool === 'find' || tool === 'ripgrep') {
        return <Search className={iconClass} />;
    }

    // Web operations
    if (tool === 'fetch' || tool === 'curl' || tool === 'wget' || tool === 'webfetch') {
        return <Globe className={iconClass} />;
    }

    // Web search operations
    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web' || tool === 'google' || tool === 'bing' || tool === 'duckduckgo') {
        return <Search className={iconClass} />;
    }

    // Git operations
    if (tool.startsWith('git')) {
        return <GitBranch className={iconClass} />;
    }

    // Default
    return <Wrench className={iconClass} />;
};

export const ChatMessage: React.FC<ChatMessageProps> = ({ message, isStreaming = false, onContentChange, isUserScrolling, onAnimationComplete }) => {
    const [copiedCode, setCopiedCode] = React.useState<string | null>(null);
    const [expandedTools, setExpandedTools] = React.useState<Set<string>>(new Set());
    const [isAnimating, setIsAnimating] = React.useState(false);

    // Combined streaming state: streaming OR animating
    const isStreamingOrAnimating = isStreaming || isAnimating;

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
    
    // Get current session ID for message freshness detection
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    
    // Track session changes for message freshness detection
    React.useEffect(() => {
        if (currentSessionId) {
            const freshnessDetector = MessageFreshnessDetector.getInstance();
            freshnessDetector.recordSessionStart(currentSessionId);
        }
    }, [currentSessionId]);
    
    // Memoize message freshness check to prevent repeated calls
    const shouldAnimateMessage = React.useMemo(() => {
        if (isUser) return false;
        const freshnessDetector = MessageFreshnessDetector.getInstance();
        return freshnessDetector.shouldAnimateMessage(message.info, currentSessionId || message.info.sessionID);
    }, [message.info.id, currentSessionId, isUser]);

    // Get the current theme for syntax highlighting
    const { currentTheme } = useThemeSystem();
    const syntaxTheme = React.useMemo(() => {
        return currentTheme ? generateSyntaxTheme(currentTheme) : (isDark ? defaultCodeDark : defaultCodeLight);
    }, [currentTheme, isDark]);

    // Get provider ID and agent from message info for assistant messages
    const providerID = !isUser && 'providerID' in message.info ? (message.info as any).providerID : null;
    const agentName = !isUser && 'agent' in message.info ? (message.info as any).agent : null;

    const getProviderLogoUrl = (providerId: string) => {
        return `https://models.dev/logos/${providerId.toLowerCase()}.svg`;
    };

    // Filter out synthetic parts and reorder so reasoning comes before text
    const filteredParts = message.parts.filter(part =>
        !('synthetic' in part && part.synthetic)
    );

    // Reorder parts: reasoning first, then everything else
    const visibleParts = [
        ...filteredParts.filter(part => part.type === 'reasoning'),
        ...filteredParts.filter(part => part.type !== 'reasoning')
    ];

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
                const leftSide: Array<{ type: 'context' | 'removed', lineNumber: number, content: string }> = [];
                const rightSide: Array<{ type: 'context' | 'added', lineNumber: number, content: string }> = [];

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
                const alignmentPoints: Array<{ leftIdx: number, rightIdx: number }> = [];

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

    // Helper function to render list tool output as a tree
    const renderListOutput = (output: string) => {
        try {
            // Parse the output - list tool shows indented structure
            const lines = output.trim().split('\n').filter(Boolean);
            if (lines.length === 0) return null;

            // Process the lines to determine structure
            const items: Array<{ name: string, depth: number, isFile: boolean }> = [];

            lines.forEach(line => {
                // Count leading spaces to determine depth
                const match = line.match(/^(\s*)(.+)$/);
                if (match) {
                    const [, spaces, name] = match;
                    const depth = Math.floor(spaces.length / 2); // Each indent level is 2 spaces
                    const isFile = !name.endsWith('/');
                    items.push({
                        name: name.replace(/\/$/, ''), // Remove trailing slash for display
                        depth,
                        isFile
                    });
                }
            });

            return (
                <div className="p-3 bg-muted/20 rounded-md border border-border/30 font-mono space-y-0.5" style={typography.micro}>
                    {items.map((item, idx) => (
                        <div key={idx} style={{ paddingLeft: `${item.depth * 20}px` }}>
                            {item.isFile ? (
                                <span className="text-foreground/90">{item.name}</span>
                            ) : (
                                <span className="font-semibold text-foreground">{item.name}/</span>
                            )}
                        </div>
                    ))}
                </div>
            );
        } catch (e) {
            return null;
        }
    };

    // Helper function to render grep tool output with highlighted matches
    const renderGrepOutput = (output: string) => {
        try {
            // Parse grep output format: filename:line_number:content
            const lines = output.trim().split('\n').filter(Boolean);
            if (lines.length === 0) return null;

            // Group by file
            const fileGroups: Record<string, Array<{ lineNum: string, content: string }>> = {};

            lines.forEach(line => {
                // Handle different grep formats
                const match = line.match(/^(.+?):(\d+):(.*)$/) || line.match(/^(.+?):(.*)$/);
                if (match) {
                    const [, filepath, lineNumOrContent, content] = match;
                    const lineNum = content !== undefined ? lineNumOrContent : '';
                    const actualContent = content !== undefined ? content : lineNumOrContent;

                    if (!fileGroups[filepath]) {
                        fileGroups[filepath] = [];
                    }
                    fileGroups[filepath].push({ lineNum, content: actualContent });
                }
            });

            return (
                <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/30">
                    {Object.entries(fileGroups).map(([filepath, matches]) => (
                        <div key={filepath} className="space-y-1">
                            <div className="flex items-center gap-2" style={typography.micro}>
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--primary)' }} />
                                <span className="font-medium text-foreground">{filepath}</span>
                                <span className="text-muted-foreground">({matches.length} match{matches.length !== 1 ? 'es' : ''})</span>
                            </div>
                            <div className="pl-4 space-y-0.5">
                                {matches.map((match, idx) => (
                                    <div key={idx} className="flex gap-2 typography-meta font-mono">
                                        {match.lineNum && (
                                            <span className="text-muted-foreground min-w-[3rem] text-right">{match.lineNum}:</span>
                                        )}
                                        <span className="text-foreground break-all">{match.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        } catch (e) {
            return null;
        }
    };

    // Helper function to render glob tool output
    const renderGlobOutput = (output: string) => {
        try {
            const paths = output.trim().split('\n').filter(Boolean);
            if (paths.length === 0) return null;

            // Group by directory
            const groups: Record<string, string[]> = {};
            paths.forEach(path => {
                const lastSlash = path.lastIndexOf('/');
                const dir = lastSlash > 0 ? path.substring(0, lastSlash) : '/';
                const filename = lastSlash >= 0 ? path.substring(lastSlash + 1) : path;

                if (!groups[dir]) {
                    groups[dir] = [];
                }
                groups[dir].push(filename);
            });

            // Sort directories and files within each directory
            const sortedDirs = Object.keys(groups).sort();

            return (
                <div className="space-y-2 p-3 bg-muted/20 rounded-md border border-border/30">
                    <div className="typography-meta text-muted-foreground mb-2">
                        Found {paths.length} file{paths.length !== 1 ? 's' : ''}
                    </div>
                    {sortedDirs.map(dir => (
                        <div key={dir} className="space-y-1">
                            <div className="typography-meta font-medium text-muted-foreground">{dir}/</div>
                            <div className="pl-4 grid grid-cols-2 gap-1">
                                {groups[dir].sort().map(filename => (
                                    <div key={filename} className="flex items-center gap-2 typography-meta">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--status-info)', opacity: 0.6 }} />
                                        <span className="text-foreground font-mono">{filename}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            );
        } catch (e) {
            return null;
        }
    };

    // Helper function to parse and render todo tool output
    const renderTodoOutput = (output: string) => {
        try {
            // Parse the output to extract todos array
            const todos = JSON.parse(output);

            if (!Array.isArray(todos)) {
                return null;
            }

            // Group todos by status
            const todosByStatus = {
                in_progress: todos.filter(t => t.status === 'in_progress'),
                pending: todos.filter(t => t.status === 'pending'),
                completed: todos.filter(t => t.status === 'completed'),
                cancelled: todos.filter(t => t.status === 'cancelled')
            };

            // Priority dot styles using theme variables
            const getPriorityDot = (priority: string) => {
                const baseClasses = "w-2 h-2 rounded-full flex-shrink-0 mt-1";
                switch (priority) {
                    case 'high':
                        return <div className={baseClasses} style={{ backgroundColor: 'var(--status-error)' }} />;
                    case 'medium':
                        return <div className={baseClasses} style={{ backgroundColor: 'var(--primary)' }} />;
                    case 'low':
                        return <div className={baseClasses} style={{ backgroundColor: 'var(--status-info)' }} />;
                    default:
                        return <div className={baseClasses} style={{ backgroundColor: 'var(--muted-foreground)', opacity: 0.5 }} />;
                }
            };

            return (
                <div className="space-y-3 p-3 bg-muted/20 rounded-md border border-border/30">
                    {/* Summary stats */}
                    <div className="flex gap-4 typography-meta pb-2 border-b border-border/20">
                        <span className="font-medium" style={{ color: 'var(--muted-foreground)' }}>Total: {todos.length}</span>
                        {todosByStatus.in_progress.length > 0 && (
                            <span className="font-medium" style={{ color: 'var(--foreground)' }}>In Progress: {todosByStatus.in_progress.length}</span>
                        )}
                        {todosByStatus.pending.length > 0 && (
                            <span style={{ color: 'var(--muted-foreground)' }}>Pending: {todosByStatus.pending.length}</span>
                        )}
                        {todosByStatus.completed.length > 0 && (
                            <span style={{ color: 'var(--status-success)' }}>Completed: {todosByStatus.completed.length}</span>
                        )}
                        {todosByStatus.cancelled.length > 0 && (
                            <span style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}>Cancelled: {todosByStatus.cancelled.length}</span>
                        )}
                    </div>

                    {/* In Progress todos */}
                    {todosByStatus.in_progress.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--foreground)' }} />
                                <span className="typography-meta font-semibold text-foreground uppercase tracking-wide">In Progress</span>
                            </div>
                            <div className="space-y-1.5 pl-4">
                                {todosByStatus.in_progress.map((todo, idx) => (
                                    <div key={todo.id || idx} className="flex items-start gap-2">
                                        {getPriorityDot(todo.priority)}
                                        <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pending todos */}
                    {todosByStatus.pending.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                                <span className="typography-meta font-semibold text-muted-foreground uppercase tracking-wide">Pending</span>
                            </div>
                            <div className="space-y-1.5 pl-4">
                                {todosByStatus.pending.map((todo, idx) => (
                                    <div key={todo.id || idx} className="flex items-start gap-2">
                                        {getPriorityDot(todo.priority)}
                                        <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Completed todos */}
                    {todosByStatus.completed.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} />
                                <span className="typography-meta font-semibold uppercase tracking-wide" style={{ color: 'var(--status-success)' }}>Completed</span>
                            </div>
                            <div className="space-y-1.5 pl-4">
                                {todosByStatus.completed.map((todo, idx) => (
                                    <div key={todo.id || idx} className="flex items-start gap-2">
                                        <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-success)', opacity: 0.7 }} />
                                        <span className="typography-meta text-foreground flex-1 leading-relaxed">{todo.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Cancelled todos */}
                    {todosByStatus.cancelled.length > 0 && (
                        <div className="space-y-2">
                            <div className="flex items-center gap-2">
                                <X className="w-3 h-3 text-muted-foreground/50" />
                                <span className="typography-meta font-semibold text-muted-foreground/50 uppercase tracking-wide">Cancelled</span>
                            </div>
                            <div className="space-y-1.5 pl-4">
                                {todosByStatus.cancelled.map((todo, idx) => (
                                    <div key={todo.id || idx} className="flex items-start gap-2">
                                        <X className="w-3 h-3 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                                        <span className="typography-meta text-muted-foreground/50 line-through flex-1 leading-relaxed">{todo.content}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            );
        } catch (e) {
            // If parsing fails, return null to fall back to default rendering
            return null;
        }
    };

    // Helper function to render web-search tool output with markdown syntax highlighting
    const renderWebSearchOutput = (output: string) => {
        try {
            // For web-search, render as markdown with syntax highlighting
            return (
                <div className="typography-meta max-w-none p-3 bg-muted/20 rounded border border-border/20">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            h1: ({ children }: any) => <h1 className="typography-markdown font-bold mt-3 mb-2" style={{ color: 'var(--foreground)' }}>{children}</h1>,
                            h2: ({ children }: any) => <h2 className="typography-markdown font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h2>,
                            h3: ({ children }: any) => <h3 className="typography-ui-label font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h3>,
                            p: ({ children }: any) => <p className="typography-meta mb-2 leading-relaxed" style={{ color: 'var(--foreground)' }}>{children}</p>,
                            ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5 typography-meta" style={{ color: 'var(--foreground)' }}>{children}</ul>,
                            ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 typography-meta" style={{ color: 'var(--foreground)' }}>{children}</ol>,
                            li: ({ children }: any) => <li className="leading-relaxed" style={{ color: 'var(--foreground)' }}>{children}</li>,
                            code: ({ className, children }: any) => {
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                    <SyntaxHighlighter
                                        style={syntaxTheme}
                                        language={match[1]}
                                        PreTag="div"
                                        customStyle={{
                                            fontSize: 'var(--code-block-font-size, 0.6875rem)',
                                            lineHeight: 'var(--code-block-line-height, 1.35)',
                                            marginTop: '0.5rem',
                                            marginBottom: '0.5rem'
                                        }}
                                    >
                                        {String(children).replace(/\n$/, '')}
                                    </SyntaxHighlighter>
                                ) : (
                                    <code className="px-1 py-0.5 rounded typography-meta" style={{
                                        backgroundColor: 'var(--muted)',
                                        color: 'var(--foreground)'
                                    }}>
                                        {children}
                                    </code>
                                );
                            },
                            blockquote: ({ children }: any) => (
                                <blockquote className="border-l-2 pl-3 my-2 typography-meta" style={{
                                    borderColor: 'var(--primary)',
                                    color: 'var(--muted-foreground)'
                                }}>
                                    {children}
                                </blockquote>
                            ),
                            a: ({ children, href }: any) => (
                                <a href={href} className="underline typography-meta" style={{ color: 'var(--primary)' }} target="_blank" rel="noopener noreferrer">
                                    {children}
                                </a>
                            )
                        }}
                    >
                        {output}
                    </ReactMarkdown>
                </div>
            );
        } catch (e) {
            // If rendering fails, return null to fall back to default rendering
            return null;
        }
    };



    const detectLanguageFromOutput = (output: string, toolName: string, input?: any) => {
        // Use the new helper function from toolHelpers
        return detectToolOutputLanguage(toolName, output, input);
    };

    const renderPart = (part: Part, index: number) => {
        switch (part.type) {
            case 'text':
                // Use smooth animation for assistant messages (both during and after streaming)
                if (!isUser) {
                    // Use part.id as stable key to prevent recreation
                    const partKey = part.id || `${message.info.id}-${index}`;
                    
                    // ANIMATION TOGGLE - set to false to disable animation for testing
                    const useAnimation = true;

                    // Use the memoized freshness check from component level
                    const shouldAnimate = shouldAnimateMessage && useAnimation;

                    return (
                        <div key={partKey} className="break-words">
                            {useAnimation ? (
                                <SmoothTextAnimation
                                    targetText={part.text || ''}
                                    messageId={message.info.id}
                                    shouldAnimate={shouldAnimate}
                                    speed={10}
                                    onContentChange={onContentChange}
                                    isUserScrolling={isUserScrolling}
                                    onAnimationStart={() => setIsAnimating(true)}
                                    onAnimationComplete={() => {
                                        setIsAnimating(false);
                                        onAnimationComplete?.();
                                    }}
                                    markdownComponents={{
                                    h1: ({ children }: any) => <h1 className="mt-4 mb-2" style={{ ...typography.markdown.h1, color: 'var(--markdown-heading1)' }}>{children}</h1>,
                                    h2: ({ children }: any) => <h2 className="mt-3 mb-2" style={{ ...typography.markdown.h2, color: 'var(--markdown-heading2)' }}>{children}</h2>,
                                    h3: ({ children }: any) => <h3 className="mt-2 mb-1" style={{ ...typography.markdown.h3, color: 'var(--markdown-heading3)' }}>{children}</h3>,
                                    h4: ({ children }: any) => <h4 className="mt-2 mb-1" style={{ ...typography.markdown.h4, color: 'var(--markdown-heading4, var(--foreground))' }}>{children}</h4>,
                                    p: ({ children }: any) => <p className="mb-2" style={typography.markdown.body}>{children}</p>,
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
                                                     <div className="relative group my-0">
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
                                                          <div className="overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full p-3">
                                                             <SyntaxHighlighter
                                                                 style={syntaxTheme}
                                                                 language={match[1]}
                                                                 PreTag="div"
                                                                      customStyle={{
                                                                      margin: 0,
                                                                      padding: 0,
                                                                      ...typography.markdown.codeBlock,
                                                                      background: 'var(--syntax-background)',
                                                                      borderRadius: 0,
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
                                                 <code {...props} className={cn('px-0.5 font-mono font-medium', className)} style={{
                                                     ...typography.markdown.code,
                                                     color: 'var(--markdown-inline-code)',
                                                     backgroundColor: 'var(--markdown-inline-code-bg)'
                                                 }}>
                                                     {children}
                                                 </code>
                                             );
                                         }
                                }}
                            />
                            ) : (
                                // Direct markdown rendering without animation - for testing
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                        h1: ({ children }: any) => <h1 className="mt-4 mb-2" style={{ ...typography.markdown.h1, color: 'var(--markdown-heading1)' }}>{children}</h1>,
                                        h2: ({ children }: any) => <h2 className="mt-3 mb-2" style={{ ...typography.markdown.h2, color: 'var(--markdown-heading2)' }}>{children}</h2>,
                                        h3: ({ children }: any) => <h3 className="mt-2 mb-1" style={{ ...typography.markdown.h3, color: 'var(--markdown-heading3)' }}>{children}</h3>,
                                        h4: ({ children }: any) => <h4 className="mt-2 mb-1" style={{ ...typography.markdown.h4, color: 'var(--markdown-heading4, var(--foreground))' }}>{children}</h4>,
                                        p: ({ children }: any) => <p className="mb-2" style={typography.markdown.body}>{children}</p>,
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

                                             if (inline) {
                                                 return (
                                                     <code {...props} style={{
                                                         ...typography.markdown.code,
                                                         color: 'var(--markdown-inline-code)',
                                                         backgroundColor: 'var(--markdown-inline-code-bg)'
                                                     }}>
                                                         {children}
                                                     </code>
                                                 );
                                             }

                                             const match = /language-(\w+)/.exec(className || '');
                                             const code = String(children).replace(/\n$/, '');

                                             if (match) {
                                                 const language = match[1];
                                                 return (
                                                     <div className="relative group mb-4">
                                                         <div className="flex items-center justify-between rounded-t-lg px-4 py-2 border-b dark:border-white/[0.06] border-black/[0.08]" style={{ backgroundColor: 'var(--markdown-code-header-bg)' }}>
                                                             <span className="typography-meta font-medium" style={{ color: 'var(--markdown-code-header-text)' }}>
                                                                 {language}
                                                             </span>
                                                             <div className="flex items-center gap-1">
                                                                 <Button
                                                                     size="sm"
                                                                     variant="ghost"
                                                                     className="h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                     onClick={() => {
                                                                         const newWindow = window.open('', '_blank');
                                                                         if (newWindow) {
                                                                             newWindow.document.write(`<pre><code>${code}</code></pre>`);
                                                                             newWindow.document.close();
                                                                         }
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
                                                         </div>
                                                         <div className="overflow-x-auto rounded-b-lg border-l border-r border-b dark:border-white/[0.06] border-black/[0.08] max-w-full">
                                                             <SyntaxHighlighter
                                                                 style={syntaxTheme}
                                                                 language={match[1]}
                                                                 PreTag="div"
                                                                 customStyle={{
                                                                     margin: 0,
                                                                     padding: '0.75rem',
                                                                     ...typography.markdown.codeBlock,
                                                                     background: 'transparent',
                                                                     borderRadius: '0 0 0.5rem 0.5rem',
                                                                     overflowX: 'auto'
                                                                 }}
                                                             >
                                                                 {code}
                                                             </SyntaxHighlighter>
                                                         </div>
                                                     </div>
                                                 );
                                             }

                                             // Fallback for code blocks without language
                                             return (
                                                  <pre className="border dark:border-white/[0.06] border-black/[0.08] rounded-lg p-3" style={{
                                                      margin: '0.5rem 0',
                                                      padding: '0 !important',
                                                     ...typography.markdown.codeBlock,
                                                     background: 'var(--syntax-background)',
                                                     borderRadius: '0.375rem',
                                                     overflow: 'auto'
                                                 }}>
                                                     <code {...props} className={className}>
                                                         {code}
                                                     </code>
                                                 </pre>
                                             );
                                         }
                                    }}
                                >
                                    {part.text || ''}
                                </ReactMarkdown>
                            )}
                        </div>
                    );
                }

                // For non-streaming messages, use regular ReactMarkdown
                return (
                    <div key={index} className="break-words">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                                h1: ({ children }: any) => <h1 className="mt-4 mb-2" style={{ ...typography.markdown.h1, color: 'var(--markdown-heading1)' }}>{children}</h1>,
                                h2: ({ children }: any) => <h2 className="mt-3 mb-2" style={{ ...typography.markdown.h2, color: 'var(--markdown-heading2)' }}>{children}</h2>,
                                h3: ({ children }: any) => <h3 className="mt-2 mb-1" style={{ ...typography.markdown.h3, color: 'var(--markdown-heading3)' }}>{children}</h3>,
                                h4: ({ children }: any) => <h4 className="mt-2 mb-1" style={{ ...typography.markdown.h4, color: 'var(--markdown-heading4, var(--foreground))' }}>{children}</h4>,
                                p: ({ children }: any) => <p className="mb-2" style={typography.markdown.body}>{children}</p>,
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
                                             <div className="relative group my-0">
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
                                                  <div className="overflow-x-auto rounded-lg border dark:border-white/[0.06] border-black/[0.08] max-w-full p-3">
                                                     <SyntaxHighlighter
                                                         style={syntaxTheme}
                                                         language={match[1]}
                                                         PreTag="div"
                                                          customStyle={{
                                                              margin: 0,
                                                              padding: 0,
                                                              ...typography.markdown.codeBlock,
                                                              background: 'var(--syntax-background)',
                                                              borderRadius: 0,
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
                                         <code {...props} style={{
                                             ...typography.markdown.code,
                                             color: 'var(--markdown-inline-code)',
                                             backgroundColor: 'var(--markdown-inline-code-bg)'
                                         }}>
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
                    <div key={index} className="typography-meta text-muted-foreground/50 italic border-l-2 border-muted/30 pl-3 my-1 font-light">
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
                                {getToolIcon(toolPart.tool)}
                                <span className="typography-meta font-bold text-foreground flex-shrink-0">
                                    {getToolMetadata(toolPart.tool).displayName}
                                </span>

                                {/* Show description in collapsed state */}
                                <span className="typography-meta text-muted-foreground/60 truncate font-normal">
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
                                        <span className="typography-meta text-muted-foreground">
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
                                {/* Special handling for todo tools - show formatted output only */}
                                {(toolPart.tool === 'todowrite' || toolPart.tool === 'todoread') ? (
                                    state.status === 'completed' && 'output' in state && state.output ? (
                                        renderTodoOutput(state.output) || (
                                            // Fallback if parsing fails
                                            <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 text-muted-foreground">
                                                Unable to parse todo list
                                            </div>
                                        )
                                    ) : state.status === 'error' && 'error' in state ? (
                                        <div>
                                            <div className="typography-meta font-medium text-muted-foreground mb-1">Error:</div>
                                            <div className="typography-meta p-2 rounded border" style={{
                                                backgroundColor: 'var(--status-error-background)',
                                                color: 'var(--status-error)',
                                                borderColor: 'var(--status-error-border)'
                                            }}>
                                                {state.error}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="typography-meta text-muted-foreground">
                                            Processing todo list...
                                        </div>
                                    )
                                ) : (
                                    <>
                                        {/* Command/Input - not shown for todo tools */}
                                        {'input' in state && state.input && Object.keys(state.input).length > 0 && (
                                            <div>
                                                <div className="typography-meta font-medium text-muted-foreground mb-1">
                                                    {state.input.command ? 'Command:' : 'Input:'}
                                                </div>
                                                {state.input.command && toolPart.tool === 'bash' ? (
                                                    <div className="typography-meta bg-muted/30 rounded border border-border/20 overflow-hidden">
                                                        <SyntaxHighlighter
                                                            style={syntaxTheme}
                                                            language="bash"
                                                            PreTag="div"
                                                            customStyle={{
                                                                ...toolDisplayStyles.getCollapsedStyles(),
                                                                fontSize: 'inherit', // Inherit from parent typography-meta
                                                            }}
                                                            wrapLongLines={true}
                                                        >
                                                            {formatInputForDisplay(state.input, toolPart.tool)}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                ) : toolPart.tool === 'write' && state.input.content ? (
                                                    <div className="typography-meta bg-muted/30 rounded border border-border/20 overflow-hidden">
                                                        <SyntaxHighlighter
                                                            style={syntaxTheme}
                                                            language={getLanguageFromExtension(state.input.filePath || state.input.file_path || '') || 'text'}
                                                            PreTag="div"
                                                            customStyle={{
                                                                ...toolDisplayStyles.getCollapsedStyles(),
                                                                fontSize: 'inherit', // Inherit from parent typography-meta
                                                            }}
                                                            wrapLongLines={true}
                                                        >
                                                            {state.input.content}
                                                        </SyntaxHighlighter>
                                                    </div>
                                                ) : (
                                                    <pre className="typography-meta bg-muted/50 px-2 py-1 rounded font-mono whitespace-pre-wrap break-words text-foreground/90">
                                                        {formatInputForDisplay(state.input, toolPart.tool)}
                                                    </pre>
                                                )}
                                            </div>
                                        )}

                                        {/* Output or Error */}
                                        {state.status === 'completed' && 'output' in state && (
                                            <div>
                                                <div className="typography-meta font-medium text-muted-foreground mb-1">Output:</div>
                                                {/* Special rendering for todo tools */}
                                                {(toolPart.tool === 'todowrite' || toolPart.tool === 'todoread') && state.output ? (
                                                    renderTodoOutput(state.output) || (
                                                        // Fallback to default rendering if parsing fails
                                                        <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                                                            <SyntaxHighlighter
                                                                style={syntaxTheme}
                                                                language="json"
                                                                PreTag="div"
                                                                customStyle={{
                                                                    ...toolDisplayStyles.getCollapsedStyles(),
                                                                    padding: 0,
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
                                                    )
                                                ) : toolPart.tool === 'list' && state.output ? (
                                                    renderListOutput(state.output) || (
                                                        <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                            {state.output}
                                                        </pre>
                                                    )
                                                ) : toolPart.tool === 'grep' && state.output ? (
                                                    renderGrepOutput(state.output) || (
                                                        <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                            {state.output}
                                                        </pre>
                                                    )
                                                ) : toolPart.tool === 'glob' && state.output ? (
                                                    renderGlobOutput(state.output) || (
                                                        <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                            {state.output}
                                                        </pre>
                                                    )
                                                ) : toolPart.tool === 'task' && state.output ? (
                                                    <div className="typography-meta prose prose-sm dark:prose-invert max-w-none p-3 bg-muted/20 rounded border border-border/20">
                                                        <ReactMarkdown
                                                            remarkPlugins={[remarkGfm]}
                                                            components={{
                                                                h1: ({ children }: any) => <h1 className="typography-markdown font-bold mt-3 mb-2" style={{ color: 'var(--foreground)' }}>{children}</h1>,
                                                                h2: ({ children }: any) => <h2 className="typography-markdown font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h2>,
                                                                h3: ({ children }: any) => <h3 className="typography-ui-label font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h3>,
                                                                p: ({ children }: any) => <p className="typography-meta mb-2 leading-relaxed">{children}</p>,
                                                                ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-0.5 typography-meta">{children}</ul>,
                                                                ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 typography-meta">{children}</ol>,
                                                                li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
                                                                code: ({ className, children }: any) => {
                                                                    const match = /language-(\w+)/.exec(className || '');
                                                                    return match ? (
                                                                        <SyntaxHighlighter
                                                                            style={syntaxTheme}
                                                             language={match ? match[1] : 'text'}
                                                                            PreTag="div"
                                                                            customStyle={{
                                                                                fontSize: 'var(--code-block-font-size, 0.6875rem)',
                                                                                lineHeight: 'var(--code-block-line-height, 1.35)',
                                                                                marginTop: '0.5rem',
                                                                                marginBottom: '0.5rem'
                                                                            }}
                                                                        >
                                                                            {String(children).replace(/\n$/, '')}
                                                                        </SyntaxHighlighter>
                                                                    ) : (
                                                                        <code className="px-1 py-0.5 rounded typography-meta" style={{
                                                                            backgroundColor: 'var(--muted)',
                                                                            color: 'var(--foreground)'
                                                                        }}>
                                                                            {children}
                                                                        </code>
                                                                    );
                                                                },
                                                                blockquote: ({ children }: any) => (
                                                                    <blockquote className="border-l-2 pl-3 my-2 typography-meta" style={{
                                                                        borderColor: 'var(--primary)',
                                                                        color: 'var(--muted-foreground)'
                                                                    }}>
                                                                        {children}
                                                                    </blockquote>
                                                                ),
                                                                a: ({ children, href }: any) => (
                                                                    <a href={href} className="underline typography-meta" style={{ color: 'var(--primary)' }} target="_blank" rel="noopener noreferrer">
                                                                        {children}
                                                                    </a>
                                                                )
                                                            }}
                                                        >
                                                            {state.output}
                                                        </ReactMarkdown>
                                                    </div>
                                                ) : (toolPart.tool === 'web-search' || toolPart.tool === 'websearch' || toolPart.tool === 'search_web') && state.output ? (
                                                    renderWebSearchOutput(state.output) || (
                                                        <pre className="typography-meta bg-muted/30 p-2 rounded border border-border/20 font-mono whitespace-pre-wrap">
                                                            {state.output}
                                                        </pre>
                                                    )
                                                ) : (toolPart.tool === 'edit' || toolPart.tool === 'multiedit') && (state.output?.trim().length === 0 || hasLspDiagnostics(state.output)) && state.metadata?.diff ? (
                                                    // Custom line-by-line diff view for edit tools
                                                    <div className="typography-meta bg-muted/30 rounded border border-border/20 max-h-60 overflow-y-auto">
                                                        {parseDiffToLines(state.metadata.diff).map((hunk, hunkIdx) => (
                                                            <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                                                <div className="bg-muted/20 px-2 py-1 typography-meta font-medium text-muted-foreground border-b border-border/10">
                                                                    {hunk.file} (line {hunk.oldStart})
                                                                </div>
                                                                <div>
                                                                    {(hunk.lines as any[]).map((line: any, lineIdx: number) => (
                                                                        <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                                            {/* Left side - Old file */}
                                                                            <div
                                                                                className={cn(
                                                                                    "typography-meta font-mono leading-tight px-2 py-0.5 overflow-hidden",
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
                                                                                    "typography-meta font-mono leading-tight px-2 py-0.5 overflow-hidden",
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
                                                    <div className="typography-meta bg-muted/30 p-2 rounded border border-border/20 max-h-40 overflow-auto">
                                                        <SyntaxHighlighter
                                                            style={syntaxTheme}
                                                            language={detectLanguageFromOutput(formatEditOutput(state.output, toolPart.tool, state.metadata), toolPart.tool, state.input)}
                                                            PreTag="div"
                                                            customStyle={{
                                                                ...toolDisplayStyles.getCollapsedStyles(),
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
                                                    <div className="typography-meta bg-muted/30 p-3 rounded border border-border/20 text-muted-foreground/70">
                                                        No output produced
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {state.status === 'error' && 'error' in state && (
                                            <div>
                                                <div className="typography-meta font-medium text-muted-foreground mb-1">Error:</div>
                                                <div className="typography-meta p-2 rounded border" style={{
                                                    backgroundColor: 'var(--status-error-background)',
                                                    color: 'var(--status-error)',
                                                    borderColor: 'var(--status-error-border)'
                                                }}>
                                                    {state.error}
                                                </div>
                                            </div>
                                        )}
                                    </>
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
            <div className="group px-4 py-2">
                <div className="max-w-3xl mx-auto flex gap-4" style={{ alignItems: 'flex-start' }}>
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

                    <div className="flex-1 min-w-0 overflow-hidden" style={{
                        width: '100%',
                        minHeight: '2rem',
                        // Additional stability
                        contain: 'layout',
                        transform: 'translateZ(0)'
                    }}>
                        <div className="flex items-start gap-2 mb-1">
                            <h3 className={cn(
                                "font-bold typography-markdown tracking-tight leading-none",
                                isUser ? "text-primary" : "text-foreground"
                            )}>
                                {isUser ? 'You' : 'Assistant'}
                            </h3>
                            {!isUser && agentName && (
                                <div className={cn(
                                    "flex items-center gap-1 px-1.5 py-0 rounded",
                                    "agent-badge typography-meta",
                                    getAgentColor(agentName).class
                                )}>
                                    <Sparkles className="h-2.5 w-2.5" />
                                    <span className="font-medium">{agentName}</span>
                                </div>
                            )}
                        </div>
                        <div className="leading-normal overflow-hidden text-foreground/90">
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
                        <DialogTitle className="flex items-center gap-2 text-foreground typography-ui-label">
                            {popupContent.metadata?.tool ? getToolIcon(popupContent.metadata.tool, 'default') : <Wrench className="h-3.5 w-3.5 text-foreground" />}
                            <span className="truncate">{popupContent.title}</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex-1 overflow-auto rounded-lg border border-border/30 bg-muted/10">
                        {/* Show tool-specific input information - except for todo tools */}
                        {popupContent.metadata?.input && Object.keys(popupContent.metadata.input).length > 0 &&
                            popupContent.metadata?.tool !== 'todowrite' && popupContent.metadata?.tool !== 'todoread' && (
                                <div className="border-b border-border/20 p-3">
                                    <div className="typography-meta font-medium text-muted-foreground mb-2">
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
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines={true}
                                            >
                                                {popupContent.metadata.input.command}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : popupContent.metadata.tool === 'task' && popupContent.metadata.input.prompt ? (
                                        <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={toolDisplayStyles.getPopupStyles()}>
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
                                                customStyle={toolDisplayStyles.getPopupStyles()}
                                                wrapLongLines={true}
                                            >
                                                {popupContent.metadata.input.content}
                                            </SyntaxHighlighter>
                                        </div>
                                    ) : (
                                        <pre className="bg-muted/30 p-3 rounded border border-border/20 font-mono whitespace-pre-wrap text-foreground/90" style={toolDisplayStyles.getPopupStyles()}>
                                            {formatInputForDisplay(popupContent.metadata.input, popupContent.metadata.tool)}
                                        </pre>
                                    )}
                                </div>
                            )}

                        {popupContent.isDiff && popupContent.diffHunks ? (
                            // Render diff view
                            <div className="typography-meta">
                                {popupContent.diffHunks.map((hunk, hunkIdx) => (
                                    <div key={hunkIdx} className="border-b border-border/20 last:border-b-0">
                                        <div className="bg-muted/20 px-3 py-2 typography-meta font-medium text-muted-foreground border-b border-border/10 sticky top-0 z-10">
                                            {hunk.file} (line {hunk.oldStart})
                                        </div>
                                        <div>
                                            {hunk.lines.map((line: any, lineIdx: number) => (
                                                <div key={lineIdx} className="grid grid-cols-2 divide-x divide-border/20">
                                                    {/* Left side - Old file */}
                                                    <div
                                                        className={cn(
                                                            "typography-meta font-mono px-3 py-0.5 overflow-hidden",
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
                                                            "typography-meta font-mono px-3 py-0.5 overflow-hidden",
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
                            // Special rendering for various tools in popup
                            <div className="p-4">
                                {(() => {
                                    const tool = popupContent.metadata?.tool;

                                    // Todo tools
                                    if (tool === 'todowrite' || tool === 'todoread') {
                                        return renderTodoOutput(popupContent.content) || (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="json"
                                                PreTag="div"
                                                wrapLongLines={true}
                                                customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                                codeTagProps={{
                                                    style: {
                                                        background: 'transparent !important'
                                                    }
                                                }}
                                            >
                                                {popupContent.content}
                                            </SyntaxHighlighter>
                                        );
                                    }

                                    // List tool
                                    if (tool === 'list') {
                                        return renderListOutput(popupContent.content) || (
                                            <pre className="font-mono typography-meta whitespace-pre-wrap">
                                                {popupContent.content}
                                            </pre>
                                        );
                                    }

                                    // Grep tool
                                    if (tool === 'grep') {
                                        return renderGrepOutput(popupContent.content) || (
                                            <pre className="font-mono typography-meta whitespace-pre-wrap">
                                                {popupContent.content}
                                            </pre>
                                        );
                                    }

                                    // Glob tool
                                    if (tool === 'glob') {
                                        return renderGlobOutput(popupContent.content) || (
                                            <pre className="font-mono typography-meta whitespace-pre-wrap">
                                                {popupContent.content}
                                            </pre>
                                        );
                                    }

                                    // Task tool - render as markdown
                                    if (tool === 'task') {
                                        return (
                                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        h1: ({ children }: any) => <h1 className="typography-ui-header font-bold mt-4 mb-3" style={{ color: 'var(--foreground)' }}>{children}</h1>,
                                                        h2: ({ children }: any) => <h2 className="typography-markdown font-semibold mt-3 mb-2" style={{ color: 'var(--foreground)' }}>{children}</h2>,
                                                        h3: ({ children }: any) => <h3 className="typography-markdown font-semibold mt-2 mb-1" style={{ color: 'var(--foreground)' }}>{children}</h3>,
                                                        p: ({ children }: any) => <p className="typography-ui-label mb-2 leading-relaxed">{children}</p>,
                                                        ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-1 typography-ui-label">{children}</ul>,
                                                        ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-1 typography-ui-label">{children}</ol>,
                                                        li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
                                                        code: ({ className, children }: any) => {
                                                            const match = /language-(\w+)/.exec(className || '');
                                                            return match ? (
                                                                <SyntaxHighlighter
                                                                    style={syntaxTheme}
                                                                    language={match[1]}
                                                                    PreTag="div"
                                                                    customStyle={{
                                                                        fontSize: 'var(--markdown-code-block-font-size, 0.6875rem)',
                                                                        lineHeight: 'var(--markdown-code-block-line-height, 1.35)',
                                                                        marginTop: '0.5rem',
                                                                        marginBottom: '0.5rem'
                                                                    }}
                                                                >
                                                                    {String(children).replace(/\n$/, '')}
                                                                </SyntaxHighlighter>
                                                            ) : (
                                                                <code className="px-1 py-0.5 rounded typography-ui-label" style={{
                                                                    backgroundColor: 'var(--muted)',
                                                                    color: 'var(--foreground)'
                                                                }}>
                                                                    {children}
                                                                </code>
                                                            );
                                                        },
                                                        blockquote: ({ children }: any) => (
                                                            <blockquote className="border-l-2 pl-3 my-2 typography-ui-label" style={{
                                                                borderColor: 'var(--primary)',
                                                                color: 'var(--muted-foreground)'
                                                            }}>
                                                                {children}
                                                            </blockquote>
                                                        ),
                                                        a: ({ children, href }: any) => (
                                                            <a href={href} className="underline typography-ui-label" style={{ color: 'var(--primary)' }} target="_blank" rel="noopener noreferrer">
                                                                {children}
                                                            </a>
                                                        )
                                                    }}
                                                >
                                                    {popupContent.content}
                                                </ReactMarkdown>
                                            </div>
                                        );
                                    }

                                    // Web search tool - render as markdown with syntax highlighting
                                    if (tool === 'web-search' || tool === 'websearch' || tool === 'search_web') {
                                        return renderWebSearchOutput(popupContent.content) || (
                                            <SyntaxHighlighter
                                                style={syntaxTheme}
                                                language="text"
                                                PreTag="div"
                                                wrapLongLines={true}
                                                customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                                codeTagProps={{
                                                    style: {
                                                        background: 'transparent !important'
                                                    }
                                                }}
                                            >
                                                {popupContent.content}
                                            </SyntaxHighlighter>
                                        );
                                    }

                                    // Default: syntax-highlighted code
                                    return (
                                        <SyntaxHighlighter
                                            style={syntaxTheme}
                                            language={popupContent.language || 'text'}
                                            PreTag="div"
                                            wrapLongLines={true}
                                            customStyle={toolDisplayStyles.getPopupContainerStyles()}
                                            codeTagProps={{
                                                style: {
                                                    background: 'transparent !important'
                                                }
                                            }}
                                        >
                                            {popupContent.content}
                                        </SyntaxHighlighter>
                                    );
                                })()}
                            </div>
                        ) : (
                            // No output message
                            <div className="p-8 text-muted-foreground typography-ui-label">
                                <div className="mb-2">Command completed successfully</div>
                                <div className="typography-meta">No output was produced</div>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
};
