import React from 'react';
import { RiComputerLine, RiExternalLinkLine, RiEyeLine, RiEyeOffLine, RiFullscreenLine, RiPlayLine, RiScreenshot2Line } from '@remixicon/react';
import { cn } from '@/lib/utils';

export interface KernelBrowserSession {
    session_id?: string;
    browser_live_view_url?: string;
    cdp_ws_url?: string;
    status?: string;
    created_at?: string;
    timeout_seconds?: number;
    headless?: boolean;
    stealth?: boolean;
}

export interface KernelPlaywrightResult {
    success?: boolean;
    result?: unknown;
    replay_url?: string;
    error?: string;
    stderr?: string;
}

export interface KernelScreenshotResult {
    success?: boolean;
    image?: string;
    error?: string;
}

interface KernelBrowserViewProps {
    session?: KernelBrowserSession;
    playwrightResult?: KernelPlaywrightResult;
    screenshotResult?: KernelScreenshotResult;
    className?: string;
}

const KernelBrowserView: React.FC<KernelBrowserViewProps> = ({
    session,
    playwrightResult,
    screenshotResult,
    className,
}) => {
    const [isLiveViewVisible, setIsLiveViewVisible] = React.useState(false);
    const [isFullscreen, setIsFullscreen] = React.useState(false);
    const iframeRef = React.useRef<HTMLIFrameElement>(null);

    const liveViewUrl = session?.browser_live_view_url;
    const replayUrl = playwrightResult?.replay_url;
    const screenshotImage = screenshotResult?.image;

    const handleOpenInNewTab = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    const handleToggleFullscreen = () => {
        if (iframeRef.current) {
            if (!isFullscreen) {
                iframeRef.current.requestFullscreen?.();
            } else {
                document.exitFullscreen?.();
            }
            setIsFullscreen(!isFullscreen);
        }
    };

    React.useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
    }, []);

    // If we have a screenshot, render it
    if (screenshotImage) {
        const imageSrc = screenshotImage.startsWith('data:')
            ? screenshotImage
            : `data:image/png;base64,${screenshotImage}`;

        return (
            <div className={cn('space-y-2', className)}>
                <div className="flex items-center gap-2 text-muted-foreground typography-meta">
                    <RiScreenshot2Line className="h-4 w-4" />
                    <span className="font-medium">Browser Screenshot</span>
                </div>
                <div className="rounded-lg border border-border/30 overflow-hidden bg-muted/10">
                    <img
                        src={imageSrc}
                        alt="Browser screenshot"
                        className="w-full max-h-[500px] object-contain"
                    />
                </div>
            </div>
        );
    }

    // If we have a replay URL from playwright execution
    if (replayUrl) {
        return (
            <div className={cn('space-y-2', className)}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-muted-foreground typography-meta">
                        <RiPlayLine className="h-4 w-4" />
                        <span className="font-medium">Session Replay</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => handleOpenInNewTab(replayUrl)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary typography-micro font-medium transition-colors"
                    >
                        <RiExternalLinkLine className="h-3.5 w-3.5" />
                        Open Replay
                    </button>
                </div>
                {playwrightResult?.success === false && playwrightResult?.error && (
                    <div className="p-2 rounded-lg border" style={{
                        backgroundColor: 'var(--status-error-background)',
                        color: 'var(--status-error)',
                        borderColor: 'var(--status-error-border)',
                    }}>
                        <span className="typography-meta">{playwrightResult.error}</span>
                    </div>
                )}
            </div>
        );
    }

    // If we have a live browser session
    if (session && liveViewUrl) {
        return (
            <div className={cn('space-y-3', className)}>
                {/* Header with session info and controls */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 text-foreground typography-meta">
                            <RiComputerLine className="h-4 w-4 text-primary" />
                            <span className="font-medium">Live Browser Session</span>
                        </div>
                        {session.status && (
                            <span className={cn(
                                'px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide',
                                session.status === 'running' || session.status === 'active'
                                    ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                                    : 'bg-muted text-muted-foreground'
                            )}>
                                {session.status}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsLiveViewVisible(!isLiveViewVisible)}
                            className={cn(
                                'flex items-center gap-1.5 px-2 py-1 rounded-md typography-micro font-medium transition-colors',
                                isLiveViewVisible
                                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                    : 'bg-muted hover:bg-muted/80 text-foreground'
                            )}
                        >
                            {isLiveViewVisible ? (
                                <>
                                    <RiEyeOffLine className="h-3.5 w-3.5" />
                                    Hide Live View
                                </>
                            ) : (
                                <>
                                    <RiEyeLine className="h-3.5 w-3.5" />
                                    Show Live View
                                </>
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleOpenInNewTab(liveViewUrl)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary typography-micro font-medium transition-colors"
                        >
                            <RiExternalLinkLine className="h-3.5 w-3.5" />
                            Open in Tab
                        </button>
                    </div>
                </div>

                {/* Session details */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 typography-micro text-muted-foreground">
                    {session.session_id && (
                        <span className="font-mono">
                            ID: <span className="text-foreground/80">{session.session_id.substring(0, 12)}...</span>
                        </span>
                    )}
                    {session.stealth && (
                        <span className="text-amber-600 dark:text-amber-400">🥷 Stealth</span>
                    )}
                    {session.headless && (
                        <span className="text-blue-600 dark:text-blue-400">👁️ Headless</span>
                    )}
                    {session.timeout_seconds && (
                        <span>Timeout: {session.timeout_seconds}s</span>
                    )}
                </div>

                {/* Live view iframe */}
                {isLiveViewVisible && (
                    <div className="relative rounded-lg border border-border/50 overflow-hidden bg-black">
                        <div className="absolute top-2 right-2 z-10 flex gap-1">
                            <button
                                type="button"
                                onClick={handleToggleFullscreen}
                                className="p-1.5 rounded bg-black/50 hover:bg-black/70 text-white transition-colors"
                                title="Toggle fullscreen"
                            >
                                <RiFullscreenLine className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => handleOpenInNewTab(liveViewUrl)}
                                className="p-1.5 rounded bg-black/50 hover:bg-black/70 text-white transition-colors"
                                title="Open in new tab"
                            >
                                <RiExternalLinkLine className="h-4 w-4" />
                            </button>
                        </div>
                        <iframe
                            ref={iframeRef}
                            src={liveViewUrl}
                            className="w-full aspect-video min-h-[300px] max-h-[500px]"
                            allow="clipboard-read; clipboard-write"
                            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals"
                            title="Kernel Browser Live View"
                        />
                    </div>
                )}

                {/* Quick actions hint when live view is hidden */}
                {!isLiveViewVisible && (
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/20">
                        <div className="flex items-center gap-3 typography-micro text-muted-foreground">
                            <RiComputerLine className="h-5 w-5 text-primary/60" />
                            <div>
                                <div className="text-foreground/80">Browser session is active</div>
                                <div>Click "Show Live View" to watch the session or "Open in Tab" for full control</div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Fallback for missing data
    return null;
};

/**
 * Parse Kernel browser tool output to extract session/result data
 */
export function parseKernelBrowserOutput(output: string, toolName: string): {
    session?: KernelBrowserSession;
    playwrightResult?: KernelPlaywrightResult;
    screenshotResult?: KernelScreenshotResult;
} | null {
    if (!output) return null;

    try {
        const parsed = JSON.parse(output);

        // Handle create_browser, get_browser output
        if (toolName.includes('create_browser') || toolName.includes('get_browser')) {
            if (parsed.browser_live_view_url || parsed.session_id || parsed.cdp_ws_url) {
                return { session: parsed as KernelBrowserSession };
            }
        }

        // Handle execute_playwright_code output
        if (toolName.includes('execute_playwright') || toolName.includes('playwright_code')) {
            return { playwrightResult: parsed as KernelPlaywrightResult };
        }

        // Handle take_screenshot output
        if (toolName.includes('screenshot')) {
            if (parsed.image || (parsed.success !== undefined && parsed.error === undefined)) {
                return { screenshotResult: parsed as KernelScreenshotResult };
            }
        }

        // Generic browser session detection
        if (parsed.browser_live_view_url) {
            return { session: parsed as KernelBrowserSession };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Check if a tool is a Kernel browser tool
 */
export function isKernelBrowserTool(toolName: string): boolean {
    const kernelBrowserTools = [
        'mcp__kernel__create_browser',
        'mcp__kernel__get_browser',
        'mcp__kernel__list_browsers',
        'mcp__kernel__delete_browser',
        'mcp__kernel__execute_playwright_code',
        'mcp__kernel__take_screenshot',
        'mcp__kernel__setup_profile',
    ];
    return kernelBrowserTools.some(t => toolName.includes(t) || toolName.toLowerCase().includes(t.toLowerCase()));
}

export default KernelBrowserView;
