import React from 'react';
import type { Part } from '@opencode-ai/sdk';

import AssistantTextPart from './parts/AssistantTextPart';
import UserTextPart from './parts/UserTextPart';
import ReasoningPart from './parts/ReasoningPart';
import ToolPart from './parts/ToolPart';
import CollapsedToolGroup from './parts/CollapsedToolGroup';
import { MessageFilesDisplay } from '../FileAttachment';
import type { ToolPart as ToolPartType } from '@/types/tool';
import type { StreamPhase, ToolPopupContent } from './types';
import { cn } from '@/lib/utils';
import { isEmptyTextPart } from './partUtils';
import type { ExternalToolGroup, GroupablePart, GroupStatus, ToolGroupDescriptor } from './toolGrouping';

interface MessageBodyProps {
    messageId: string;
    parts: Part[];
    isUser: boolean;
    syntaxTheme: any;
    isMobile: boolean;
    copiedCode: string | null;
    onCopyCode: (code: string) => void;
    expandedTools: Set<string>;
    onToggleTool: (toolId: string) => void;
    onShowPopup: (content: ToolPopupContent) => void;
    streamPhase: StreamPhase;
    allowAnimation: boolean;
    onAssistantAnimationChunk: () => void;
    onAssistantAnimationComplete: () => void;
    onContentChange?: () => void;
    compactTopSpacing?: boolean;
    externalGroup?: ExternalToolGroup | null;
    hiddenPartIndices?: Set<number>;
}

type ProcessedItem =
    | { kind: 'group'; group: ToolGroupDescriptor }
    | { kind: 'part'; part: Part; index: number };

