import React from 'react';
import { RiPauseLine, RiPlayLine, RiCloseLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';

interface PausedSessionBannerProps {
    sessionId: string;
}

export const PausedSessionBanner: React.FC<PausedSessionBannerProps> = ({ sessionId }) => {
    const pausedSessionInfo = useSessionStore((state) => state.pausedSessions.get(sessionId));
    const resumeSession = useSessionStore((state) => state.resumeSession);
    const unpauseSession = useSessionStore((state) => state.unpauseSession);

    if (!pausedSessionInfo) {
        return null;
    }

    const { pausedAt, contextSummary } = pausedSessionInfo;

    // Format relative time
    const getRelativeTime = (timestamp: number): string => {
        const now = Date.now();
        const diffMs = now - timestamp;
        const diffSeconds = Math.floor(diffMs / 1000);
        const diffMinutes = Math.floor(diffSeconds / 60);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSeconds < 60) {
            return 'just now';
        } else if (diffMinutes < 60) {
            return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
        } else if (diffHours < 24) {
            return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
        } else {
            return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
        }
    };

    const relativeTime = getRelativeTime(pausedAt);

    const handleResume = () => {
        void resumeSession(sessionId);
    };

    const handleDismiss = () => {
        unpauseSession(sessionId);
    };

    return (
        <div className="chat-column mb-2">
            <div
                className={cn(
                    'flex items-center gap-3 px-4 py-3',
                    'rounded-xl border border-border',
                    'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
                )}
            >
                {/* Pause icon */}
                <div className="flex-shrink-0">
                    <RiPauseLine
                        className="h-5 w-5"
                        style={{ color: 'var(--status-warning)' }}
                        aria-hidden="true"
                    />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="typography-ui-label text-foreground">Session paused</span>
                        <span className="typography-meta text-muted-foreground">{relativeTime}</span>
                    </div>
                    {contextSummary && (
                        <div className="typography-meta text-muted-foreground truncate">
                            {contextSummary}
                        </div>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                        type="button"
                        onClick={handleResume}
                        className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5',
                            'rounded-lg',
                            'text-foreground hover:bg-interactive-hover',
                            'typography-ui-label',
                            'transition-colors'
                        )}
                        aria-label="Resume session"
                    >
                        <RiPlayLine className="h-4 w-4" aria-hidden="true" />
                        Resume
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className={cn(
                            'flex items-center justify-center h-8 w-8',
                            'rounded-lg',
                            'text-muted-foreground hover:bg-interactive-hover hover:text-foreground',
                            'transition-colors'
                        )}
                        aria-label="Dismiss"
                    >
                        <RiCloseLine className="h-4 w-4" aria-hidden="true" />
                    </button>
                </div>
            </div>
        </div>
    );
};
