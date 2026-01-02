import React from 'react';
import { RiAlertLine, RiArrowDownLine, RiArrowGoBackLine, RiArrowLeftLine, RiArrowRightLine, RiArrowUpLine, RiCheckboxCircleLine, RiCircleLine, RiCloseLine, RiCommandLine, RiDeleteBinLine, RiRestartLine } from '@remixicon/react';

import { useSessionStore } from '@/stores/useSessionStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useTerminalStore } from '@/stores/useTerminalStore';
import { type TerminalStreamEvent } from '@/lib/api/types';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { TerminalViewport, type TerminalController } from '@/components/terminal/TerminalViewport';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/useUIStore';
import { Button } from '@/components/ui/button';
import { useDeviceInfo } from '@/lib/device';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

const TERMINAL_FONT_SIZE = 13;

type Modifier = 'ctrl' | 'cmd';
type MobileKey =
    | 'esc'
    | 'tab'
    | 'enter'
    | 'arrow-up'
    | 'arrow-down'
    | 'arrow-left'
    | 'arrow-right';

const BASE_KEY_SEQUENCES: Record<MobileKey, string> = {
    esc: '\u001b',
    tab: '\t',
    enter: '\r',
    'arrow-up': '\u001b[A',
    'arrow-down': '\u001b[B',
    'arrow-left': '\u001b[D',
    'arrow-right': '\u001b[C',
};

const MODIFIER_ARROW_SUFFIX: Record<Modifier, string> = {
    ctrl: '5',
    cmd: '3',
};

const STREAM_OPTIONS = {
    retry: {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 8000,
    },
    connectionTimeoutMs: 10_000,
};

const getSequenceForKey = (key: MobileKey, modifier: Modifier | null): string | null => {
    if (modifier) {
        switch (key) {
            case 'arrow-up':
                return `\u001b[1;${MODIFIER_ARROW_SUFFIX[modifier]}A`;
            case 'arrow-down':
                return `\u001b[1;${MODIFIER_ARROW_SUFFIX[modifier]}B`;
            case 'arrow-right':
                return `\u001b[1;${MODIFIER_ARROW_SUFFIX[modifier]}C`;
            case 'arrow-left':
                return `\u001b[1;${MODIFIER_ARROW_SUFFIX[modifier]}D`;
            default:
                break;
        }
    }

    return BASE_KEY_SEQUENCES[key] ?? null;
};

