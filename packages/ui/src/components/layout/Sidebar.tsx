import React from 'react';
import { RiDownloadLine, RiInformationLine, RiQuestionLine, RiSettings3Line } from '@remixicon/react';
import { toast } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useUIStore } from '@/stores/useUIStore';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { UpdateDialog } from '../ui/UpdateDialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

export const SIDEBAR_CONTENT_WIDTH = 264;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 500;
const CHECK_FOR_UPDATES_EVENT = 'openchamber:check-for-updates';

interface SidebarProps {
    isOpen: boolean;
    isMobile: boolean;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, isMobile, children }) => {
    const { sidebarWidth, setSidebarWidth, setSettingsDialogOpen, setAboutDialogOpen, toggleHelpDialog } = useUIStore();
    const [isResizing, setIsResizing] = React.useState(false);
    const startXRef = React.useRef(0);
    const startWidthRef = React.useRef(sidebarWidth || SIDEBAR_CONTENT_WIDTH);
    const [updateDialogOpen, setUpdateDialogOpen] = React.useState(false);

    const updateStore = useUpdateStore();
    const pendingMenuUpdateCheckRef = React.useRef(false);

    const checkForUpdates = updateStore.checkForUpdates;
    const { available, downloaded, checking } = updateStore;

    const [isDesktopApp, setIsDesktopApp] = React.useState<boolean>(() => {
        if (typeof window === 'undefined') {
            return false;
        }
        return Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__);
    });



    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }
        setIsDesktopApp(Boolean((window as unknown as { __TAURI__?: unknown }).__TAURI__));
    }, []);

    React.useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const handleMenuUpdateCheck = () => {
            if (!(window as unknown as { __TAURI__?: unknown }).__TAURI__) {
                return;
            }
            pendingMenuUpdateCheckRef.current = true;
            void checkForUpdates();
        };

        window.addEventListener(CHECK_FOR_UPDATES_EVENT, handleMenuUpdateCheck as EventListener);
        return () => {
            window.removeEventListener(CHECK_FOR_UPDATES_EVENT, handleMenuUpdateCheck as EventListener);
        };
    }, [checkForUpdates]);

    React.useEffect(() => {
        if (!pendingMenuUpdateCheckRef.current) {
            return;
        }
        if (checking) {
            return;
        }

        if (available || downloaded) {
            setUpdateDialogOpen(true);
        } else {
            toast.success('No updates available', {
                description: 'You are running the latest version.',
            });
        }
        pendingMenuUpdateCheckRef.current = false;
    }, [available, downloaded, checking]);

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

        return null;
    }

    const appliedWidth = isOpen ? Math.min(
        SIDEBAR_MAX_WIDTH,
        Math.max(SIDEBAR_MIN_WIDTH, sidebarWidth || SIDEBAR_CONTENT_WIDTH)
    ) : 0;

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
                'relative flex h-full overflow-hidden border-r border-border',
                isDesktopApp
                    ? 'bg-[color:var(--sidebar-overlay-strong)] backdrop-blur supports-[backdrop-filter]:bg-[color:var(--sidebar-overlay-soft)]'
                    : 'bg-sidebar',
                isResizing ? 'transition-none' : 'transition-[width] duration-300 ease-in-out',
                !isOpen && 'border-r-0'
            )}
            style={{
                width: `${appliedWidth}px`,
                minWidth: `${appliedWidth}px`,
                maxWidth: `${appliedWidth}px`,
                overflowX: 'clip',
            }}
            aria-hidden={!isOpen || appliedWidth === 0}
        >
            {isOpen && (
                <div
                    className={cn(
                        'absolute right-0 top-0 z-20 h-full w-[4px] cursor-col-resize hover:bg-primary/50 transition-colors',
                        isResizing && 'bg-primary'
                    )}
                    onPointerDown={handlePointerDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize left panel"
                />
            )}
            <div
                className={cn(
                    'relative z-10 flex h-full flex-col transition-opacity duration-300 ease-in-out',
                    !isOpen && 'pointer-events-none select-none opacity-0'
                )}
                style={{ width: `${appliedWidth}px`, overflowX: 'hidden' }}
                aria-hidden={!isOpen}
            >
                <div className="flex-1 overflow-hidden">
                    <ErrorBoundary>{children}</ErrorBoundary>
                </div>
                <div className="flex-shrink-0 border-t border-border h-12 px-2 bg-sidebar">
                    <div className="flex h-full items-center justify-between gap-2">
                        <button
                            onClick={() => setSettingsDialogOpen(true)}
                            className={cn(
                                'flex h-8 items-center gap-2 rounded-md px-2',
                                'text-sm font-semibold text-sidebar-foreground/90',
                                'hover:text-sidebar-foreground hover:bg-interactive-hover',
                                'transition-all duration-200'
                            )}
                        >
                            <RiSettings3Line className="h-4 w-4" />
                            <span>Settings</span>
                        </button>
                        <div className="flex items-center gap-1">
                            {(available || downloaded) ? (
                                    <button
                                        onClick={() => setUpdateDialogOpen(true)}
                                        className={cn(
                                            'flex items-center gap-1.5 rounded-md px-2 py-1',
                                            'text-xs font-semibold',
                                            'bg-primary/10 text-primary',
                                            'hover:bg-primary/20',
                                            'transition-colors'
                                        )}
                                    >
                                        <RiDownloadLine className="h-3.5 w-3.5" />
                                        <span>Update</span>
                                    </button>

                            ) : !isDesktopApp && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            onClick={() => setAboutDialogOpen(true)}
                                            className={cn(
                                                'flex h-8 w-8 items-center justify-center rounded-md',
                                                'text-sidebar-foreground/70',
                                                'hover:text-sidebar-foreground hover:bg-interactive-hover',
                                                'transition-all duration-200'
                                            )}
                                        >
                                            <RiInformationLine className="h-4 w-4" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">About OpenChamber</TooltipContent>
                                </Tooltip>
                            )}
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <button
                                        onClick={toggleHelpDialog}
                                        className={cn(
                                            'flex h-8 w-8 items-center justify-center rounded-md',
                                            'text-sidebar-foreground/70',
                                            'hover:text-sidebar-foreground hover:bg-interactive-hover',
                                            'transition-all duration-200'
                                        )}
                                        aria-label="Keyboard shortcuts"
                                    >
                                        <RiQuestionLine className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Keyboard shortcuts</TooltipContent>
                            </Tooltip>
                        </div>
                    </div>
                </div>
                <UpdateDialog
                    open={updateDialogOpen}
                    onOpenChange={setUpdateDialogOpen}
                    info={updateStore.info}
                    downloading={updateStore.downloading}
                    downloaded={updateStore.downloaded}
                    progress={updateStore.progress}
                    error={updateStore.error}
                    onDownload={updateStore.downloadUpdate}
                    onRestart={updateStore.restartToUpdate}
                    runtimeType={updateStore.runtimeType}
                />
            </div>
        </aside>
    );
};
