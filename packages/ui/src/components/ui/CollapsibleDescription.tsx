import React from 'react';
import { RiArrowDownSLine, RiArrowUpSLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

interface CollapsibleDescriptionProps {
    description: string;
    className?: string;
    lineClamp?: number;
}

export const CollapsibleDescription: React.FC<CollapsibleDescriptionProps> = ({
    description,
    className,
    lineClamp = 2,
}) => {
    const [isExpanded, setIsExpanded] = React.useState(false);
    const [needsExpansion, setNeedsExpansion] = React.useState(false);
    const textRef = React.useRef<HTMLSpanElement>(null);

    React.useEffect(() => {
        if (textRef.current) {
            const lineHeight = parseInt(window.getComputedStyle(textRef.current).lineHeight, 10);
            const maxHeight = lineHeight * lineClamp;
            setNeedsExpansion(textRef.current.scrollHeight > maxHeight);
        }
    }, [lineClamp]);

    return (
        <div className="flex flex-col gap-1">
            <span
                ref={textRef}
                className={cn(
                    'typography-meta text-muted-foreground',
                    !isExpanded && 'line-clamp-2',
                    className
                )}
            >
                {description}
            </span>
            {needsExpansion && (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsExpanded(!isExpanded);
                    }}
                    className="flex items-center gap-1 text-muted-foreground hover:text-foreground typography-micro self-start"
                >
                    {isExpanded ? (
                        <>
                            <span>Show less</span>
                            <RiArrowUpSLine className="h-3 w-3" />
                        </>
                    ) : (
                        <>
                            <span>Show more</span>
                            <RiArrowDownSLine className="h-3 w-3" />
                        </>
                    )}
                </button>
            )}
        </div>
    );
};
