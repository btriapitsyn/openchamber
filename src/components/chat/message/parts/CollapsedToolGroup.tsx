import React from 'react';
import { CaretDown as ChevronDown, CaretRight as ChevronRight, Brain, CircleNotch, CheckCircle } from '@phosphor-icons/react';

import { cn } from '@/lib/utils';
import { getToolMetadata } from '@/lib/toolHelpers';
import { getToolIcon } from './ToolPart';
import ToolPart from './ToolPart';
import ReasoningPart from './ReasoningPart';
import type { ToolPart as ToolPartType } from '@/types/tool';
import type { ToolPopupContent } from '../types';
import type { GroupablePart, GroupStatus } from '../toolGrouping';

interface CollapsedToolGroupProps {
    groupId: string;
    parts: GroupablePart[];
    status: GroupStatus;
    isExpanded: boolean;
    onToggle: (groupId: string) => void;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    onContentChange?: () => void;
    toolConnections?: Record<string, { hasPrev: boolean; hasNext: boolean }>;
}

const statusLabel: Record<GroupStatus, string> = {
    working: 'Working…',
    finished: 'Finished working',
};

const CollapsedToolGroup: React.FC<CollapsedToolGroupProps> = ({
    groupId,
    parts,
    status,
    isExpanded,
    onToggle,
    expandedTools,
    onToggleTool,
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    onShowPopup,
    onContentChange,
    toolConnections,
}) => {
    const toggleEnabled = status === 'finished';
    const handleToggle = React.useCallback(() => {
        if (!toggleEnabled) return;
        onToggle(groupId);
    }, [toggleEnabled, onToggle, groupId]);

    const { icons, summary } = React.useMemo(() => {
        const seen = new Set<string>();
        const names: string[] = [];
        const collected = parts.reduce<React.ReactNode[]>((acc, part) => {
            if (part.type === 'tool') {
                const toolName = (part as ToolPartType).tool;
                if (!seen.has(toolName)) {
                    seen.add(toolName);
                    names.push(getToolMetadata(toolName).displayName);
                    acc.push(
                        <span key={`${groupId}-tool-${toolName}`} className="text-muted-foreground">
                            {getToolIcon(toolName)}
                        </span>
                    );
                }
            } else if (part.type === 'reasoning') {
                if (!seen.has('reasoning')) {
                    seen.add('reasoning');
                    names.push('Reasoning');
                    acc.push(
                        <span key={`${groupId}-reasoning`} className="text-muted-foreground">
                            <Brain className="h-3.5 w-3.5 flex-shrink-0" />
                        </span>
                    );
                }
            }
            return acc;
        }, []);
        return {
            icons: collected,
            summary: names.length > 0 ? names.join(', ') : 'no tools',
        };
    }, [parts, groupId]);

    const expandedContentId = `${groupId}-content`;

    return (
        <div className="my-1">
            <button
                type="button"
                className={cn(
                    'group/tool flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors disabled:opacity-100 disabled:text-foreground',
                    toggleEnabled ? 'cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring' : 'cursor-default'
                )}
                onClick={handleToggle}
                disabled={!toggleEnabled}
                aria-expanded={isExpanded}
                aria-controls={expandedContentId}
                aria-label={`${statusLabel[status]} — ${summary}`}
            >
                <div className="flex items-center gap-2">
                    <div className="relative h-3.5 w-3.5 flex-shrink-0 text-muted-foreground">
                        <div
                            className={cn(
                                'absolute inset-0 flex items-center justify-center transition-opacity',
                                toggleEnabled && isExpanded && 'opacity-0',
                                toggleEnabled && !isExpanded && !isMobile && 'group-hover/tool:opacity-0'
                            )}
                        >
                            {status === 'working' ? (
                                <CircleNotch className="h-3 w-3 animate-spin" weight="bold" />
                            ) : (
                                <CheckCircle className="h-3.5 w-3.5" weight="fill" />
                            )}
                        </div>
                        {toggleEnabled && (
                            <div
                                className={cn(
                                    'absolute inset-0 flex items-center justify-center transition-opacity text-muted-foreground',
                                    isExpanded ? 'opacity-100' : 'opacity-0',
                                    !isExpanded && !isMobile && 'group-hover/tool:opacity-100'
                                )}
                            >
                                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </div>
                        )}
                    </div>
                    <span className="typography-meta font-medium text-foreground">
                        {statusLabel[status]}
                    </span>
                </div>

                <div className="ml-2 flex items-center gap-1.5 text-muted-foreground/80">
                    {toggleEnabled && icons.length > 0 && (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                            {icons}
                        </div>
                    )}
                </div>
            </button>

            <div id={expandedContentId} className={cn(isExpanded ? 'mt-1.5' : 'hidden')}>
                {isExpanded && (
                    <div className="space-y-1.5">
                        {parts.map((part, index) => {
                        const isTool = part.type === 'tool';
                        const toolPart = isTool ? (part as ToolPartType) : null;

                        const connection = isTool && toolPart ? toolConnections?.[toolPart.id] : undefined;
                        const hasPrevTool = isTool
                            ? connection?.hasPrev ?? parts.slice(0, index).some((p) => p.type === 'tool')
                            : false;
                        const hasNextTool = isTool
                            ? connection?.hasNext ?? parts.slice(index + 1).some((p) => p.type === 'tool')
                            : false;

                        const hasNextPart = index < parts.length - 1;

                        const wrapperClasses = cn(
                            'relative',
                            hasNextPart && 'before:absolute before:left-[0.875rem] before:top-[1.72rem] before:h-[0.95rem] before:w-px before:bg-border/80 before:content-[""]'
                        );

                            return (
                                <div key={`group-${groupId}-part-${index}`} className={wrapperClasses}>
                                    {isTool && toolPart ? (
                                        <ToolPart
                                            part={toolPart}
                                            isExpanded={expandedTools.has(toolPart.id)}
                                            onToggle={onToggleTool}
                                            syntaxTheme={syntaxTheme}
                                            isMobile={isMobile}
                                            onShowPopup={onShowPopup}
                                            onContentChange={onContentChange}
                                            hasPrevTool={hasPrevTool}
                                            hasNextTool={hasNextTool}
                                        />
                                    ) : (
                                        <ReasoningPart
                                            part={part}
                                            onContentChange={onContentChange}
                                            isMobile={isMobile}
                                            onShowPopup={onShowPopup}
                                            syntaxTheme={syntaxTheme}
                                            copiedCode={copiedCode}
                                            onCopyCode={onCopyCode}
                                        />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(CollapsedToolGroup);
