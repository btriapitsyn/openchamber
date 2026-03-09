import React from 'react';
import { Text } from '@/components/ui/text';

interface MinDurationShineTextProps {
    active: boolean;
    minDurationMs?: number;
    className?: string;
    children: React.ReactNode;
    style?: React.CSSProperties;
    title?: string;
}

export const MinDurationShineText: React.FC<MinDurationShineTextProps> = ({
    active,
    minDurationMs = 300,
    className,
    children,
    style,
    title,
}) => {
    const [isShining, setIsShining] = React.useState(active);
    const shineStartedAtRef = React.useRef<number | null>(active ? Date.now() : null);
    const deactivateTimerRef = React.useRef<number | null>(null);

    const clearDeactivateTimer = React.useCallback(() => {
        if (deactivateTimerRef.current !== null) {
            window.clearTimeout(deactivateTimerRef.current);
            deactivateTimerRef.current = null;
        }
    }, []);

    React.useEffect(() => {
        return () => {
            clearDeactivateTimer();
        };
    }, [clearDeactivateTimer]);

    React.useEffect(() => {
        if (active) {
            clearDeactivateTimer();
            if (shineStartedAtRef.current === null) {
                shineStartedAtRef.current = Date.now();
            }
            if (!isShining) {
                setIsShining(true);
            }
            return;
        }

        if (!isShining) {
            shineStartedAtRef.current = null;
            return;
        }

        // Debounce brief inactive blips during rapid status transitions.
        const DEACTIVATE_GRACE_MS = 160;
        deactivateTimerRef.current = window.setTimeout(() => {
            const startedAt = shineStartedAtRef.current ?? Date.now();
            const elapsed = Date.now() - startedAt;
            const remaining = Math.max(0, minDurationMs - elapsed);

            if (remaining === 0) {
                setIsShining(false);
                shineStartedAtRef.current = null;
                clearDeactivateTimer();
                return;
            }

            deactivateTimerRef.current = window.setTimeout(() => {
                setIsShining(false);
                shineStartedAtRef.current = null;
                clearDeactivateTimer();
            }, remaining);
        }, DEACTIVATE_GRACE_MS);

        return () => {
            clearDeactivateTimer();
        };
    }, [active, clearDeactivateTimer, isShining, minDurationMs]);

    if (isShining) {
        return (
            <Text variant="shine" className={className} title={title}>
                {children}
            </Text>
        );
    }

    return (
        <span className={className} style={style} title={title}>
            {children}
        </span>
    );
};
