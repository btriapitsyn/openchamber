import React from 'react';
import { Header } from './Header';
import { MemoizedSessionList } from '../session/SessionList';
import { ChatContainer } from '../chat/ChatContainer';
import { ChatErrorBoundary } from '../chat/ChatErrorBoundary';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import { useSessionStore } from '@/stores/useSessionStore';
import {
    SIDEBAR_SECTIONS,
    SIDEBAR_SECTION_CONFIG_MAP,
    SIDEBAR_SECTION_DESCRIPTIONS,
} from '@/constants/sidebar';
import { SidebarContextSummary } from './SidebarContextSummary';
import type { SidebarSection } from '@/constants/sidebar';

const SIDEBAR_DESKTOP_WIDTH = 320;

const SidebarPlaceholder: React.FC<{ sectionId: SidebarSection }> = ({ sectionId }) => {
    const config = SIDEBAR_SECTION_CONFIG_MAP[sectionId];
    const Icon = config.icon;

    return (
        <div className="flex h-full flex-col">
            <SidebarContextSummary />
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="rounded-full bg-accent/40 p-3 text-muted-foreground">
                    <Icon className="h-5 w-5" />
                </div>
                <h3 className="typography-ui-label font-semibold text-foreground">{config.label}</h3>
                <p className="typography-meta max-w-xs text-muted-foreground">
                    {SIDEBAR_SECTION_DESCRIPTIONS[sectionId]}
                </p>
            </div>
        </div>
    );
};

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        setIsMobile,
        setSidebarOpen,
        sidebarSection,
        setSidebarSection,
    } = useUIStore();
    const { isMobile } = useDeviceInfo();
    const { currentSessionId } = useSessionStore();

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
        if (sidebarSection === 'sessions') {
            return <MemoizedSessionList />;
        }

        return <SidebarPlaceholder sectionId={sidebarSection} />;
    }, [sidebarSection]);

    return (
        <div className="main-content-safe-area flex h-screen flex-col bg-background">
            <Header />
            <CommandPalette />
            <HelpDialog />

            <div className="flex flex-1 overflow-hidden bg-background">
                <aside
                    className={cn(
                        'mobile-sidebar-top fixed left-0 z-40 flex-shrink-0 transform border-r bg-sidebar transition-all duration-300 ease-in-out lg:relative lg:z-0',
                        isSidebarOpen ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0'
                    )}
                    style={{
                        width: isSidebarOpen ? (isMobile ? '100%' : `${SIDEBAR_DESKTOP_WIDTH}px`) : '0px',
                        transition: 'width 300ms ease-in-out, opacity 300ms ease-in-out, transform 300ms ease-in-out',
                    }}
                    aria-hidden={!isSidebarOpen}
                >
                    <div className="flex h-full w-full overflow-hidden">
                        <nav className={cn('flex w-14 flex-col items-center gap-2 border-r border-border/40 bg-sidebar/80 py-4 backdrop-blur', isMobile && !sidebarSection ? 'pt-6' : 'pt-6 md:pt-4')}>
                            {SIDEBAR_SECTIONS.map((section) => {
                                const isActive = sidebarSection === section.id;

                                return (
                                    <Tooltip key={section.id} delayDuration={300}>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                onClick={() => setSidebarSection(section.id)}
                                                className={cn(
                                                    'flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                                                    isActive
                                                        ? 'bg-primary/15 text-primary shadow-sm'
                                                        : 'hover:bg-accent hover:text-foreground'
                                                )}
                                                aria-pressed={isActive}
                                                aria-label={section.label}
                                            >
                                                <section.icon className="h-4 w-4" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="right">{section.label}</TooltipContent>
                                    </Tooltip>
                                );
                            })}
                        </nav>
                        <div className="flex-1 overflow-hidden">
                            <ErrorBoundary>{sidebarContent}</ErrorBoundary>
                        </div>
                    </div>
                </aside>

                <div
                    className={cn(
                        'fixed inset-0 z-30 bg-background/80 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
                        isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'pointer-events-none opacity-0'
                    )}
                    onClick={() => setSidebarOpen(false)}
                />

                <main className="flex-1 overflow-hidden bg-background">
                    <ChatErrorBoundary sessionId={currentSessionId || undefined}>
                        <ChatContainer />
                    </ChatErrorBoundary>
                </main>
            </div>
        </div>
    );
};
