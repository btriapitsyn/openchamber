import React from 'react';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useUIStore } from '@/stores/useUIStore';

export const SIDEBAR_CONTENT_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const MAC_TITLEBAR_SAFE_AREA = 40;

interface SidebarProps {
    isOpen: boolean;
    isMobile: boolean;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, isMobile, children }) => {
    const { sidebarWidth, setSidebarWidth } = useUIStore();
    const [isResizing, setIsResizing] = React.useState(false);
    const startXRef = React.useRef(0);
    const startWidthRef = React.useRef(sidebarWidth || SIDEBAR_CONTENT_WIDTH);

    const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
    });

    const isMacPlatform = React.useMemo(() => {
        if (typeof navigator === 'undefined') {
            return false;
        }
        return /Macintosh|Mac OS X/.test(navigator.userAgent || '');
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        const detected = typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
        setIsDesktopApp(detected);
    }, []);

    React.useEffect(() => {
        if (isMobile || !isResizing) {
            return;
        }

        const handlePointerMove = (event: PointerEvent) => {
            const delta = event.clientX - startXRef.current;
            const nextWidth = Math.min(
                SIDEBAR_MAX_WIDTH,
                Math.max(SIDEBAR_MIN_WIDTH, startWidthRef.current + delta)
            );
            setSidebarWidth(nextWidth);
        };

        const handlePointerUp = () => {
            setIsResizing(false);
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp, { once: true });

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
        };
    }, [isMobile, isResizing, setSidebarWidth]);

    React.useEffect(() => {
        if (isMobile && isResizing) {
            setIsResizing(false);
        }
    }, [isMobile, isResizing]);

    if (isMobile) {
        // Mobile sidebar is handled in MainLayout as part of the overlay
        return null;
    }

    const appliedWidth = isOpen ? Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth || SIDEBAR_CONTENT_WIDTH)
    ) : 0;
    const shouldRenderTitlebarSpacer = isDesktopApp && isMacPlatform;

    const handlePointerDown = (event: React.PointerEvent) => {
        if (!isOpen) {
            return;
        }
        setIsResizing(true);
        startXRef.current = event.clientX;
        startWidthRef.current = appliedWidth;
        event.preventDefault();
    };

    return (
        <aside
            className={cn(
                'relative flex h-full transition-all duration-300 ease-in-out overflow-hidden',
                shouldRenderTitlebarSpacer ? 'bg-transparent' : 'bg-sidebar',
                isResizing ? 'transition-none' : '',
                !shouldRenderTitlebarSpacer && 'border-r',
                !isOpen && 'border-r-0'
            )}
            data-vibrancy-surface={shouldRenderTitlebarSpacer ? 'sidebar' : undefined}
            style={{
                width: `${appliedWidth}px`,
                minWidth: `${appliedWidth}px`,
                maxWidth: `${appliedWidth}px`,
                pointerEvents: !isOpen ? 'none' : undefined,
            }}
            aria-hidden={!isOpen || appliedWidth === 0}
        >
            {!shouldRenderTitlebarSpacer && (
                <div
                    className="pointer-events-none absolute inset-0 z-0 bg-sidebar"
                    aria-hidden
                />
            )}
            {isOpen && (
                <div
                    className={cn(
                        'absolute right-0 top-0 z-20 h-full w-[6px] -mr-[3px] cursor-col-resize',
                        isResizing ? 'bg-primary/30' : 'bg-transparent hover:bg-primary/20'
                    )}
                    onPointerDown={handlePointerDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize left panel"
                />
            )}
            <div
                className={cn(
                    'relative z-10 flex h-full flex-col transition-opacity duration-200 ease-in-out',
                    !isOpen && 'pointer-events-none select-none opacity-0'
                )}
                style={{ width: `${appliedWidth}px` }}
                aria-hidden={!isOpen}
            >
                {shouldRenderTitlebarSpacer && (
                    <div
                        className="app-region-drag flex-shrink-0"
                        style={{ height: `${MAC_TITLEBAR_SAFE_AREA}px` }}
                        aria-hidden
                    />
                )}
                <div className="flex-1 overflow-hidden">
                    <ErrorBoundary>{children}</ErrorBoundary>
                </div>
            </div>
        </aside>
    );
};
