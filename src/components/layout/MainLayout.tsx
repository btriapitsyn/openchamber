import React from 'react';
import { Header } from './Header';
import { RightSidebar } from './RightSidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { SessionSwitcherDialog } from '@/components/session/SessionSwitcherDialog';

import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe';

import { GitTab } from '../right-sidebar/GitTab';
import { DiffTab } from '../right-sidebar/DiffTab';
import { PromptRefinerTab } from '../right-sidebar/PromptRefinerTab';
import { TerminalTab } from '../right-sidebar/TerminalTab';
import { SessionsPage } from '../sections/sessions/SessionsPage';

export const MainLayout: React.FC = () => {
    const {
        isRightSidebarOpen,
        rightSidebarActiveTab,
        setIsMobile,
    } = useUIStore();
    const { isMobile } = useDeviceInfo();

    useEdgeSwipe({ enabled: true, enableRightSidebar: true });

    React.useEffect(() => {
        const previous = useUIStore.getState().isMobile;
        if (previous !== isMobile) {
            setIsMobile(isMobile);
        }
    }, [isMobile, setIsMobile]);

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
        <div className="main-content-safe-area flex h-[100dvh] flex-col bg-background">
            <Header />
            <CommandPalette />
            <SessionSwitcherDialog />
            <HelpDialog />

            <div className="flex flex-1 overflow-hidden bg-background">
                <main className="flex-1 overflow-hidden bg-background">
                    <ErrorBoundary>{mainContent}</ErrorBoundary>
                </main>

                <RightSidebar isOpen={isRightSidebarOpen} isMobile={isMobile}>
                    <ErrorBoundary>{rightSidebarContent}</ErrorBoundary>
                </RightSidebar>
            </div>
        </div>
    );
};