export const TerminalView: React.FC = () => {
    const { terminal } = useRuntimeAPIs();
    const { currentTheme } = useThemeSystem();
    const { monoFont } = useFontPreferences();
    const { isMobile, hasTouchInput } = useDeviceInfo();

    const { currentSessionId, sessions, worktreeMetadata: worktreeMap } = useSessionStore();
    const worktreeMetadata = currentSessionId ? worktreeMap.get(currentSessionId) ?? undefined : undefined;

    const sessionDirectory = React.useMemo(() => {
        if (worktreeMetadata?.path) {
            return worktreeMetadata.path;
        }
        if (!currentSessionId) return null;
        const entry = sessions.find((session) => session.id === currentSessionId);
        const directory = typeof (entry as { directory?: string } | undefined)?.directory === 'string'
            ? (entry as { directory?: string }).directory
            : null;
        return directory && directory.length > 0 ? directory : null;
    }, [currentSessionId, sessions, worktreeMetadata]);

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
        if (!effectiveDirectory) return undefined;
        return terminalSessions.get(effectiveDirectory);
    }, [terminalSessions, effectiveDirectory]);
    const terminalSessionRef = terminalState?.terminalSessionId ?? null;
    const bufferChunks = terminalState?.bufferChunks ?? [];
    const bufferLength = terminalState?.bufferLength ?? 0;
    const isConnecting = terminalState?.isConnecting ?? false;
    const terminalSessionId = terminalSessionRef;

    const [connectionError, setConnectionError] = React.useState<string | null>(null);
    const [isFatalError, setIsFatalError] = React.useState(false);
    const [activeModifier, setActiveModifier] = React.useState<Modifier | null>(null);
    const [isRestarting, setIsRestarting] = React.useState(false);

    const streamCleanupRef = React.useRef<(() => void) | null>(null);
    const activeTerminalIdRef = React.useRef<string | null>(null);
    const terminalIdRef = React.useRef<string | null>(terminalSessionId);
    const directoryRef = React.useRef<string | null>(effectiveDirectory);
    const terminalControllerRef = React.useRef<TerminalController | null>(null);

    const activeMainTab = useUIStore((state) => state.activeMainTab);
    const isTerminalActive = activeMainTab === 'terminal';

    React.useEffect(() => {
        terminalIdRef.current = terminalSessionId;
    }, [terminalSessionId]);

    React.useEffect(() => {
        directoryRef.current = effectiveDirectory;
    }, [effectiveDirectory]);

    React.useEffect(() => {
        if (!isMobile && activeModifier !== null) {
            setActiveModifier(null);
        }
    }, [isMobile, activeModifier, setActiveModifier]);

    React.useEffect(() => {
        if (!terminalSessionId && activeModifier !== null) {
            setActiveModifier(null);
        }
    }, [terminalSessionId, activeModifier, setActiveModifier]);

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

            const subscription = terminal.connect(
                terminalId,
                {
                    onEvent: (event: TerminalStreamEvent) => {
                        const directory = directoryRef.current;
                        if (!directory) return;

                        switch (event.type) {
                            case 'connected': {
                                if (event.runtime || event.ptyBackend) {
                                    console.log(
                                        `[Terminal] connected runtime=${event.runtime ?? 'unknown'} pty=${event.ptyBackend ?? 'unknown'}`
                                    );
                                }
                                setConnecting(directory, false);
                                setConnectionError(null);
                                setIsFatalError(false);
                                terminalControllerRef.current?.focus();
                                break;
                            }
                            case 'reconnecting': {
                                const attempt = event.attempt ?? 0;
                                const maxAttempts = event.maxAttempts ?? 3;
                                setConnectionError(`Reconnecting (${attempt}/${maxAttempts})...`);
                                setIsFatalError(false);
                                break;
                            }
                            case 'data': {
                                if (event.data) {
                                    appendToBuffer(directory, event.data);
                                }
                                break;
                            }
                            case 'exit': {
                                const exitCode =
                                    typeof event.exitCode === 'number' ? event.exitCode : null;
                                const signal = typeof event.signal === 'number' ? event.signal : null;
                                appendToBuffer(
                                    directory,
                                    `\r\n[Process exited${
                                        exitCode !== null ? ` with code ${exitCode}` : ''
                                    }${signal !== null ? ` (signal ${signal})` : ''}]\r\n`
                                );
                                clearTerminalSession(directory);
                                setConnecting(directory, false);
                                setConnectionError('Terminal session ended');
                                setIsFatalError(false);
                                disconnectStream();
                                break;
                            }
                        }
                    },
                    onError: (error, fatal) => {
                        const directory = directoryRef.current;
                        if (!directory) return;

                        const errorMsg = fatal
                            ? `Connection failed: ${error.message}`
                            : error.message || 'Terminal stream connection error';

                        setConnectionError(errorMsg);
                        setIsFatalError(!!fatal);

                        if (fatal) {
                            setConnecting(directory, false);
                            disconnectStream();
                            removeTerminalSession(directory);
                        }
                    },
                },
                STREAM_OPTIONS
            );

            streamCleanupRef.current = () => {
                subscription.close();
                activeTerminalIdRef.current = null;
            };
            activeTerminalIdRef.current = terminalId;
        },
        [appendToBuffer, clearTerminalSession, disconnectStream, removeTerminalSession, setConnecting, terminal, setConnectionError]
    );

    React.useEffect(() => {
        let cancelled = false;

        if (!effectiveDirectory) {
            setConnectionError(
                currentSessionId
                    ? 'No working directory available for terminal.'
                    : 'Select a session to open the terminal.'
            );
            disconnectStream();
            return;
        }

        const ensureSession = async () => {
            const directory = effectiveDirectory;
            if (!directoryRef.current || directoryRef.current !== directory) return;
            const currentState = useTerminalStore.getState().getTerminalSession(directory);

            let terminalId = currentState?.terminalSessionId ?? null;

            if (!terminalId) {
                setConnectionError(null);
                setIsFatalError(false);
                setConnecting(directory, true);
                try {
                    const session = await terminal.createSession({
                        cwd: directory,
                    });
                    if (cancelled) {
                        try {
                            await terminal.close(session.sessionId);
                        } catch { /* ignored */ }
                        return;
                    }
                    setTerminalSession(directory, session);
                    terminalId = session.sessionId;
                } catch (error) {
                    if (!cancelled) {
                        setConnectionError(
                            error instanceof Error
                                ? error.message
                                : 'Failed to start terminal session'
                        );
                        setIsFatalError(true);
                        setConnecting(directory, false);
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
        terminalSessionId,
        removeTerminalSession,
        setConnecting,
        setTerminalSession,
        startStream,
        disconnectStream,
        terminal,
    ]);

    const handleRestart = React.useCallback(async () => {
        if (!effectiveDirectory) return;
        if (isRestarting) return;

        setIsRestarting(true);
        setConnectionError(null);
        setIsFatalError(false);
        disconnectStream();

        const currentTerminalId = terminalIdRef.current;

        try {
            if (terminal.restartSession && currentTerminalId) {
                const newSession = await terminal.restartSession(currentTerminalId, {
                    cwd: effectiveDirectory,
                });
                setTerminalSession(effectiveDirectory, newSession);
                terminalIdRef.current = newSession.sessionId;
                startStream(newSession.sessionId);
            } else {
                if (currentTerminalId) {
                    try {
                        await terminal.close(currentTerminalId);
                    } catch { /* ignored */ }
                }
                removeTerminalSession(effectiveDirectory);
            }
        } catch (error) {
            setConnectionError(
                error instanceof Error ? error.message : 'Failed to restart terminal'
            );
            setIsFatalError(true);
        } finally {
            setIsRestarting(false);
        }
    }, [effectiveDirectory, isRestarting, disconnectStream, terminal, setTerminalSession, startStream, removeTerminalSession]);

    const handleHardRestart = React.useCallback(async () => {
        if (!effectiveDirectory) return;
        if (isRestarting) return;

        setIsRestarting(true);
        setConnectionError(null);
        setIsFatalError(false);
        disconnectStream();

        try {
            if (terminal.forceKill) {
                await terminal.forceKill({ cwd: effectiveDirectory });
            }
        } catch { /* ignored */ }

        removeTerminalSession(effectiveDirectory);
        clearBuffer(effectiveDirectory);
        terminalControllerRef.current?.clear();

        await new Promise(r => setTimeout(r, 100));

        try {
            setConnecting(effectiveDirectory, true);
            const session = await terminal.createSession({
                cwd: effectiveDirectory,
            });
            setTerminalSession(effectiveDirectory, session);
            terminalIdRef.current = session.sessionId;
            startStream(session.sessionId);
        } catch (error) {
            setConnectionError(
                error instanceof Error ? error.message : 'Failed to create terminal'
            );
            setIsFatalError(true);
            setConnecting(effectiveDirectory, false);
        } finally {
            setIsRestarting(false);
        }
    }, [effectiveDirectory, isRestarting, disconnectStream, terminal, removeTerminalSession, clearBuffer, setConnecting, setTerminalSession, startStream]);

    const handleClear = React.useCallback(() => {
        if (!effectiveDirectory) return;
        clearBuffer(effectiveDirectory);
        terminalControllerRef.current?.clear();
        terminalControllerRef.current?.focus();

        const terminalId = terminalIdRef.current;
        if (terminalId) {
            void terminal.sendInput(terminalId, '\u000c').catch((error) => {
                setConnectionError(error instanceof Error ? error.message : 'Failed to refresh prompt');
            });
        }
    }, [clearBuffer, effectiveDirectory, setConnectionError, terminal]);

    const handleViewportInput = React.useCallback(
        (data: string) => {
            if (!data) {
                return;
            }

            let payload = data;
            let modifierConsumed = false;

            if (activeModifier && data.length > 0) {
                const firstChar = data[0];
                if (firstChar.length === 1 && /[a-zA-Z]/.test(firstChar)) {
                    const upper = firstChar.toUpperCase();
                    if (activeModifier === 'ctrl' || activeModifier === 'cmd') {
                        payload = String.fromCharCode(upper.charCodeAt(0) & 0b11111);
                        modifierConsumed = true;
                    }
                }

                if (!modifierConsumed) {
                    modifierConsumed = true;
                }
            }

            const terminalId = terminalIdRef.current;
            if (!terminalId) return;

            void terminal.sendInput(terminalId, payload).catch((error) => {
                setConnectionError(error instanceof Error ? error.message : 'Failed to send input');
            });

            if (modifierConsumed) {
                setActiveModifier(null);
                terminalControllerRef.current?.focus();
            }
        },
        [activeModifier, setActiveModifier, terminal]
    );

    const handleViewportResize = React.useCallback(
        (cols: number, rows: number) => {
            const terminalId = terminalIdRef.current;
            if (!terminalId) return;
            void terminal.resize({ sessionId: terminalId, cols, rows }).catch(() => {

            });
        },
        [terminal]
    );

    const handleModifierToggle = React.useCallback(
        (modifier: Modifier) => {
            setActiveModifier((current) => (current === modifier ? null : modifier));
            terminalControllerRef.current?.focus();
        },
        [setActiveModifier]
    );

    const handleMobileKeyPress = React.useCallback(
        (key: MobileKey) => {
            const sequence = getSequenceForKey(key, activeModifier);
            if (!sequence) {
                return;
            }
            handleViewportInput(sequence);
            setActiveModifier(null);
            terminalControllerRef.current?.focus();
        },
        [activeModifier, handleViewportInput, setActiveModifier]
    );

    React.useEffect(() => {
        if (!isMobile || !activeModifier || !terminalSessionId) {
            return;
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.repeat) {
                return;
            }

            const rawKey = event.key;
            if (!rawKey) {
                return;
            }

            if (rawKey === 'Control' || rawKey === 'Meta' || rawKey === 'Alt' || rawKey === 'Shift') {
                return;
            }

            const normalizedKey = rawKey.length === 1 ? rawKey.toLowerCase() : rawKey;
            const code = event.code ?? '';
            const upperFromCode =
                code.startsWith('Key') && code.length === 4
                    ? code.slice(3).toUpperCase()
                    : null;
            const upperKey =
                rawKey.length === 1 && /[a-zA-Z]/.test(rawKey)
                    ? rawKey.toUpperCase()
                    : upperFromCode;

            const toMobileKey: Record<string, MobileKey> = {
                Tab: 'tab',
                Enter: 'enter',
                ArrowUp: 'arrow-up',
                ArrowDown: 'arrow-down',
                ArrowLeft: 'arrow-left',
                ArrowRight: 'arrow-right',
                Escape: 'esc',
                tab: 'tab',
                enter: 'enter',
                arrowup: 'arrow-up',
                arrowdown: 'arrow-down',
                arrowleft: 'arrow-left',
                arrowright: 'arrow-right',
                escape: 'esc',
            };

            if (normalizedKey in toMobileKey) {
                event.preventDefault();
                event.stopPropagation();
                handleMobileKeyPress(toMobileKey[normalizedKey]);
                return;
            }

            if (activeModifier === 'ctrl' && upperKey && upperKey.length === 1) {
                if (upperKey >= 'A' && upperKey <= 'Z') {
                    const controlCode = String.fromCharCode(upperKey.charCodeAt(0) & 0b11111);
                    event.preventDefault();
                    event.stopPropagation();
                    handleViewportInput(controlCode);
                    setActiveModifier(null);
                    terminalControllerRef.current?.focus();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        activeModifier,
        handleMobileKeyPress,
        handleViewportInput,
        isMobile,
        setActiveModifier,
        terminalSessionId,
    ]);

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
        const directoryPart = effectiveDirectory ?? 'no-dir';
        const terminalPart = terminalSessionId ?? 'pending';
        return `${directoryPart}::${terminalPart}`;
    }, [effectiveDirectory, terminalSessionId]);

    React.useEffect(() => {
        if (!isTerminalActive) {
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
    }, [isTerminalActive, terminalSessionKey, terminalSessionId]);

    const isReconnecting = connectionError?.includes('Reconnecting');

    const statusIcon = connectionError
        ? isReconnecting
            ? <RiAlertLine size={20} className="text-amber-400" />
            : <RiCloseLine size={20} className="text-destructive" />
        : terminalSessionId && !isConnecting && !isRestarting
            ? <RiCheckboxCircleLine size={20} className="text-emerald-400" />
            : isConnecting || isRestarting
                ? <RiCircleLine size={20} className="text-amber-400 animate-pulse" />
                : <RiCircleLine size={20} className="text-muted-foreground" />;

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
                    onClick={handleRestart}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                    Retry
                </button>
            </div>
        );
    }

    const quickKeysDisabled = !terminalSessionId || isConnecting || isRestarting;

    return (
        <div className="flex h-full flex-col overflow-hidden bg-background">
            <div className="px-3 py-2 text-xs bg-background">
                <div className="flex items-center justify-between gap-3">
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
                            type="button"
                        >
                            <RiDeleteBinLine size={16} />
                            Clear
                        </Button>
                        <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2 py-0"
                            onClick={handleRestart}
                            disabled={isRestarting}
                            title="Restart terminal session"
                            type="button"
                        >
                            <RiRestartLine size={16} className={cn((isConnecting || isRestarting) && 'animate-spin')} />
                            Restart
                        </Button>
                    </div>
                </div>
                {isMobile ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-xs"
                            onClick={() => handleMobileKeyPress('esc')}
                            disabled={quickKeysDisabled}
                        >
                            Esc
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('tab')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowRightLine size={16} />
                            <span className="sr-only">Tab</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={activeModifier === 'ctrl' ? 'default' : 'outline'}
                            className="h-6 w-9 p-0"
                            onClick={() => handleModifierToggle('ctrl')}
                            disabled={quickKeysDisabled}
                        >
                            <span className="text-xs font-medium">Ctrl</span>
                            <span className="sr-only">Control modifier</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant={activeModifier === 'cmd' ? 'default' : 'outline'}
                            className="h-6 w-9 p-0"
                            onClick={() => handleModifierToggle('cmd')}
                            disabled={quickKeysDisabled}
                        >
                            <RiCommandLine size={16} />
                            <span className="sr-only">Command modifier</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('arrow-up')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowUpLine size={16} />
                            <span className="sr-only">Arrow up</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('arrow-left')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowLeftLine size={16} />
                            <span className="sr-only">Arrow left</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('arrow-down')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowDownLine size={16} />
                            <span className="sr-only">Arrow down</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('arrow-right')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowRightLine size={16} />
                            <span className="sr-only">Arrow right</span>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 w-9 p-0"
                            onClick={() => handleMobileKeyPress('enter')}
                            disabled={quickKeysDisabled}
                        >
                            <RiArrowGoBackLine size={16} />
                            <span className="sr-only">Enter</span>
                        </Button>
                    </div>
                ) : null}
            </div>

            <div
                className="relative flex-1 overflow-hidden"
                style={{ backgroundColor: xtermTheme.background }}
                data-keyboard-avoid="true"
            >
                <div className="h-full w-full box-border px-3 pt-3 pb-4">
                    {isTerminalActive ? (
                        isMobile ? (
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
                                enableTouchScroll={hasTouchInput}
                            />
                        ) : (
                            <ScrollableOverlay outerClassName="h-full" className="h-full w-full" disableHorizontal>
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
                                    enableTouchScroll={hasTouchInput}
                                />
                            </ScrollableOverlay>
                        )
                    ) : null}
                </div>
                {connectionError && (
                    <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground flex items-center justify-between gap-2">
                        <span>{connectionError}</span>
                        {isFatalError && (
                            <Button
                                size="sm"
                                variant="secondary"
                                className="h-6 px-2 py-0 text-xs"
                                onClick={handleHardRestart}
                                disabled={isRestarting}
                                title="Force kill and create fresh session"
                                type="button"
                            >
                                Hard Restart
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
