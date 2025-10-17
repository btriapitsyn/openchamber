import React from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

import type { TerminalTheme } from '@/lib/terminalTheme';
import { getTerminalOptions } from '@/lib/terminalTheme';
import { cn } from '@/lib/utils';

type TerminalController = {
  focus: () => void;
  clear: () => void;
  fit: () => void;
};

interface TerminalViewportProps {
  sessionKey: string;
  buffer: string;
  onInput: (data: string) => void;
  onResize: (cols: number, rows: number) => void;
  theme: TerminalTheme;
  fontFamily: string;
  fontSize: number;
  className?: string;
}

const CHUNK_SIZE = 2048;

const TerminalViewport = React.forwardRef<TerminalController, TerminalViewportProps>(
  ({ sessionKey, buffer, onInput, onResize, theme, fontFamily, fontSize, className }, ref) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const terminalRef = React.useRef<Terminal | null>(null);
    const fitAddonRef = React.useRef<FitAddon | null>(null);
    const prevBufferRef = React.useRef<string>('');
    const inputHandlerRef = React.useRef<(data: string) => void>(onInput);
    const resizeHandlerRef = React.useRef<(cols: number, rows: number) => void>(onResize);
    const bufferRef = React.useRef<string>(buffer);
    const writeQueueRef = React.useRef<string[]>([]);
    const isWritingRef = React.useRef(false);

    inputHandlerRef.current = onInput;
    resizeHandlerRef.current = onResize;
    bufferRef.current = buffer;

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
        // Ignore fit errors caused by zero-sized containers
      }
    }, []);

    const flushWriteQueue = React.useCallback(() => {
      const terminal = terminalRef.current;
      if (!terminal) {
        writeQueueRef.current = [];
        isWritingRef.current = false;
        return;
      }
      if (isWritingRef.current) {
        return;
      }

      const scheduleNext = () => {
        const term = terminalRef.current;
        if (!term) {
          writeQueueRef.current = [];
          isWritingRef.current = false;
          return;
        }
        const chunk = writeQueueRef.current.shift();
        if (chunk === undefined) {
          isWritingRef.current = false;
          return;
        }

        isWritingRef.current = true;
        term.write(chunk, () => {
          if (writeQueueRef.current.length > 0) {
            if (typeof window !== 'undefined') {
              window.requestAnimationFrame(scheduleNext);
            } else {
              scheduleNext();
            }
          } else {
            isWritingRef.current = false;
          }
        });
      };

      scheduleNext();
    }, []);

    const enqueueWrite = React.useCallback(
      (data: string) => {
        if (!data || data.length === 0) {
          return;
        }
        const queue = writeQueueRef.current;
        for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
          queue.push(data.slice(offset, offset + CHUNK_SIZE));
        }
        if (!isWritingRef.current) {
          flushWriteQueue();
        }
      },
      [flushWriteQueue]
    );

    React.useEffect(() => {
        const terminal = new Terminal(
            getTerminalOptions(fontFamily, fontSize, theme)
        );
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
            disposables.forEach((disposable) => disposable.dispose());
            resizeObserver.disconnect();
            terminal.dispose();
            terminalRef.current = null;
            fitAddonRef.current = null;
            prevBufferRef.current = '';
            writeQueueRef.current = [];
            isWritingRef.current = false;
        };
    }, [fitTerminal, fontFamily, fontSize, theme]);

    React.useEffect(() => {
        const terminal = terminalRef.current;
        if (!terminal) {
            return;
        }
        const options = getTerminalOptions(fontFamily, fontSize, theme);
        Object.assign(terminal.options as any, options);
        fitTerminal();
    }, [fitTerminal, fontFamily, fontSize, theme]);

    React.useEffect(() => {
        const terminal = terminalRef.current;
        if (!terminal) {
            return;
        }

        terminal.reset();
        prevBufferRef.current = '';
        writeQueueRef.current = [];
        isWritingRef.current = false;
        const snapshot = bufferRef.current;
        if (snapshot) {
            enqueueWrite(snapshot);
            prevBufferRef.current = snapshot;
        }
        fitTerminal();
        terminal.focus();
    }, [sessionKey, fitTerminal, enqueueWrite]);

    React.useEffect(() => {
        const terminal = terminalRef.current;
        if (!terminal) {
            return;
      }

      const previous = prevBufferRef.current;
      if (buffer === previous) {
        return;
      }

      if (buffer.startsWith(previous)) {
        const diff = buffer.slice(previous.length);
        if (diff) {
          enqueueWrite(diff);
        }
      } else {
        terminal.reset();
        writeQueueRef.current = [];
        isWritingRef.current = false;
        if (buffer) {
          enqueueWrite(buffer);
        }
      }

      prevBufferRef.current = buffer;
    }, [buffer, enqueueWrite]);

    React.useImperativeHandle(
      ref,
      (): TerminalController => ({
        focus: () => {
          terminalRef.current?.focus();
        },
        clear: () => {
          terminalRef.current?.reset();
          prevBufferRef.current = '';
          writeQueueRef.current = [];
          isWritingRef.current = false;
          fitTerminal();
        },
        fit: () => {
          fitTerminal();
        },
      }),
      [fitTerminal]
    );

    return <div ref={containerRef} className={cn('h-full w-full', className)} />;
  }
);

TerminalViewport.displayName = 'TerminalViewport';

export type { TerminalController };
export { TerminalViewport };
