import React from 'react';
import { Header } from './Header';
import { Sidebar, SIDEBAR_CONTENT_WIDTH } from './Sidebar';
import { RightSidebar, RIGHT_SIDEBAR_WIDTH } from './RightSidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';

import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';

// Right sidebar tab components
import { GitTab } from '../right-sidebar/GitTab';
import { DiffTab } from '../right-sidebar/DiffTab';
import { TerminalTab } from '../right-sidebar/TerminalTab';

// Section components
import { SessionsSidebar } from '../sections/sessions/SessionsSidebar';
import { SessionsPage } from '../sections/sessions/SessionsPage';

const AUTO_COLLAPSE_BREAKPOINT = 760;

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        isRightSidebarOpen,
        rightSidebarActiveTab,
        setIsMobile,
        setSidebarOpen,
    } = useUIStore();
    const { isMobile, screenWidth } = useDeviceInfo();

    const sidebarWidth = React.useMemo(() => {
        if (isMobile) {
            return SIDEBAR_CONTENT_WIDTH;
        }

        const width = screenWidth ?? 1024;
        const MIN_CONTENT_WIDTH = 300;
        const maxSidebar = width - MIN_CONTENT_WIDTH;

        if (maxSidebar >= SIDEBAR_CONTENT_WIDTH) {
            return SIDEBAR_CONTENT_WIDTH;
        }

        if (maxSidebar <= 0) {
            return 0;
        }

        const MIN_SIDEBAR_WIDTH = 180;
        const limitedSidebar = Math.max(0, Math.min(SIDEBAR_CONTENT_WIDTH, maxSidebar));

        if (limitedSidebar === 0) {
            return 0;
        }

        if (limitedSidebar < MIN_SIDEBAR_WIDTH && maxSidebar >= MIN_SIDEBAR_WIDTH) {
            return MIN_SIDEBAR_WIDTH;
        }

        return limitedSidebar;
    }, [isMobile, screenWidth]);

    React.useEffect(() => {
        const wasMobile = useUIStore.getState().isMobile;

        if (wasMobile !== isMobile) {
            setIsMobile(isMobile);
        }

        if (isMobile && !wasMobile) {
            setSidebarOpen(false);
        } else if (!isMobile && wasMobile) {
            setSidebarOpen(true);
        }
    }, [isMobile, setIsMobile, setSidebarOpen]);

    const autoCollapsedRef = React.useRef(false);
    const lastSidebarOpenRef = React.useRef(isSidebarOpen);

    React.useEffect(() => {
        if (isMobile) {
            autoCollapsedRef.current = false;
            lastSidebarOpenRef.current = isSidebarOpen;
            return;
        }

        const width = screenWidth ?? (typeof window !== 'undefined' ? window.innerWidth : undefined) ?? 0;
        const shouldAutoCollapse = width > 0 && width < AUTO_COLLAPSE_BREAKPOINT;

        if (shouldAutoCollapse) {
            if (isSidebarOpen) {
                autoCollapsedRef.current = true;
                setSidebarOpen(false);
            }
        } else {
            if (autoCollapsedRef.current && !isSidebarOpen) {
                setSidebarOpen(true);
                autoCollapsedRef.current = false;
            } else if (!isSidebarOpen && lastSidebarOpenRef.current !== isSidebarOpen) {
                autoCollapsedRef.current = false;
            }
        }

        lastSidebarOpenRef.current = isSidebarOpen;
    }, [isMobile, screenWidth, isSidebarOpen, setSidebarOpen]);

    // Always show Sessions sidebar and page
    const sidebarContent = <SessionsSidebar />;
    const mainContent = <SessionsPage />;

    const rightSidebarContent = React.useMemo(() => {
        switch (rightSidebarActiveTab) {
            case 'git':
                return <GitTab />;
            case 'diff':
                return <DiffTab />;
            case 'terminal':
                return <TerminalTab />;
            default:
                return <GitTab />;
        }
    }, [rightSidebarActiveTab]);

    return (
        <div className="main-content-safe-area flex h-[100dvh] flex-col bg-background">
            <Header />
            <CommandPalette />
            <HelpDialog />

            {/* Mobile: Sidebar Overlay */}
            {isMobile && (
                <>
                    <aside
                        className={cn(
                            'fixed left-0 z-40 transform transition-all duration-300 ease-in-out',
                            isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
                        )}
                        style={{
                            width: `${SIDEBAR_CONTENT_WIDTH}px`,
                            top: 'var(--header-height, 3.5rem)',
                            height: 'calc(100dvh - var(--header-height, 3.5rem))'
                        }}
                        aria-hidden={!isSidebarOpen}
                    >
                        <div className="h-full overflow-hidden border-r bg-sidebar">
                            <ErrorBoundary>{sidebarContent}</ErrorBoundary>
                        </div>
                    </aside>

                    {/* Mobile Backdrop */}
                    <div
                        className={cn(
                            'fixed left-0 right-0 bottom-0 z-30 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
                            isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0'
                        )}
                        style={{ top: 'var(--header-height, 3.5rem)' }}
                        onClick={() => setSidebarOpen(false)}
                    />
                </>
            )}

            {/* Main Content Area */}
            <div className="flex flex-1 overflow-hidden bg-background">
                {/* Desktop: Sidebar */}
                {!isMobile && (
                    <Sidebar isOpen={isSidebarOpen} isMobile={false} width={sidebarWidth}>
                        {sidebarContent}
                    </Sidebar>
                )}

                {/* Main Page Content */}
                <main className="flex-1 overflow-hidden bg-background">
                    <ErrorBoundary>{mainContent}</ErrorBoundary>
                </main>

                {/* Right Sidebar */}
                <RightSidebar isOpen={isRightSidebarOpen} isMobile={isMobile}>
                    <ErrorBoundary>{rightSidebarContent}</ErrorBoundary>
                </RightSidebar>
            </div>
        </div>
    );
};
