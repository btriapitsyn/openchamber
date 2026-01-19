import React from 'react';
import { RiDownloadLine, RiInformationLine, RiSettings3Line } from '@remixicon/react';
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
const MAC_TITLEBAR_SAFE_AREA = 40;
const CHECK_FOR_UPDATES_EVENT = 'openchamber:check-for-updates';

interface SidebarProps {
    isOpen: boolean;
    isMobile: boolean;
    children: React.ReactNode;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, isMobile, children }) => {
    const { sidebarWidth, setSidebarWidth, setSettingsDialogOpen, setAboutDialogOpen } = useUIStore();
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
        if (typeof window === 'undefined') {
            return;
        }

        const handleMenuUpdateCheck = () => {
            const hasDesktopApi =
                typeof (window as typeof window & { opencodeDesktop?: unknown }).opencodeDesktop !== 'undefined';
            if (!hasDesktopApi) {
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

    const handleTitlebarDragStart = React.useCallback(async (e: React.MouseEvent) => {

        if (e.button !== 0) {
            return;
        }

        if (isDesktopApp) {
            try {
                const { getCurrentWindow } = await import('@tauri-apps/api/window');
                const window = getCurrentWindow();
                await window.startDragging();
            } catch (error) {
                console.error('Failed to start window dragging from sidebar:', error);
            }
        }
    }, [isDesktopApp]);

    if (isMobile) {

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
                'relative flex h-full overflow-hidden border-r',
                isDesktopApp
                    ? 'bg-[color:var(--sidebar-overlay-strong)] backdrop-blur supports-[backdrop-filter]:bg-[color:var(--sidebar-overlay-soft)]'
                    : 'bg-sidebar',
                isResizing ? 'transition-none' : '',
                !isOpen && 'border-r-0'
            )}
            style={{
                width: `${appliedWidth}px`,
                minWidth: `${appliedWidth}px`,
                maxWidth: `${appliedWidth}px`,
                pointerEvents: !isOpen ? 'none' : undefined,
                borderColor: 'var(--interactive-border)',
                overflowX: 'clip',
            }}
            aria-hidden={!isOpen || appliedWidth === 0}
        >
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
                style={{ width: `${appliedWidth}px`, overflowX: 'hidden' }}
                aria-hidden={!isOpen}
            >
                {shouldRenderTitlebarSpacer && (
                    <div
                        className="flex-shrink-0 select-none"
                        style={{ height: `${MAC_TITLEBAR_SAFE_AREA}px` }}
                        onMouseDown={handleTitlebarDragStart}
                        aria-hidden
                    />
                )}
                <div className="flex-1 overflow-hidden">
                    <ErrorBoundary>{children}</ErrorBoundary>
                </div>
                <div className="flex-shrink-0 border-t border-border p-2">
                    <div className="flex items-center justify-between gap-2">
                        <button
                            onClick={() => setSettingsDialogOpen(true)}
                            className={cn(
                                'flex items-center gap-2 rounded-md px-3 py-2',
                                'text-sm font-semibold text-muted-foreground',
                                'hover:text-foreground',
                                'transition-colors'
                            )}
                        >
                            <RiSettings3Line className="h-4 w-4" />
                            <span>Settings</span>
                        </button>
                        {(available || downloaded) ? (
                            <button
                                onClick={() => setUpdateDialogOpen(true)}
                                className={cn(
                                    'flex items-center gap-1.5 rounded-md px-2.5 py-1.5',
                                    'text-xs font-medium',
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
                                            'flex items-center justify-center rounded-md p-1.5',
                                            'text-muted-foreground',
                                            'hover:text-foreground hover:bg-muted/50',
                                            'transition-colors'
                                        )}
                                    >
                                        <RiInformationLine className="h-4 w-4" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="top">About OpenChamber</TooltipContent>
                            </Tooltip>
                        )}
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
