import React from 'react';
import { Header, FixedSessionsButton } from './Header';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { SessionDialogs } from '@/components/session/SessionDialogs';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { DiffWorkerProvider } from '@/contexts/DiffWorkerProvider';

import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useDeviceInfo } from '@/lib/device';
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe';
import { cn } from '@/lib/utils';

import { ChatView, GitView, DiffView, TerminalView, SettingsView } from '@/components/views';

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        activeMainTab,
        setIsMobile,
        isSessionSwitcherOpen,
        setSessionSwitcherOpen,
        isSettingsDialogOpen,
        setSettingsDialogOpen,
    } = useUIStore();
    const { isMobile } = useDeviceInfo();
    const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return typeof window.opencodeDesktop !== 'undefined';
    });

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
    }, []);

    useEdgeSwipe({ enabled: true });

    // Trigger update check 3 seconds after mount (for both mobile and desktop)
    const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
    React.useEffect(() => {
        const timer = setTimeout(() => {
            checkForUpdates();
        }, 3000);
        return () => clearTimeout(timer);
    }, [checkForUpdates]);

    React.useEffect(() => {
        const previous = useUIStore.getState().isMobile;
        if (previous !== isMobile) {
            setIsMobile(isMobile);
        }
    }, [isMobile, setIsMobile]);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        let timeoutId: number | undefined;

        const handleResize = () => {
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }

            timeoutId = window.setTimeout(() => {
                useUIStore.getState().updateProportionalSidebarWidths();
            }, 150);
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }
        };
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined' || typeof document === 'undefined') {
            return;
        }

        const root = document.documentElement;

        let stickyKeyboardInset = 0;
        let ignoreOpenUntilZero = false;
        let previousHeight = 0;

        const setKeyboardOpen = useUIStore.getState().setKeyboardOpen;

        const forceKeyboardClosed = () => {
            stickyKeyboardInset = 0;
            ignoreOpenUntilZero = true;
            root.style.setProperty('--oc-keyboard-inset', '0px');
            setKeyboardOpen(false);
        };

        const updateVisualViewport = () => {
            const viewport = window.visualViewport;

            const height = viewport ? Math.round(viewport.height) : window.innerHeight;
            const offsetTop = viewport ? Math.max(0, Math.round(viewport.offsetTop)) : 0;

            root.style.setProperty('--oc-visual-viewport-offset-top', `${offsetTop}px`);

            const active = document.activeElement as HTMLElement | null;
            const tagName = active?.tagName;
            const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            const isTextTarget = isInput || Boolean(active?.isContentEditable);

            const layoutHeight = Math.round(root.clientHeight || window.innerHeight);
            const viewportSum = height + offsetTop;
            const rawInset = Math.max(0, layoutHeight - viewportSum);

            // Keyboard heuristic:
            // - when an input is focused, smaller deltas can still be keyboard
            // - when not focused, treat only big deltas as keyboard (ignore toolbars)
            const openThreshold = isTextTarget ? 120 : 180;
            const measuredInset = rawInset >= openThreshold ? rawInset : 0;

            // Make the UI stable: treat keyboard inset as a step function.
            // - When opening: take the first big inset and hold it.
            // - When closing starts: immediately drop to 0 (even if keyboard animation continues).
            // Closing start signals:
            // - focus lost (handled via focusout)
            // - visual viewport height starts increasing while inset is non-zero
            if (ignoreOpenUntilZero) {
                if (measuredInset === 0) {
                    ignoreOpenUntilZero = false;
                }
                stickyKeyboardInset = 0;
            } else if (stickyKeyboardInset === 0) {
                if (measuredInset > 0 && isTextTarget) {
                    stickyKeyboardInset = measuredInset;
                }
            } else {
                // Only detect closing-by-height when focus is NOT on text input
                // (prevents false positives during Android keyboard animation)
                const closingByHeight = !isTextTarget && height > previousHeight + 6;

if (measuredInset === 0) {
                    stickyKeyboardInset = 0;
                    setKeyboardOpen(false);
                } else if (closingByHeight) {
                    forceKeyboardClosed();
                } else if (measuredInset > 0 && isTextTarget) {
                    // When focus is on text input, track actual inset (allows settling
                    // to correct value after Android animation fluctuations)
                    stickyKeyboardInset = measuredInset;
                    setKeyboardOpen(true);
                } else if (measuredInset > stickyKeyboardInset) {
                    stickyKeyboardInset = measuredInset;
                    setKeyboardOpen(true);
                }
            }

            root.style.setProperty('--oc-keyboard-inset', `${stickyKeyboardInset}px`);
            previousHeight = height;

            // Only force-scroll lock while an input is focused.
            if (isMobile && isTextTarget) {
                const scroller = document.scrollingElement;
                if (scroller && scroller.scrollTop !== 0) {
                    scroller.scrollTop = 0;
                }
                if (window.scrollY !== 0) {
                    window.scrollTo(0, 0);
                }
            }
        };

        updateVisualViewport();

        const viewport = window.visualViewport;
        viewport?.addEventListener('resize', updateVisualViewport);
        viewport?.addEventListener('scroll', updateVisualViewport);
        window.addEventListener('resize', updateVisualViewport);
        window.addEventListener('orientationchange', updateVisualViewport);
        // Reset ignoreOpenUntilZero when focus moves to a text input.
        // This allows keyboard detection to work when user taps input quickly
        // while keyboard is still closing (common on Android).
        const handleFocusIn = (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) {
                return;
            }
            const tagName = target.tagName;
            const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            if (isInput || target.isContentEditable) {
                ignoreOpenUntilZero = false;
            }
            updateVisualViewport();
        };
        document.addEventListener('focusin', handleFocusIn, true);

        const handleFocusOut = (event: FocusEvent) => {
            const target = event.target as HTMLElement | null;
            if (!target) {
                return;
            }

            const tagName = target.tagName;
            const isInput = tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
            if (isInput || target.isContentEditable) {
                // Check if focus is moving to another input - if so, don't close keyboard
                const related = event.relatedTarget as HTMLElement | null;
                const relatedTag = related?.tagName;
                const relatedIsInput = relatedTag === 'INPUT' || relatedTag === 'TEXTAREA' || relatedTag === 'SELECT' || related?.isContentEditable;
                if (relatedIsInput) {
                    return;
                }
                forceKeyboardClosed();
            }
        };

        document.addEventListener('focusout', handleFocusOut, true);

        return () => {
            viewport?.removeEventListener('resize', updateVisualViewport);
            viewport?.removeEventListener('scroll', updateVisualViewport);
            window.removeEventListener('resize', updateVisualViewport);
            window.removeEventListener('orientationchange', updateVisualViewport);
            document.removeEventListener('focusin', handleFocusIn, true);
            document.removeEventListener('focusout', handleFocusOut, true);
        };
    }, [isMobile]);

    const secondaryView = React.useMemo(() => {
        switch (activeMainTab) {
            case 'git':
                return <GitView />;
            case 'diff':
                return <DiffView />;
            case 'terminal':
                return <TerminalView />;
            default:
                return null;
        }
    }, [activeMainTab]);

    const isChatActive = activeMainTab === 'chat';
    const isSettingsActive = isSettingsDialogOpen && !isMobile;

    return (
        <DiffWorkerProvider>
            <div
                className={cn(
                    'main-content-safe-area h-[100dvh]',
                    isMobile ? 'flex flex-col' : 'flex',
                    isDesktopRuntime ? 'bg-transparent' : 'bg-background'
                )}
            >
                <CommandPalette />
                <HelpDialog />
                <SessionDialogs />

                {isMobile ? (
                <>
                    {/* Mobile: Header + content + settings overlay */}
                    {!isSettingsDialogOpen && <Header />}
                    <div
                        className={cn(
                            'flex flex-1 overflow-hidden bg-background',
                            isSettingsDialogOpen && 'hidden'
                        )}
                        style={{ paddingTop: 'var(--oc-header-height, 56px)' }}
                    >
                        <main className="flex-1 overflow-hidden bg-background relative">
                            <div className={cn('absolute inset-0', !isChatActive && 'invisible')}>
                                <ErrorBoundary><ChatView /></ErrorBoundary>
                            </div>
                            {secondaryView && (
                                <div className="absolute inset-0">
                                    <ErrorBoundary>{secondaryView}</ErrorBoundary>
                                </div>
                            )}
                        </main>
                    </div>

                    <MobileOverlayPanel
                        open={isSessionSwitcherOpen}
                        onClose={() => setSessionSwitcherOpen(false)}
                        title="Sessions"
                    >
                        <SessionSidebar mobileVariant />
                    </MobileOverlayPanel>

                    {/* Mobile settings: full screen */}
                    {isSettingsDialogOpen && (
                        <div className="absolute inset-0 z-10 bg-background header-safe-area">
                            <ErrorBoundary><SettingsView onClose={() => setSettingsDialogOpen(false)} /></ErrorBoundary>
                        </div>
                    )}
                </>
            ) : (
                <>
                    {!isSettingsActive && (
                        <Sidebar isOpen={isSidebarOpen} isMobile={isMobile}>
                            <SessionSidebar />
                        </Sidebar>
                    )}

                    {/* Main content area */}
                    <div className="flex flex-1 flex-col overflow-hidden relative">
                        {/* Normal view: Header + content */}
                        <div className={cn('absolute inset-0 flex flex-col', isSettingsActive && 'invisible')}>
                            <Header />
                            <div className="flex flex-1 overflow-hidden bg-background">
                                <main className="flex-1 overflow-hidden bg-background relative">
                                    <div className={cn('absolute inset-0', !isChatActive && 'invisible')}>
                                        <ErrorBoundary><ChatView /></ErrorBoundary>
                                    </div>
                                    {secondaryView && (
                                        <div className="absolute inset-0">
                                            <ErrorBoundary>{secondaryView}</ErrorBoundary>
                                        </div>
                                    )}
                                </main>
                            </div>
                        </div>
                    </div>

                    {/* Settings view: full screen overlay */}
                    {isSettingsActive && (
                        <div className={cn('absolute inset-0 z-10', isDesktopRuntime ? 'bg-transparent' : 'bg-background')}>
                            <ErrorBoundary><SettingsView onClose={() => setSettingsDialogOpen(false)} /></ErrorBoundary>
                        </div>
                    )}
                </>
            )}

            {/* Hide fixed sessions button when settings is open */}
            {!isSettingsActive && <FixedSessionsButton />}
        </div>
    </DiffWorkerProvider>
    );
};
