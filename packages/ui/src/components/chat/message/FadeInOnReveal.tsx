import React from 'react';
import { cn } from '@/lib/utils';

interface FadeInOnRevealProps {
    children: React.ReactNode;
    className?: string;
    skipAnimation?: boolean;
}

const FADE_ANIMATION_ENABLED = true;

export const FadeInOnReveal: React.FC<FadeInOnRevealProps> = ({ children, className, skipAnimation }) => {
    const [visible, setVisible] = React.useState(skipAnimation ?? false);

    React.useEffect(() => {
        if (!FADE_ANIMATION_ENABLED || skipAnimation) {
            return;
        }

        let frame: number | null = null;

        const enable = () => setVisible(true);

        if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            frame = window.requestAnimationFrame(enable);
        } else {
            enable();
        }

        return () => {
            if (
                frame !== null &&
                typeof window !== 'undefined' &&
                typeof window.cancelAnimationFrame === 'function'
            ) {
                window.cancelAnimationFrame(frame);
            }
        };
    }, [skipAnimation]);

    if (!FADE_ANIMATION_ENABLED || skipAnimation) {
        return <>{children}</>;
    }

    return (
        <div
            className={cn(
                'w-full transition-all duration-300 ease-out',
                visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2',
                className
            )}
        >
            {children}
        </div>
    );
};

