import React from 'react';
import {
  RiAlertLine,
  RiCheckboxCircleLine,
  RiCircleLine,
  RiCloseLine,
  RiPlayLine,
  RiStopLine,
} from '@remixicon/react';

import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useAppRunnerStore, parseUrlsFromText, type AppRunnerStatus } from '@/stores/useAppRunnerStore';
import type { TerminalStreamEvent } from '@/lib/api/types';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT } from '@/lib/fontOptions';
import { convertThemeToXterm } from '@/lib/terminalTheme';
import { TerminalViewport, type TerminalController } from '@/components/terminal/TerminalViewport';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';

import { Button } from '@/components/ui/button';
import { useDeviceInfo } from '@/lib/device';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';

const TERMINAL_FONT_SIZE = 13;

const STREAM_OPTIONS = {
  retry: {
    maxRetries: 3,
    initialDelayMs: 500,
    maxDelayMs: 8000,
  },
  connectionTimeoutMs: 10_000,
};

interface TerminalChunk {
  id: number;
  data: string;
}

export const AppRunnerTerminal: React.FC = () => {
  const { terminal } = useRuntimeAPIs();
  const { currentTheme } = useThemeSystem();
  const { monoFont } = useFontPreferences();
  const { isMobile, hasTouchInput } = useDeviceInfo();

  const { currentDirectory, homeDirectory } = useDirectoryStore();
  const effectiveDirectory = currentDirectory || null;

  const displayDirectory = React.useMemo(() => {
    if (!effectiveDirectory) return '';
    if (!homeDirectory) return effectiveDirectory;
    if (effectiveDirectory === homeDirectory) return '~';
    if (effectiveDirectory.startsWith(homeDirectory + '/')) {
      return '~' + effectiveDirectory.slice(homeDirectory.length);
    }
    return effectiveDirectory;
  }, [effectiveDirectory, homeDirectory]);

  const {
    enabled,
    command,
    status,
    terminalSessionId,
    setStatus,
    setTerminalSessionId,
    addDetectedUrl,
    clearDetectedUrls,
    setLastExitCode,
  } = useAppRunnerStore();

  const [bufferChunks, setBufferChunks] = React.useState<TerminalChunk[]>([]);
  const [connectionError, setConnectionError] = React.useState<string | null>(null);
  const [isFatalError, setIsFatalError] = React.useState(false);
  const nextChunkIdRef = React.useRef(1);

  const streamCleanupRef = React.useRef<(() => void) | null>(null);
  const activeTerminalIdRef = React.useRef<string | null>(null);
  const terminalIdRef = React.useRef<string | null>(terminalSessionId);
  const directoryRef = React.useRef<string | null>(effectiveDirectory);
  const terminalControllerRef = React.useRef<TerminalController | null>(null);
  const commandSentRef = React.useRef(false);

  React.useEffect(() => {
    terminalIdRef.current = terminalSessionId;
  }, [terminalSessionId]);

  React.useEffect(() => {
    directoryRef.current = effectiveDirectory;
  }, [effectiveDirectory]);

  const appendToBuffer = React.useCallback((chunk: string) => {
    if (!chunk) return;

    const urls = parseUrlsFromText(chunk);
    for (const { url, port } of urls) {
      addDetectedUrl(url, port);
    }

    const chunkId = nextChunkIdRef.current++;
    const chunkEntry: TerminalChunk = { id: chunkId, data: chunk };

    setBufferChunks((prev) => {
      const newChunks = [...prev, chunkEntry];
      let totalLength = prev.reduce((acc, c) => acc + c.data.length, 0) + chunk.length;

      const BUFFER_LIMIT = 1_000_000;
      while (totalLength > BUFFER_LIMIT && newChunks.length > 1) {
        const removed = newChunks.shift();
        if (removed) {
          totalLength -= removed.data.length;
        }
      }

      return newChunks;
    });
  }, [addDetectedUrl]);

  const clearBuffer = React.useCallback(() => {
    setBufferChunks([]);
    nextChunkIdRef.current = 1;
  }, []);

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
            switch (event.type) {
              case 'connected': {
                if (event.runtime || event.ptyBackend) {
                  console.log(
                    `[AppRunner] connected runtime=${event.runtime ?? 'unknown'} pty=${event.ptyBackend ?? 'unknown'}`
                  );
                }
                setConnectionError(null);
                setIsFatalError(false);
                
                if (!commandSentRef.current && command) {
                  commandSentRef.current = true;
                  setStatus('starting');
                  setTimeout(() => {
                    void terminal.sendInput(terminalId, command + '\n').then(() => {
                      setStatus('running');
                    }).catch((error) => {
                      console.error('[AppRunner] Failed to send command:', error);
                      setConnectionError(error instanceof Error ? error.message : 'Failed to send command');
                    });
                  }, 100);
                }
                
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
                  appendToBuffer(event.data);
                }
                break;
              }
              case 'exit': {
                const exitCode =
                  typeof event.exitCode === 'number' ? event.exitCode : null;
                const signal = typeof event.signal === 'number' ? event.signal : null;
                appendToBuffer(
                  `\r\n[Process exited${
                    exitCode !== null ? ` with code ${exitCode}` : ''
                  }${signal !== null ? ` (signal ${signal})` : ''}]\r\n`
                );
                setLastExitCode(exitCode);
                setStatus(exitCode === 0 ? 'stopped' : 'crashed');
                setTerminalSessionId(null);
                setConnectionError(null);
                disconnectStream();
                commandSentRef.current = false;
                break;
              }
            }
          },
          onError: (error, fatal) => {
            const errorMsg = fatal
              ? `Connection failed: ${error.message}`
              : error.message || 'Terminal stream connection error';

            setConnectionError(errorMsg);
            setIsFatalError(!!fatal);

            if (fatal) {
              disconnectStream();
              setTerminalSessionId(null);
              setStatus('crashed');
              commandSentRef.current = false;
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
    [appendToBuffer, command, disconnectStream, setLastExitCode, setStatus, setTerminalSessionId, terminal]
  );

  React.useEffect(() => {
    if (terminalSessionId && !activeTerminalIdRef.current) {
      startStream(terminalSessionId);
    }
  }, [terminalSessionId, startStream]);

  const handleStartRef = React.useRef<() => void>(() => {});
  const handleStopRef = React.useRef<() => void>(() => {});

  const handleStart = React.useCallback(async () => {
    if (!effectiveDirectory) return;
    if (status === 'running' || status === 'starting') return;

    setConnectionError(null);
    setIsFatalError(false);
    clearDetectedUrls();
    clearBuffer();
    commandSentRef.current = false;

    try {
      setStatus('starting');
      const session = await terminal.createSession({
        cwd: effectiveDirectory,
      });
      setTerminalSessionId(session.sessionId);
      terminalIdRef.current = session.sessionId;
      startStream(session.sessionId);
    } catch (error) {
      setConnectionError(
        error instanceof Error ? error.message : 'Failed to start terminal session'
      );
      setIsFatalError(true);
      setStatus('crashed');
    }
  }, [effectiveDirectory, status, clearBuffer, clearDetectedUrls, setStatus, setTerminalSessionId, startStream, terminal]);

  const handleStop = React.useCallback(async () => {
    if (!terminalSessionId) return;

    try {
      await terminal.sendInput(terminalSessionId, '\x03');
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const currentId = terminalIdRef.current;
      if (currentId) {
        await terminal.close(currentId);
      }
    } catch (error) {
      console.error('[AppRunner] Failed to stop:', error);
    }

    disconnectStream();
    setTerminalSessionId(null);
    setStatus('stopped');
    commandSentRef.current = false;
  }, [disconnectStream, setStatus, setTerminalSessionId, terminal, terminalSessionId]);

  React.useEffect(() => {
    handleStartRef.current = handleStart;
    handleStopRef.current = handleStop;
  }, [handleStart, handleStop]);

  React.useEffect(() => {
    const onStart = () => handleStartRef.current?.();
    const onStop = () => handleStopRef.current?.();

    document.addEventListener('app-runner-start', onStart);
    document.addEventListener('app-runner-stop', onStop);

    return () => {
      document.removeEventListener('app-runner-start', onStart);
      document.removeEventListener('app-runner-stop', onStop);
    };
  }, []);

  const handleViewportInput = React.useCallback(
    (data: string) => {
      if (!data) return;

      const terminalId = terminalIdRef.current;
      if (!terminalId) return;

      void terminal.sendInput(terminalId, data).catch((error) => {
        setConnectionError(error instanceof Error ? error.message : 'Failed to send input');
      });
    },
    [terminal]
  );

  const handleViewportResize = React.useCallback(
    (cols: number, rows: number) => {
      const terminalId = terminalIdRef.current;
      if (!terminalId) return;
      void terminal.resize({ sessionId: terminalId, cols, rows }).catch(() => {});
    },
    [terminal]
  );

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
    const terminalPart = terminalSessionId ?? 'pending';
    return `app-runner::${terminalPart}`;
  }, [terminalSessionId]);

  const isReconnecting = connectionError?.includes('Reconnecting');

  const statusIcon = connectionError
    ? isReconnecting
      ? <RiAlertLine size={20} className="text-amber-400" />
      : <RiCloseLine size={20} className="text-destructive" />
    : status === 'running'
      ? <RiCheckboxCircleLine size={20} className="text-emerald-400" />
      : status === 'starting'
        ? <RiCircleLine size={20} className="text-amber-400 animate-pulse" />
        : status === 'crashed'
          ? <RiCloseLine size={20} className="text-destructive" />
          : <RiCircleLine size={20} className="text-muted-foreground" />;

  const getStatusLabel = (s: AppRunnerStatus): string => {
    switch (s) {
      case 'stopped':
        return 'Stopped';
      case 'starting':
        return 'Starting...';
      case 'running':
        return 'Running';
      case 'crashed':
        return 'Crashed';
      default:
        return 'Unknown';
    }
  };

  if (!enabled) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        <p>App Runner is disabled. Enable it in Settings {'>'} OpenChamber {'>'} App Runner.</p>
      </div>
    );
  }

  if (!effectiveDirectory) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground">
        <p>No working directory available.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="px-3 py-2 text-xs bg-background">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 text-muted-foreground">
            <span className="truncate font-mono text-foreground/90">{displayDirectory}</span>
            <span className="text-muted-foreground/60">|</span>
            <code className="text-muted-foreground truncate max-w-[200px]">{command}</code>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon}
            <span className="text-muted-foreground">{getStatusLabel(status)}</span>
            {status === 'stopped' || status === 'crashed' ? (
              <Button
                size="sm"
                variant="default"
                className="h-7 px-2 py-0"
                onClick={handleStart}
                title="Start dev server"
                type="button"
              >
                <RiPlayLine size={16} />
                Start
              </Button>
            ) : (
              <Button
                size="sm"
                variant="destructive"
                className="h-7 px-2 py-0"
                onClick={handleStop}
                disabled={status === 'starting'}
                title="Stop dev server"
                type="button"
              >
                <RiStopLine size={16} />
                Stop
              </Button>
            )}
          </div>
        </div>
      </div>

      <div
        className="relative flex-1 overflow-hidden"
        style={{ backgroundColor: xtermTheme.background }}
        data-keyboard-avoid="true"
      >
        <div className="h-full w-full box-border px-3 pt-3 pb-4">
          {isMobile ? (
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
          )}
        </div>
        {connectionError && !isReconnecting && (
          <div className="absolute inset-x-0 bottom-0 bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground flex items-center justify-between gap-2">
            <span>{connectionError}</span>
            {isFatalError && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 py-0 text-xs"
                onClick={handleStart}
                title="Restart"
                type="button"
              >
                Restart
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
