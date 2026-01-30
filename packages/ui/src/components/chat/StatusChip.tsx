import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useContextStore } from '@/stores/contextStore';
import { useIsTextTruncated } from '@/hooks/useIsTextTruncated';
import { formatEffortLabel, getAgentDisplayName, getModelDisplayName } from './mobileControlsUtils';

interface StatusChipProps {
    onClick: () => void;
    className?: string;
}

export const StatusChip: React.FC<StatusChipProps> = ({ onClick, className }) => {
    const {
        currentProviderId,
        currentModelId,
        currentVariant,
        currentAgentName,
        getCurrentProvider,
        getCurrentModelVariants,
        getVisibleAgents,
    } = useConfigStore();
    const currentSessionId = useSessionStore((state) => state.currentSessionId);
    const sessionAgentName = useContextStore((state) =>
        currentSessionId ? state.getSessionAgentSelection(currentSessionId) : null
    );

    const agents = getVisibleAgents();
    const uiAgentName = currentSessionId ? (sessionAgentName || currentAgentName) : currentAgentName;
    const agentLabel = getAgentDisplayName(agents, uiAgentName);
    const currentProvider = getCurrentProvider();
    const modelLabel = getModelDisplayName(currentProvider, currentModelId);
    const hasEffort = getCurrentModelVariants().length > 0;
    const effortLabel = hasEffort ? formatEffortLabel(currentVariant) : null;
    const segments = [agentLabel, modelLabel, effortLabel].filter((segment): segment is string => Boolean(segment));
    const label = segments.join(' · ');
    const textRef = React.useRef<HTMLSpanElement>(null);
    const isTruncated = useIsTextTruncated(textRef, [label, currentProviderId, currentModelId, currentVariant, uiAgentName]);

    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'group flex h-9 min-w-0 flex-1 items-center rounded-xl border border-border/40 bg-muted/30 px-2.5',
                'typography-meta font-medium text-foreground transition-colors hover:bg-muted/50',
                'focus:outline-none focus-visible:ring-1 focus-visible:ring-primary',
                className
            )}
            aria-label={label}
        >
            <span ref={textRef} className="min-w-0 flex-1 overflow-hidden">
                <span className={cn('marquee-text', isTruncated && 'marquee-text--auto')}>
                    {label}
                </span>
            </span>
        </button>
    );
};

export default StatusChip;
