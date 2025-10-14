import React from 'react';
import { Header } from './Header';
import { NavigationBar, NAV_BAR_WIDTH } from './NavigationBar';
import { Sidebar, SIDEBAR_CONTENT_WIDTH } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { MacWindowControls } from './MacWindowControls';

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

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        setIsMobile,
        setSidebarOpen,
        sidebarSection,
        setSidebarSection,
    } = useUIStore();
    const { isMobile } = useDeviceInfo();

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
            <MacWindowControls />
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

            {/* Desktop: Collapsible Sidebar Content */}
            <Sidebar isOpen={isSidebarOpen} isMobile={isMobile}>
                {sidebarContent}
            </Sidebar>

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
                <main className="flex-1 overflow-hidden bg-background">
                    <ErrorBoundary>{mainContent}</ErrorBoundary>
                </main>
            </div>
        </div>
    );
};
