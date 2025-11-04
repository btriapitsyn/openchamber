import React from 'react';
import { ArrowClockwise, TrashSimple, CheckCircle, Circle, Warning, X } from '@phosphor-icons/react';

import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import {
    createTerminalSession,
    connectTerminalStream,
    sendTerminalInput,
    closeTerminal,
    resizeTerminal,
    type TerminalStreamEvent,
} from '@/lib/terminalApi';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { TerminalViewport, type TerminalController } from './TerminalViewport';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/button';

const TERMINAL_FONT_SIZE = 13;

export const TerminalTab: React.FC = () => {
    const { currentTheme } = useThemeSystem();
    const { monoFont } = useFontPreferences();

    const { currentSessionId, sessions } = useSessionStore();
    const sessionDirectory = React.useMemo(() => {
        if (!currentSessionId) return null;
        const entry = sessions.find((session) => session.id === currentSessionId);
        const directory = typeof entry?.directory === 'string' ? entry.directory : null;
        return directory && directory.length > 0 ? directory : null;
    }, [currentSessionId, sessions]);

    const { currentDirectory: fallbackDirectory, homeDirectory } = useDirectoryStore();
    const effectiveDirectory = sessionDirectory || fallbackDirectory || null;
    
    const displayDirectory = React.useMemo(() => {
        if (!effectiveDirectory) return '';
        if (!homeDirectory) return effectiveDirectory;
        if (effectiveDirectory === homeDirectory) return '~';
        if (effectiveDirectory.startsWith(homeDirectory + '/')) {
            return '~' + effectiveDirectory.slice(homeDirectory.length);
        }
        return effectiveDirectory;
    }, [effectiveDirectory, homeDirectory]);

    const terminalStore = useTerminalStore();
    const terminalSessions = terminalStore.sessions;
    const setTerminalSession = terminalStore.setTerminalSession;
    const setConnecting = terminalStore.setConnecting;
    const appendToBuffer = terminalStore.appendToBuffer;
    const clearTerminalSession = terminalStore.clearTerminalSession;
    const removeTerminalSession = terminalStore.removeTerminalSession;
    const clearBuffer = terminalStore.clearBuffer;

    const terminalState = React.useMemo(() => {
        if (!currentSessionId) return undefined;
        return terminalSessions.get(currentSessionId);
    }, [terminalSessions, currentSessionId]);
    const terminalSessionRef = terminalState?.terminalSessionId ?? null;
    const bufferChunks = terminalState?.bufferChunks ?? [];
    const bufferLength = terminalState?.bufferLength ?? 0;
    const isConnecting = terminalState?.isConnecting ?? false;
    const terminalSessionId = terminalSessionRef;

    const [connectionError, setConnectionError] = React.useState<string | null>(null);

    const streamCleanupRef = React.useRef<(() => void) | null>(null);
    const activeTerminalIdRef = React.useRef<string | null>(null);
    const sessionIdRef = React.useRef<string | null>(currentSessionId ?? null);
    const terminalIdRef = React.useRef<string | null>(terminalSessionId);
    const directoryRef = React.useRef<string | null>(effectiveDirectory);
    const terminalControllerRef = React.useRef<TerminalController | null>(null);
    const isRightSidebarOpen = useUIStore((state) => state.isRightSidebarOpen);

    React.useEffect(() => {
        sessionIdRef.current = currentSessionId ?? null;
    }, [currentSessionId]);

    React.useEffect(() => {
        terminalIdRef.current = terminalSessionId;
    }, [terminalSessionId]);

    React.useEffect(() => {
        directoryRef.current = effectiveDirectory;
    }, [effectiveDirectory]);

    const disconnectStream = React.useCallback(() => {
        streamCleanupRef.current?.();
        streamCleanupRef.current = null;
        activeTerminalIdRef.current = null;
    }, []);

    React.useEffect(
        () => () => {
            disconnectStream();
            terminalIdRef.current = null;
        },
        [disconnectStream]
    );

    const startStream = React.useCallback(
        (terminalId: string) => {
            if (activeTerminalIdRef.current === terminalId) {
                return;
            }

            disconnectStream();

            const unsubscribe = connectTerminalStream(
                terminalId,
                (event: TerminalStreamEvent) => {
                    const sessionId = sessionIdRef.current;
                    if (!sessionId) return;

                    switch (event.type) {
                        case 'connected': {
                            setConnecting(sessionId, false);
                            setConnectionError(null);
                            terminalControllerRef.current?.focus();
                            break;
                        }
                        case 'reconnecting': {
                            const attempt = event.attempt ?? 0;
                            const maxAttempts = event.maxAttempts ?? 3;
                            setConnectionError(`Reconnecting (${attempt}/${maxAttempts})...`);
                            break;
                        }
                        case 'data': {
                            if (event.data) {
                                appendToBuffer(sessionId, event.data);
                            }
                            break;
                        }
                        case 'exit': {
                            const exitCode =
                                typeof event.exitCode === 'number' ? event.exitCode : null;
                            const signal = typeof event.signal === 'number' ? event.signal : null;
                            appendToBuffer(
                                sessionId,
                                `\r\n[Process exited${
                                    exitCode !== null ? ` with code ${exitCode}` : ''
                                }${signal !== null ? ` (signal ${signal})` : ''}]\r\n`
                            );
                            clearTerminalSession(sessionId);
                            setConnecting(sessionId, false);
                            setConnectionError('Terminal session ended');
                            disconnectStream();
                            break;
                        }
                    }
                },
                (error, fatal) => {
                    const sessionId = sessionIdRef.current;
                    if (!sessionId) return;

                    const errorMsg = fatal
                        ? `Connection failed: ${error.message}`
                        : error.message || 'Terminal stream connection error';

                    setConnectionError(errorMsg);

                    if (fatal) {
                        setConnecting(sessionId, false);
                        disconnectStream();
                        removeTerminalSession(sessionId);
                    }
                }
            );

            streamCleanupRef.current = unsubscribe;
            activeTerminalIdRef.current = terminalId;
        },
        [appendToBuffer, clearTerminalSession, disconnectStream, removeTerminalSession, setConnecting]
    );

    React.useEffect(() => {
        let cancelled = false;
        const sessionId = currentSessionId;

        if (!sessionId || !effectiveDirectory) {
            setConnectionError(
                sessionId
                    ? 'No working directory available for terminal.'
                    : 'Select a session to open the terminal.'
            );
            disconnectStream();
            return;
        }

        const ensureSession = async () => {
            if (!sessionIdRef.current || sessionIdRef.current !== sessionId) return;
            const currentState = useTerminalStore.getState().sessions.get(sessionId);

            if (
                currentState?.terminalSessionId &&
                currentState.directory &&
                currentState.directory !== effectiveDirectory
            ) {
                disconnectStream();
                try {
                    if (currentState.terminalSessionId) {
                        await closeTerminal(currentState.terminalSessionId);
                    }
                } catch {
                    // ignore close errors
                }
                removeTerminalSession(sessionId);
                return;
            }

            let terminalId = currentState?.terminalSessionId ?? null;

            if (!terminalId) {
                setConnectionError(null);
                setConnecting(sessionId, true);
                try {
                    const session = await createTerminalSession({
                        cwd: effectiveDirectory,
                    });
                    if (cancelled) {
                        try {
                            await closeTerminal(session.sessionId);
                        } catch {
                            // ignore
                        }
                        return;
                    }
                    setTerminalSession(sessionId, session, effectiveDirectory);
                    terminalId = session.sessionId;
                } catch (error) {
                    if (!cancelled) {
                        setConnectionError(
                            error instanceof Error
                                ? error.message
                                : 'Failed to start terminal session'
                        );
                        setConnecting(sessionId, false);
                    }
                    return;
                }
            }

            if (!terminalId || cancelled) return;

            terminalIdRef.current = terminalId;
            startStream(terminalId);
        };

        void ensureSession();

        return () => {
            cancelled = true;
            terminalIdRef.current = null;
            disconnectStream();
        };
    }, [
        currentSessionId,
        effectiveDirectory,
        removeTerminalSession,
        setConnecting,
        setTerminalSession,
        startStream,
        disconnectStream,
    ]);

    const handleReconnect = React.useCallback(async () => {
        if (!currentSessionId) return;
        setConnectionError(null);
        disconnectStream();
        const terminalId = terminalSessionId;
        if (terminalId) {
            try {
                await closeTerminal(terminalId);
            } catch {
                // ignore
            }
        }
        removeTerminalSession(currentSessionId);
    }, [currentSessionId, disconnectStream, removeTerminalSession, terminalSessionId]);

    const handleClear = React.useCallback(() => {
        if (!currentSessionId) return;
        clearBuffer(currentSessionId);
        terminalControllerRef.current?.clear();
        terminalControllerRef.current?.focus();

        const terminalId = terminalIdRef.current;
        if (terminalId) {
            void sendTerminalInput(terminalId, '\u000c').catch((error) => {
                setConnectionError(error instanceof Error ? error.message : 'Failed to refresh prompt');
            });
        }
    }, [clearBuffer, currentSessionId, setConnectionError]);

    const handleViewportInput = React.useCallback((data: string) => {
        const terminalId = terminalIdRef.current;
        if (!terminalId) return;
        void sendTerminalInput(terminalId, data).catch((error) => {
            setConnectionError(error instanceof Error ? error.message : 'Failed to send input');
        });
    }, []);

    const handleViewportResize = React.useCallback((cols: number, rows: number) => {
        const terminalId = terminalIdRef.current;
        if (!terminalId) return;
        void resizeTerminal(terminalId, cols, rows).catch(() => {
            // ignore resize failures
        });
    }, []);

    // All hooks must be called before any conditional returns
    const resolvedFontStack = React.useMemo(() => {
        const defaultStack = CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT].stack;
        if (typeof window === 'undefined') {
            const fallbackDefinition =
                CODE_FONT_OPTION_MAP[monoFont] ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT];
            return fallbackDefinition.stack;
        }

        const root = window.getComputedStyle(document.documentElement);
        const cssStack = root.getPropertyValue('--font-family-mono');
        if (cssStack && cssStack.trim().length > 0) {
            return cssStack.trim();
        }

        const definition =
            CODE_FONT_OPTION_MAP[monoFont] ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT];
        return definition.stack ?? defaultStack;
    }, [monoFont]);

    const xtermTheme = React.useMemo(() => convertThemeToXterm(currentTheme), [currentTheme]);

    const terminalSessionKey = React.useMemo(() => {
        const sessionPart = currentSessionId ?? 'none';
        const directoryPart = effectiveDirectory ?? 'no-dir';
        const terminalPart = terminalSessionId ?? 'pending';
        return `${sessionPart}::${directoryPart}::${terminalPart}`;
    }, [currentSessionId, effectiveDirectory, terminalSessionId]);

    React.useEffect(() => {
        if (!isRightSidebarOpen) {
            return;
        }
        const controller = terminalControllerRef.current;
        if (!controller) {
            return;
        }
        const fitOnce = () => {
            controller.fit();
        };
        if (typeof window !== 'undefined') {
            const rafId = window.requestAnimationFrame(() => {
                fitOnce();
                controller.focus();
            });
            const timeoutIds = [220, 400].map((delay) => window.setTimeout(fitOnce, delay));
            return () => {
                window.cancelAnimationFrame(rafId);
                timeoutIds.forEach((id) => window.clearTimeout(id));
            };
        }
        fitOnce();
    }, [isRightSidebarOpen, terminalSessionKey, currentSessionId, terminalSessionId]);

    // Conditional rendering - must come after all hooks
    const isReconnecting = connectionError?.includes('Reconnecting');

    const statusIcon = connectionError
        ? isReconnecting
            ? <Warning size={20} className="text-amber-400" />
            : <X size={20} className="text-destructive" />
        : terminalSessionId && !isConnecting
            ? <CheckCircle size={20} className="text-emerald-400" weight="fill" />
            : isConnecting
                ? <Circle size={20} className="text-amber-400 animate-pulse" />
                : <Circle size={20} className="text-muted-foreground" />;

    // Handle missing session or directory - early returns must come after all hooks
    if (!currentSessionId) {
        return (
            <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
                Select a session to open the terminal
            </div>
        );
    }

    if (!effectiveDirectory) {
        return (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground">
                <p>No working directory available for this session.</p>
                <button
                    onClick={handleReconnect}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Retry
                </button>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col overflow-hidden border-t" style={{ backgroundColor: 'var(--syntax-background)' }}>
            <div className="flex items-center justify-between gap-3 px-3 py-2 text-xs" style={{ backgroundColor: 'var(--syntax-background)' }}>
                <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
                    <span className="truncate font-mono text-foreground/90">{displayDirectory}</span>
                </div>
                <div className="flex items-center gap-2">
                    {statusIcon}
                    <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2 py-0"
                        onClick={handleClear}
                        disabled={!bufferLength}
                        title="Clear output"
                    >
                        <TrashSimple size={16} />
                        Clear
                    </Button>
                    <Button
                        size="sm"
                        variant="default"
                        className="h-7 px-2 py-0"
                        onClick={handleReconnect}
                        title="Restart terminal session"
                    >
                        <ArrowClockwise size={16} className={cn(isConnecting && 'animate-spin')} />
                        Restart
                    </Button>
                </div>
            </div>

            <div
                className="relative flex-1 overflow-hidden"
                style={{ backgroundColor: xtermTheme.background }}
            >
                <div className="h-full w-full box-border px-3 pt-3 pb-4">
                    {isRightSidebarOpen ? (
                        <TerminalViewport
                            key={terminalSessionKey}
                            ref={(controller) => {
                                terminalControllerRef.current = controller;
                            }}
                            sessionKey={terminalSessionKey}
                            chunks={bufferChunks}
                            onInput={handleViewportInput}
                            onResize={handleViewportResize}
                            theme={xtermTheme}
                            fontFamily={resolvedFontStack}
                            fontSize={TERMINAL_FONT_SIZE}
                        />
                    ) : null}
                </div>
                {connectionError && (
                    <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground">
                        {connectionError}
                    </div>
                )}
            </div>
        </div>
    );
};
