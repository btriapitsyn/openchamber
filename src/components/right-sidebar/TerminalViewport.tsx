import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import type { TerminalTheme } from '@/lib/terminalTheme';
import { getTerminalOptions } from '@/lib/terminalTheme';
import type { TerminalChunk } from '@/stores/useTerminalStore';
import { cn } from '@/lib/utils';

type TerminalWithCore = Terminal & {
  _core?: {
    dimensions?: {
      actualCellHeight?: number;
    };
  };
};

type TerminalController = {
  focus: () => void;
  clear: () => void;
  fit: () => void;
};

interface TerminalViewportProps {
  sessionKey: string;
  chunks: TerminalChunk[];
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  theme: TerminalTheme;
  fontFamily: string;
  fontSize: number;
  className?: string;
  enableTouchScroll?: boolean;
}

const TerminalViewport = React.forwardRef<TerminalController, TerminalViewportProps>(
  (
    { sessionKey, chunks, onInput, onResize, theme, fontFamily, fontSize, className, enableTouchScroll },
    ref
  ) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const terminalRef = React.useRef<Terminal | null>(null);
    const fitAddonRef = React.useRef<FitAddon | null>(null);
    const inputHandlerRef = React.useRef<(data: string) => void>(onInput);
    const resizeHandlerRef = React.useRef<(cols: number, rows: number) => void>(onResize);
    const writeQueueRef = React.useRef<string[]>([]);
    const isWritingRef = React.useRef(false);
    const processedCountRef = React.useRef(0);
    const firstChunkIdRef = React.useRef<number | null>(null);
    const touchScrollCleanupRef = React.useRef<(() => void) | null>(null);

    inputHandlerRef.current = onInput;
    resizeHandlerRef.current = onResize;

    const resetWriteState = React.useCallback(() => {
      writeQueueRef.current = [];
      isWritingRef.current = false;
      processedCountRef.current = 0;
      firstChunkIdRef.current = null;
    }, []);

    const fitTerminal = React.useCallback(() => {
      const fitAddon = fitAddonRef.current;
      const terminal = terminalRef.current;
      const container = containerRef.current;
      if (!fitAddon || !terminal || !container) {
        return;
      }
      const rect = container.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 24) {
        return;
      }
      try {
        fitAddon.fit();
        resizeHandlerRef.current(terminal.cols, terminal.rows);
      } catch {
        // Ignore situations where container is not ready yet
      }
    }, []);

    const flushWriteQueue = React.useCallback(() => {
      if (isWritingRef.current) {
        return;
      }

      const consumeNext = () => {
        const term = terminalRef.current;
        if (!term) {
          resetWriteState();
          return;
        }

        const chunk = writeQueueRef.current.shift();
        if (chunk === undefined) {
          isWritingRef.current = false;
          return;
        }

        isWritingRef.current = true;
        term.write(chunk, () => {
          isWritingRef.current = false;
          if (writeQueueRef.current.length > 0) {
            if (typeof window !== 'undefined') {
              window.setTimeout(consumeNext, 0);
            } else {
              consumeNext();
            }
          }
        });
      };

      consumeNext();
    }, [resetWriteState]);

    const enqueueWrite = React.useCallback(
      (data: string) => {
        if (!data) {
          return;
        }
        writeQueueRef.current = [data];
        isWritingRef.current = false;
        flushWriteQueue();
      },
      [flushWriteQueue]
    );

    const setupTouchScroll = React.useCallback(() => {
      touchScrollCleanupRef.current?.();
      touchScrollCleanupRef.current = null;

      if (!enableTouchScroll) {
        return;
      }

      const container = containerRef.current;
      const terminal = terminalRef.current;
      if (!container || !terminal) {
        return;
      }

      const state = {
        lastY: null as number | null,
        remainder: 0,
      };

      const internalTerminal = terminal as TerminalWithCore;
      const measuredLineHeight =
        internalTerminal._core?.dimensions?.actualCellHeight ?? null;
      const lineHeightEstimate =
        (typeof measuredLineHeight === 'number' && measuredLineHeight > 0
          ? measuredLineHeight
          : Math.max(fontSize + 6, fontSize * 1.6));

      const handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          return;
        }
        state.lastY = event.touches[0].clientY;
        state.remainder = 0;
      };

      const handleTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          state.lastY = null;
          state.remainder = 0;
          return;
        }

        if (state.lastY === null) {
          state.lastY = event.touches[0].clientY;
          return;
        }

        const currentY = event.touches[0].clientY;
        const delta = state.lastY - currentY;
        state.lastY = currentY;

        const aggregate = state.remainder + delta / lineHeightEstimate;
        const lines =
          aggregate > 0 ? Math.floor(aggregate) : aggregate < 0 ? Math.ceil(aggregate) : 0;

        state.remainder = aggregate - lines;

        if (lines !== 0) {
          event.preventDefault();
          event.stopPropagation();
          terminal.scrollLines(lines);
        }
      };

      const handleTouchEnd = () => {
        state.lastY = null;
        state.remainder = 0;
      };

      const listenerOptions: AddEventListenerOptions = { passive: false };
      container.addEventListener('touchstart', handleTouchStart, listenerOptions);
      container.addEventListener('touchmove', handleTouchMove, listenerOptions);
      container.addEventListener('touchend', handleTouchEnd);
      container.addEventListener('touchcancel', handleTouchEnd);

      const previousTouchAction = container.style.touchAction;
      container.style.touchAction = 'none';

      touchScrollCleanupRef.current = () => {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
        container.removeEventListener('touchcancel', handleTouchEnd);
        container.style.touchAction = previousTouchAction;
      };
    }, [enableTouchScroll, fontSize]);

    React.useEffect(() => {
      const terminal = new Terminal(getTerminalOptions(fontFamily, fontSize, theme));
      const fitAddon = new FitAddon();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      terminal.loadAddon(fitAddon);

      const container = containerRef.current;
      if (container) {
        terminal.open(container);
        fitTerminal();
        terminal.focus();
      }

      const disposables = [
        terminal.onData((data) => {
          inputHandlerRef.current(data);
        }),
      ];

      const resizeObserver = new ResizeObserver(() => {
        fitTerminal();
      });
      if (container) {
        resizeObserver.observe(container);
      }

      return () => {
        touchScrollCleanupRef.current?.();
        touchScrollCleanupRef.current = null;
        disposables.forEach((disposable) => disposable.dispose());
        resizeObserver.disconnect();
        terminal.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        resetWriteState();
      };
    }, [fitTerminal, fontFamily, fontSize, theme, resetWriteState]);

    React.useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }
      const options = getTerminalOptions(fontFamily, fontSize, theme);
      Object.assign(terminal.options as Record<string, unknown>, options);
      fitTerminal();
    }, [fitTerminal, fontFamily, fontSize, theme]);

    React.useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }
      terminal.reset();
      resetWriteState();
      fitTerminal();
      terminal.focus();
    }, [sessionKey, fitTerminal, resetWriteState]);

    React.useEffect(() => {
      setupTouchScroll();
      return () => {
        touchScrollCleanupRef.current?.();
        touchScrollCleanupRef.current = null;
      };
    }, [setupTouchScroll, sessionKey]);

    React.useEffect(() => {
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      if (chunks.length === 0) {
        if (processedCountRef.current !== 0) {
          terminal.reset();
          resetWriteState();
          fitTerminal();
        }
        return;
      }

      const currentFirstId = chunks[0].id;
      if (firstChunkIdRef.current === null) {
        firstChunkIdRef.current = currentFirstId;
      }

      const shouldReset =
        firstChunkIdRef.current !== currentFirstId || processedCountRef.current > chunks.length;

      if (shouldReset) {
        terminal.reset();
        resetWriteState();
        firstChunkIdRef.current = currentFirstId;
      }

      if (processedCountRef.current < chunks.length) {
        const pending = chunks.slice(processedCountRef.current);
        enqueueWrite(pending.map((chunk) => chunk.data).join(''));
        processedCountRef.current = chunks.length;
      }
    }, [chunks, enqueueWrite, fitTerminal, resetWriteState]);

    React.useImperativeHandle(
      ref,
      (): TerminalController => ({
        focus: () => {
          terminalRef.current?.focus();
        },
        clear: () => {
          const terminal = terminalRef.current;
          if (!terminal) {
            return;
          }
          terminal.reset();
          resetWriteState();
          fitTerminal();
        },
        fit: () => {
          fitTerminal();
        },
      }),
      [fitTerminal, resetWriteState]
    );

    return <div ref={containerRef} className={cn('h-full w-full', className)} />;
  }
);

TerminalViewport.displayName = 'TerminalViewport';

export type { TerminalController };
export { TerminalViewport };
