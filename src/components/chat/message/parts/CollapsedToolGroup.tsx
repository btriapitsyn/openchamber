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
                    'w-full flex items-center gap-2 rounded-md border border-border/40 bg-muted/30 px-3 py-2 text-left disabled:opacity-100',
                    toggleEnabled
                        ? 'cursor-pointer hover:bg-muted/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                        : 'cursor-default'
                )}
                onClick={handleToggle}
                disabled={!toggleEnabled}
                aria-expanded={isExpanded}
                aria-controls={expandedContentId}
                aria-label={`${statusLabel[status]} — ${summary}`}
            >
                <div className="flex items-center gap-1.5 text-muted-foreground">
                    <div className="flex h-3.5 w-3.5 items-center justify-center">
                        {status === 'working' ? (
                            <CircleNotch className="h-3 w-3 animate-spin" weight="bold" />
                        ) : (
                            <CheckCircle className="h-3.5 w-3.5" weight="fill" />
                        )}
                    </div>
                    <span className="typography-meta font-medium">
                        {statusLabel[status]}
                    </span>
                </div>

                <div className="ml-auto flex items-center gap-2 text-muted-foreground/80">
                    <div className="flex items-center gap-1.5">
                        {icons}
                    </div>
                    <div className="flex h-3.5 w-3.5 items-center justify-center text-muted-foreground">
                        {toggleEnabled ? (
                            isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5 opacity-40" />
                        )}
                    </div>
                </div>
            </button>

            <div id={expandedContentId} className={cn(isExpanded ? 'mt-1.5' : 'hidden')}>
                {isExpanded && (
                    <div className="space-y-1.5">
                        {parts.map((part, index) => {
                            if (part.type === 'tool') {
                                const toolPart = part as ToolPartType;
                                return (
                                    <ToolPart
                                        key={`group-${groupId}-tool-${toolPart.id}`}
                                        part={toolPart}
                                        isExpanded={expandedTools.has(toolPart.id)}
                                        onToggle={onToggleTool}
                                        syntaxTheme={syntaxTheme}
                                        isMobile={isMobile}
                                        onShowPopup={onShowPopup}
                                        onContentChange={onContentChange}
                                    />
                                );
                            }

                            return (
                                <ReasoningPart
                                    key={`group-${groupId}-reasoning-${index}`}
                                    part={part}
                                    onContentChange={onContentChange}
                                    isMobile={isMobile}
                                    onShowPopup={onShowPopup}
                                    syntaxTheme={syntaxTheme}
                                    copiedCode={copiedCode}
                                    onCopyCode={onCopyCode}
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default React.memo(CollapsedToolGroup);
