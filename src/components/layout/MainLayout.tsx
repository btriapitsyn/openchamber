import React from 'react';
import { Header, FixedSessionsButton } from './Header';
import { RightSidebar } from './RightSidebar';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { SessionSidebar } from '@/components/session/SessionSidebar';
import { SessionDialogs } from '@/components/session/SessionDialogs';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';

import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe';
import { cn } from '@/lib/utils';

import { GitTab } from '../right-sidebar/GitTab';
import { DiffTab } from '../right-sidebar/DiffTab';
import { PromptRefinerTab } from '../right-sidebar/PromptRefinerTab';
import { TerminalTab } from '../right-sidebar/TerminalTab';
import { SessionsPage } from '../sections/sessions/SessionsPage';

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        isRightSidebarOpen,
        rightSidebarActiveTab,
        setIsMobile,
        isSessionSwitcherOpen,
        setSessionSwitcherOpen,
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

    useEdgeSwipe({ enabled: true, enableRightSidebar: true });

    React.useEffect(() => {
        const previous = useUIStore.getState().isMobile;
        if (previous !== isMobile) {
            setIsMobile(isMobile);
        }
    }, [isMobile, setIsMobile]);

    // Dynamically update sidebar widths on window resize (debounced)
    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        let timeoutId: number | undefined;

        const handleResize = () => {
            // Clear previous timeout
            if (timeoutId !== undefined) {
                window.clearTimeout(timeoutId);
            }

            // Debounce: wait 150ms after last resize event
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

    const mainContent = <SessionsPage />;

    const rightSidebarContent = React.useMemo(() => {
        switch (rightSidebarActiveTab) {
            case 'git':
                return <GitTab />;
            case 'diff':
                return <DiffTab />;
            case 'prompt':
                return <PromptRefinerTab />;
            case 'terminal':
                return <TerminalTab />;
            default:
                return <GitTab />;
        }
    }, [rightSidebarActiveTab]);

    return (
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
                    <Header />
                    <div className="flex flex-1 overflow-hidden bg-background">
                        <main className="flex-1 overflow-hidden bg-background">
                            <ErrorBoundary>{mainContent}</ErrorBoundary>
                        </main>

                        <RightSidebar isOpen={isRightSidebarOpen} isMobile={isMobile}>
                            <ErrorBoundary>{rightSidebarContent}</ErrorBoundary>
                        </RightSidebar>
                    </div>

                    <MobileOverlayPanel
                        open={isSessionSwitcherOpen}
                        onClose={() => setSessionSwitcherOpen(false)}
                        title="Sessions"
                    >
                        <SessionSidebar mobileVariant />
                    </MobileOverlayPanel>
                </>
            ) : (
                <>
                    <Sidebar isOpen={isSidebarOpen} isMobile={isMobile}>
                        <SessionSidebar />
                    </Sidebar>

                    <div className="flex flex-1 flex-col overflow-hidden">
                        <Header />

                        <div className="flex flex-1 overflow-hidden bg-background">
                            <main className="flex-1 overflow-hidden bg-background">
                                <ErrorBoundary>{mainContent}</ErrorBoundary>
                            </main>

                            <RightSidebar isOpen={isRightSidebarOpen} isMobile={isMobile}>
                                <ErrorBoundary>{rightSidebarContent}</ErrorBoundary>
                            </RightSidebar>
                        </div>
                    </div>
                </>
            )}

            <FixedSessionsButton />
        </div>
    );
};
