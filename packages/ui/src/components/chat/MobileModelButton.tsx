import React from 'react';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { getModelDisplayName } from './mobileControlsUtils';

interface MobileModelButtonProps {
    onOpenModel: () => void;
    className?: string;
}

export const MobileModelButton: React.FC<MobileModelButtonProps> = ({ onOpenModel, className }) => {
    const { currentModelId, getCurrentProvider } = useConfigStore();
    const currentProvider = getCurrentProvider();
    const modelLabel = getModelDisplayName(currentProvider, currentModelId);

    return (
        <button
            type="button"
            onClick={onOpenModel}
            className={cn(
                'inline-flex min-w-0 items-center justify-center',
                'rounded-lg border border-border/50 px-1.5',
                'typography-micro font-medium text-foreground/80',
                'focus:outline-none hover:bg-[var(--interactive-hover)]',
                className
            )}
            style={{ height: '26px', maxHeight: '26px', minHeight: '26px' }}
            title={modelLabel}
        >
            <span className="min-w-0 truncate">{modelLabel}</span>
        </button>
    );
};

export default MobileModelButton;
