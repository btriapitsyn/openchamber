import React from 'react';
import { RiSparkling2Fill } from '@remixicon/react';
import { cn } from '@/lib/utils';

export const GeneratingShimmer: React.FC = () => {
    return (
        <div className="w-full max-w-[85%] py-1">
            <style>
                {`
                @keyframes shimmer-slide {
                    0% { background-position: -200% 0; }
                    100% { background-position: 200% 0; }
                }
                .animate-shimmer-slide {
                    animation: shimmer-slide 2.5s linear infinite;
                    background-size: 200% 100%;
                    will-change: background-position;
                }
                `}
            </style>
            <div className="flex items-center gap-2 mb-3 text-[var(--chart-1)] font-medium text-sm">
                <RiSparkling2Fill className="h-4 w-4" />
                <span>Generating...</span>
            </div>
            <div className="space-y-3">
                {[100, 100, 90, 75].map((width, i) => (
                    <div
                        key={i}
                        className={cn(
                            "h-5 rounded-md animate-shimmer-slide",
                        )}
                        style={{
                            width: `${width}%`,
                            backgroundImage: `linear-gradient(to right,
                                color-mix(in srgb, var(--chart-1) 15%, transparent) 0%,
                                color-mix(in srgb, var(--chart-1) 40%, transparent) 50%,
                                color-mix(in srgb, var(--chart-1) 15%, transparent) 100%
                            )`
                        }}
                    />
                ))}
            </div>
        </div>
    );
};