const MessageBody: React.FC<MessageBodyProps> = ({
    messageId,
    parts,
    isUser,
    syntaxTheme,
    isMobile,
    copiedCode,
    onCopyCode,
    expandedTools,
    onToggleTool,
    onShowPopup,
    streamPhase,
    allowAnimation,
    onAssistantAnimationChunk,
    onAssistantAnimationComplete,
    onContentChange,
    compactTopSpacing = false,
    externalGroup = null,
    hiddenPartIndices,
}) => {
    const [groupStates, setGroupStates] = React.useState<Record<string, boolean>>({});
    const previousGroupStatuses = React.useRef<Record<string, GroupStatus>>({});

    const effectiveParts = React.useMemo(() => {
        if (!hiddenPartIndices || hiddenPartIndices.size === 0) {
            return parts;
        }
        return parts.filter((_, index) => !hiddenPartIndices.has(index));
    }, [parts, hiddenPartIndices]);

    const hasActiveReasoning = React.useMemo(() => {
        return effectiveParts.some((part) => {
            if (part.type === 'reasoning') {
                const time = (part as any).time;
                return !time || typeof time.end === 'undefined';
            }
            return false;
        });
    }, [effectiveParts]);

    const processed = React.useMemo(() => {
        const items: ProcessedItem[] = [];
        const groups: ToolGroupDescriptor[] = [];
        let currentGroup: GroupablePart[] = [];
        let groupCounter = 0;

        const pushGroup = (status: GroupStatus) => {
            if (currentGroup.length === 0) return;
            const group: ToolGroupDescriptor = {
                id: `${messageId}-group-${groupCounter++}`,
                parts: currentGroup,
                status,
            };
            groups.push(group);
            items.push({ kind: 'group', group });
            currentGroup = [];
        };

        effectiveParts.forEach((part, index) => {
            if (isEmptyTextPart(part)) {
                return;
            }

            const isGroupable = !isUser && (part.type === 'tool' || part.type === 'reasoning');
            if (isGroupable) {
                currentGroup.push(part as GroupablePart);
                return;
            }

            if (currentGroup.length > 0) {
                pushGroup('finished');
            }

            items.push({ kind: 'part', part, index });
        });

        if (currentGroup.length > 0) {
            const status: GroupStatus = !isUser && streamPhase === 'streaming'
                ? 'working'
                : 'finished';
            pushGroup(status);
        }

        return { items, groups };
    }, [effectiveParts, isUser, messageId, streamPhase]);

    const externalGroupDescriptor = React.useMemo<ToolGroupDescriptor | null>(() => {
        if (!externalGroup || externalGroup.parts.length === 0) {
            return null;
        }
        return {
            id: externalGroup.groupId,
            parts: externalGroup.parts,
            status: externalGroup.status,
            external: true,
        };
    }, [externalGroup]);

    const processedItems = React.useMemo(() => {
        if (!externalGroupDescriptor) {
            return processed.items;
        }
        return [
            { kind: 'group', group: externalGroupDescriptor } as ProcessedItem,
            ...processed.items,
        ];
    }, [processed.items, externalGroupDescriptor]);

    const processedGroups = React.useMemo(() => {
        if (!externalGroupDescriptor) {
            return processed.groups;
        }
        return [externalGroupDescriptor, ...processed.groups];
    }, [processed.groups, externalGroupDescriptor]);

    React.useEffect(() => {
        if (isUser) {
            setGroupStates((prev) => {
                if (Object.keys(prev).length === 0) return prev;
                return {};
            });
            previousGroupStatuses.current = {};
            return;
        }

        const statusMap = processedGroups.reduce<Record<string, GroupStatus>>((acc, group) => {
            acc[group.id] = group.status;
            return acc;
        }, {});

        setGroupStates((prev) => {
            let changed = false;
            const next = { ...prev };

            processedGroups.forEach((group) => {
                const prevStatus = previousGroupStatuses.current[group.id];
                const prevExpanded = prev[group.id];

                if (group.status === 'working') {
                    if (prevExpanded !== true) {
                        next[group.id] = true;
                        changed = true;
                    }
                } else {
                    if (prevExpanded === undefined) {
                        next[group.id] = false;
                        changed = true;
                    } else if (prevStatus === 'working' && prevExpanded !== false) {
                        next[group.id] = false;
                        changed = true;
                    }
                }
            });

            Object.keys(next).forEach((key) => {
                if (!(key in statusMap)) {
                    delete next[key];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });

        previousGroupStatuses.current = statusMap;
    }, [isUser, processedGroups]);

    const handleGroupToggle = React.useCallback((groupId: string) => {
        setGroupStates((prev) => ({
            ...prev,
            [groupId]: !(prev[groupId] ?? false),
        }));
    }, []);

    const renderedParts = React.useMemo(() => {
        return processedItems.map((item, index) => {
            if (item.kind === 'group') {
                const group = item.group;
                const isExpanded = groupStates[group.id] ?? (group.status === 'working');

                return (
                    <CollapsedToolGroup
                        key={group.id}
                        groupId={group.id}
                        parts={group.parts}
                        status={group.status}
                        isExpanded={isExpanded}
                        onToggle={handleGroupToggle}
                        expandedTools={expandedTools}
                        onToggleTool={onToggleTool}
                        syntaxTheme={syntaxTheme}
                        isMobile={isMobile}
                        copiedCode={copiedCode}
                        onCopyCode={onCopyCode}
                        onShowPopup={onShowPopup}
                        onContentChange={onContentChange}
                    />
                );
            }

            const part = item.part;
            const originalIndex = item.index;

            switch (part.type) {
                case 'text':
                    if (isUser) {
                        return <UserTextPart key={`user-text-${originalIndex}`} part={part} messageId={messageId} />;
                    }
                    return (
                        <AssistantTextPart
                            key={`assistant-text-${originalIndex}`}
                            part={part}
                            messageId={messageId}
                            syntaxTheme={syntaxTheme}
                            isMobile={isMobile}
                            copiedCode={copiedCode}
                            onCopyCode={onCopyCode}
                            onShowPopup={onShowPopup}
                            streamPhase={streamPhase}
                            allowAnimation={allowAnimation}
                            onAnimationChunk={onAssistantAnimationChunk}
                            onAnimationComplete={onAssistantAnimationComplete}
                            hasActiveReasoning={hasActiveReasoning}
                            onContentChange={onContentChange}
                        />
                    );
                case 'reasoning':
                    return (
                        <ReasoningPart
                            key={`reasoning-${originalIndex}`}
                            part={part}
                            onContentChange={onContentChange}
                            isMobile={isMobile}
                            onShowPopup={onShowPopup}
                            syntaxTheme={syntaxTheme}
                            copiedCode={copiedCode}
                            onCopyCode={onCopyCode}
                        />
                    );
                case 'tool': {
                    const toolPart = part as ToolPartType;
                    return (
                        <ToolPart
                            key={`tool-${toolPart.id}`}
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
                default:
                    return null;
            }
        });
    }, [
        processedItems,
        groupStates,
        expandedTools,
        onToggleTool,
        syntaxTheme,
        isMobile,
        copiedCode,
        onCopyCode,
        onShowPopup,
        onContentChange,
        isUser,
        messageId,
        streamPhase,
        allowAnimation,
        onAssistantAnimationChunk,
        onAssistantAnimationComplete,
        hasActiveReasoning,
        handleGroupToggle,
        externalGroupDescriptor,
    ]);

    return (
        <div
            className={cn(
                'w-full overflow-hidden pl-3',
                compactTopSpacing && '-mt-1'
            )}
            style={{
                minHeight: '2rem',
                contain: 'layout',
                transform: 'translateZ(0)',
            }}
        >
            <div className="leading-normal overflow-hidden text-foreground/90">
                {renderedParts}
                <MessageFilesDisplay files={parts} />
            </div>
        </div>
    );
};

export default React.memo(MessageBody);
