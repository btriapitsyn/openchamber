import React, { useCallback, useState } from 'react';
import { Sidebar } from './Sidebar';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CommandPalette } from '../ui/CommandPalette';
import { HelpDialog } from '../ui/HelpDialog';
import { WorktreeSidebar } from '@/components/sidebar';
import { SessionDialogs } from '@/components/session/SessionDialogs';
import { DiffWorkerProvider } from '@/contexts/DiffWorkerProvider';
import { MultiRunLauncher } from '@/components/multirun';
import { WorkspacePane } from '@/components/panes';
import { usePaneStore, usePanes, type PaneId } from '@/stores/usePaneStore';
import { useSessionStore } from '@/stores/useSessionStore';

import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useDeviceInfo } from '@/lib/device';
import { useEdgeSwipe } from '@/hooks/useEdgeSwipe';
import { cn } from '@/lib/utils';

import { SettingsView } from '@/components/views';

export const MainLayout: React.FC = () => {
    const {
        isSidebarOpen,
        setIsMobile,
        isSettingsDialogOpen,
        setSettingsDialogOpen,
        isMultiRunLauncherOpen,
        setMultiRunLauncherOpen,
        multiRunLauncherPrefillPrompt,
    } = useUIStore();
    
    const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
    const worktreeId = currentDirectory ?? 'global';

    const { rightPaneWidth, setRightPaneWidth } = usePaneStore();
    const { addTab, activateTabByIndex, closeActiveTab, focusedPane, rightPane, moveTab, setFocusedPane } = usePanes(worktreeId);
    const { createSession, setCurrentSession } = useSessionStore();
    const [isResizing, setIsResizing] = React.useState(false);
    const [isDraggingTab, setIsDraggingTab] = useState(false);
    const [isRightDropZoneHovered, setIsRightDropZoneHovered] = useState(false);
    
    const rightPaneVisible = rightPane.tabs.length > 0;

    React.useEffect(() => {
        const handleDragStart = (e: DragEvent) => {
            if (e.dataTransfer?.types.includes('application/x-openchamber-tab')) {
                setIsDraggingTab(true);
            }
        };
        const handleDragEnd = () => {
            setIsDraggingTab(false);
            setIsRightDropZoneHovered(false);
        };
        
        document.addEventListener('dragstart', handleDragStart);
        document.addEventListener('dragend', handleDragEnd);
        document.addEventListener('drop', handleDragEnd);
        
        return () => {
            document.removeEventListener('dragstart', handleDragStart);
            document.removeEventListener('dragend', handleDragEnd);
            document.removeEventListener('drop', handleDragEnd);
        };
    }, []);

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

    React.useEffect(() => {
        if (typeof window === 'undefined' || isMobile) return;

        const handleKeyDown = async (e: KeyboardEvent) => {
            const isMeta = e.metaKey || e.ctrlKey;
            if (!isMeta) return;

            if (e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const index = parseInt(e.key, 10) - 1;
                activateTabByIndex(index);
                return;
            }

            if (e.key === 't' && !e.shiftKey) {
                e.preventDefault();
                const session = await createSession();
                if (session?.id) {
                    addTab(focusedPane, {
                        type: 'chat',
                        title: session.title || 'New Chat',
                        sessionId: session.id,
                    });
                    setCurrentSession(session.id);
                }
                return;
            }

            if (e.key === 'w' && !e.shiftKey) {
                e.preventDefault();
                closeActiveTab();
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isMobile, activateTabByIndex, closeActiveTab, addTab, focusedPane, createSession, setCurrentSession]);

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

    const isSettingsActive = isSettingsDialogOpen && !isMobile;

    const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);

        const startX = e.clientX;
        const startWidth = rightPaneWidth;
        const containerWidth = window.innerWidth;
        const maxWidth = Math.floor(containerWidth * 0.6);
        const minWidth = 280;

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const delta = startX - moveEvent.clientX;
            const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
            setRightPaneWidth(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [rightPaneWidth, setRightPaneWidth]);

    const handleRightDropZoneDragOver = useCallback((e: React.DragEvent) => {
        if (e.dataTransfer.types.includes('application/x-openchamber-tab')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setIsRightDropZoneHovered(true);
        }
    }, []);

    const handleRightDropZoneDragLeave = useCallback((e: React.DragEvent) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsRightDropZoneHovered(false);
    }, []);

    const handleRightDropZoneDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsRightDropZoneHovered(false);

        const tabData = e.dataTransfer.getData('application/x-openchamber-tab');
        if (tabData) {
            try {
                const { tabId, sourcePane } = JSON.parse(tabData) as {
                    tabId: string;
                    sourcePane: PaneId;
                };
                moveTab(sourcePane, 'right', tabId);
                setFocusedPane('right');
            } catch { /* empty */ }
        }
    }, [moveTab, setFocusedPane]);

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
                        <div
                            className={cn(
                                'flex flex-1 overflow-hidden bg-background',
                                (isSettingsDialogOpen || isMultiRunLauncherOpen) && 'hidden'
                            )}
                        >
                        <WorkspacePane
                            paneId="left"
                            worktreeId={worktreeId}
                            className="flex-1"
                            isLastPane={true}
                        />
                        </div>

                        {isMultiRunLauncherOpen && (
                            <div className="absolute inset-0 z-10 bg-background header-safe-area">
                                <ErrorBoundary>
                                    <MultiRunLauncher
                                        initialPrompt={multiRunLauncherPrefillPrompt}
                                        onCreated={() => setMultiRunLauncherOpen(false)}
                                        onCancel={() => setMultiRunLauncherOpen(false)}
                                    />
                                </ErrorBoundary>
                            </div>
                        )}

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
                                <WorktreeSidebar />
                            </Sidebar>
                        )}

                        <div className="flex flex-1 overflow-hidden relative">
                            <div className={cn('flex flex-1 overflow-hidden', (isSettingsActive || isMultiRunLauncherOpen) && 'invisible')}>
                            <WorkspacePane
                                paneId="left"
                                worktreeId={worktreeId}
                                className="flex-1"
                                isLastPane={!rightPaneVisible}
                            />
                            {rightPaneVisible ? (
                                <>
                                    <div
                                        className={cn(
                                            'w-1 cursor-col-resize hover:bg-primary/20 transition-colors shrink-0',
                                            isResizing && 'bg-primary/30'
                                        )}
                                        onMouseDown={handleResizeStart}
                                        style={{ borderLeft: '1px solid var(--interactive-border)' }}
                                    />
                                    <WorkspacePane
                                        paneId="right"
                                        worktreeId={worktreeId}
                                        className="shrink-0"
                                        style={{ width: rightPaneWidth }}
                                        isLastPane={true}
                                    />
                                </>
                            ) : isDraggingTab && (
                                <div
                                    className={cn(
                                        'shrink-0 transition-all duration-150 flex items-center justify-center',
                                        isRightDropZoneHovered 
                                            ? 'bg-primary/10 border-l-2 border-primary w-32' 
                                            : 'w-12 border-l border-dashed border-muted-foreground/40'
                                    )}
                                    onDragOver={handleRightDropZoneDragOver}
                                    onDragLeave={handleRightDropZoneDragLeave}
                                    onDrop={handleRightDropZoneDrop}
                                >
                                    {isRightDropZoneHovered && (
                                        <span className="text-xs text-primary font-medium rotate-90 whitespace-nowrap">
                                            Drop to open panel
                                        </span>
                                    )}
                                </div>
                            )}
                            </div>

                            {isMultiRunLauncherOpen && (
                                <div className={cn('absolute inset-0 z-10', isDesktopRuntime ? 'bg-transparent' : 'bg-background')}>
                                    <ErrorBoundary>
                                        <MultiRunLauncher
                                            initialPrompt={multiRunLauncherPrefillPrompt}
                                            onCreated={() => setMultiRunLauncherOpen(false)}
                                            onCancel={() => setMultiRunLauncherOpen(false)}
                                        />
                                    </ErrorBoundary>
                                </div>
                            )}
                        </div>

                        {isSettingsActive && (
                            <div className={cn('absolute inset-0 z-10', isDesktopRuntime ? 'bg-transparent' : 'bg-background')}>
                                <ErrorBoundary><SettingsView onClose={() => setSettingsDialogOpen(false)} /></ErrorBoundary>
                            </div>
                        )}
                    </>
                )}
            </div>
        </DiffWorkerProvider>
    );
};
