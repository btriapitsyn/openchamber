import React from 'react';
import { Header } from './Header';
import { NavigationBar, NAV_BAR_WIDTH } from './NavigationBar';
import { Sidebar, SIDEBAR_CONTENT_WIDTH } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';

import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';

// Section components
import { SessionsSidebar } from '../sections/sessions/SessionsSidebar';
import { SessionsPage } from '../sections/sessions/SessionsPage';
import { AgentsSidebar } from '../sections/agents/AgentsSidebar';
import { AgentsPage } from '../sections/agents/AgentsPage';
import { CommandsSidebar } from '../sections/commands/CommandsSidebar';
import { CommandsPage } from '../sections/commands/CommandsPage';
import { ProvidersSidebar } from '../sections/providers/ProvidersSidebar';
import { ProvidersPage } from '../sections/providers/ProvidersPage';
import { GitIdentitiesSidebar } from '../sections/git-identities/GitIdentitiesSidebar';
import { GitIdentitiesPage } from '../sections/git-identities/GitIdentitiesPage';
import { SettingsSidebar } from '../sections/settings/SettingsSidebar';
import { SettingsPage } from '../sections/settings/SettingsPage';

const AUTO_COLLAPSE_BREAKPOINT = 760;

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        setIsMobile,
        setSidebarOpen,
        sidebarSection,
        setSidebarSection,
    } = useUIStore();
    const { isMobile, screenWidth } = useDeviceInfo();

    const sidebarWidth = React.useMemo(() => {
        if (isMobile) {
            return SIDEBAR_CONTENT_WIDTH;
        }

        const width = screenWidth ?? 1024;
        const MIN_CONTENT_WIDTH = 300;
        const navWidth = NAV_BAR_WIDTH;
        const maxSidebar = width - navWidth - MIN_CONTENT_WIDTH;

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

    const sidebarContent = React.useMemo(() => {
        switch (sidebarSection) {
            case 'sessions':
                return <SessionsSidebar />;
            case 'agents':
                return <AgentsSidebar />;
            case 'commands':
                return <CommandsSidebar />;
            case 'providers':
                return <ProvidersSidebar />;
            case 'git-identities':
                return <GitIdentitiesSidebar />;
            case 'settings':
                return <SettingsSidebar />;
            default:
                return <SessionsSidebar />;
        }
    }, [sidebarSection]);

    const mainContent = React.useMemo(() => {
        switch (sidebarSection) {
            case 'sessions':
                return <SessionsPage />;
            case 'agents':
                return <AgentsPage />;
            case 'commands':
                return <CommandsPage />;
            case 'providers':
                return <ProvidersPage />;
            case 'git-identities':
                return <GitIdentitiesPage />;
            case 'settings':
                return <SettingsPage />;
            default:
                return <SessionsPage />;
        }
    }, [sidebarSection]);

    return (
        <div className="main-content-safe-area flex h-[100dvh] bg-background">
            {/* Desktop: Fixed Navigation Bar - Always Visible */}
            {!isMobile && (
                <NavigationBar
                    activeSection={sidebarSection}
                    onSectionChange={setSidebarSection}
                    isMobile={false}
                />
            )}

            {/* Mobile: Navigation Bar + Sidebar in Overlay */}
            {isMobile && (
                <aside
                    className={cn(
                        'fixed left-0 top-0 z-40 flex h-full transform transition-all duration-300 ease-in-out',
                        isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
                    )}
                    style={{ width: '100%' }}
                    aria-hidden={!isSidebarOpen}
                >
                    <div className="flex h-full w-full overflow-hidden">
                        <NavigationBar
                            activeSection={sidebarSection}
                            onSectionChange={setSidebarSection}
                            isMobile={true}
                            showCloseButton={true}
                            onClose={() => setSidebarOpen(false)}
                        />
                        <div className="flex-1 overflow-hidden border-r bg-sidebar">
                            <ErrorBoundary>{sidebarContent}</ErrorBoundary>
                        </div>
                    </div>
                </aside>
            )}

            {/* Mobile Backdrop */}
            {isMobile && (
                <div
                    className={cn(
                        'fixed inset-0 z-30 bg-background/80 backdrop-blur-sm transition-opacity duration-300',
                        isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0'
                    )}
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Main Content Area */}
            <div className="flex flex-1 flex-col overflow-hidden bg-background">
                <Header />
                <CommandPalette />
                <HelpDialog />
                <div className="flex flex-1 overflow-hidden bg-background">
                    <Sidebar isOpen={isSidebarOpen} isMobile={isMobile} width={sidebarWidth}>
                        {sidebarContent}
                    </Sidebar>
                    <main className="flex-1 overflow-hidden bg-background">
                        <ErrorBoundary>{mainContent}</ErrorBoundary>
                    </main>
                </div>
            </div>
        </div>
    );
};
