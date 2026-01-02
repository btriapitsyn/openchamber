import React from 'react';
import { Ghostty, Terminal as GhosttyTerminal, FitAddon } from 'ghostty-web';

import type { TerminalTheme } from '@/lib/terminalTheme';
import { getGhosttyTerminalOptions } from '@/lib/terminalTheme';
import type { TerminalChunk } from '@/stores/useTerminalStore';
import { cn } from '@/lib/utils';
import { OverlayScrollbar } from '@/components/ui/OverlayScrollbar';

let ghosttyPromise: Promise<Ghostty> | null = null;

function getGhostty(): Promise<Ghostty> {
  if (!ghosttyPromise) {
    ghosttyPromise = Ghostty.load();
  }
  return ghosttyPromise;
}

function findScrollableViewport(container: HTMLElement): HTMLElement | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const candidates = [container, ...Array.from(container.querySelectorAll<HTMLElement>('*'))];
  for (const element of candidates) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') {
      continue;
    }
    if (element.scrollHeight - element.clientHeight > 2) {
      return element;
    }
  }

  return null;
}

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
    const viewportRef = React.useRef<HTMLElement | null>(null);
    const terminalRef = React.useRef<GhosttyTerminal | null>(null);
    const fitAddonRef = React.useRef<FitAddon | null>(null);
    const inputHandlerRef = React.useRef<(data: string) => void>(onInput);
    const resizeHandlerRef = React.useRef<(cols: number, rows: number) => void>(onResize);
    const writeQueueRef = React.useRef<string[]>([]);
    const isWritingRef = React.useRef(false);
    const processedCountRef = React.useRef(0);
    const firstChunkIdRef = React.useRef<number | null>(null);
    const touchScrollCleanupRef = React.useRef<(() => void) | null>(null);
    const [, forceRender] = React.useReducer((x) => x + 1, 0);

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
      } catch { /* ignored */ }
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
      if (!container) {
        return;
      }

      let viewport = viewportRef.current;
      if (!viewport) {
        viewport = findScrollableViewport(container);
        if (viewport) {
          viewportRef.current = viewport;
        }
      }
      if (!viewport) {
        return;
      }

      const baseScrollMultiplier = 2.2;
      const maxScrollBoost = 2.8;
      const boostDenominator = 25;
      const velocityAlpha = 0.25;
      const maxVelocity = 8;
      const minVelocity = 0.05;
      const deceleration = 0.015;

      const state = {
        lastY: null as number | null,
        lastTime: null as number | null,
        velocity: 0,
        rafId: null as number | null,
      };

      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

      const getMaxScrollTop = () => Math.max(0, viewport.scrollHeight - viewport.clientHeight);

      const setScrollTop = (nextScrollTop: number) => {
        const maxScrollTop = getMaxScrollTop();
        viewport.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
      };

      const scrollByPixels = (deltaPixels: number) => {
        if (!deltaPixels) {
          return;
        }
        const previous = viewport.scrollTop;
        setScrollTop(previous + deltaPixels);
        return viewport.scrollTop !== previous;
      };

      const stopKinetic = () => {
        if (state.rafId !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(state.rafId);
        }
        state.rafId = null;
      };

      const listenerOptions: AddEventListenerOptions = { passive: false, capture: true };
      const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

      if (supportsPointerEvents) {
        const stateWithPointerId = Object.assign(state, { pointerId: null as number | null });

        const handlePointerDown = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') {
            return;
          }
          stopKinetic();
          stateWithPointerId.pointerId = event.pointerId;
          stateWithPointerId.lastY = event.clientY;
          stateWithPointerId.lastTime = nowMs();
          stateWithPointerId.velocity = 0;
          try {
            container.setPointerCapture(event.pointerId);
          } catch { /* ignored */ }
        };

        const handlePointerMove = (event: PointerEvent) => {
          if (event.pointerType !== 'touch' || stateWithPointerId.pointerId !== event.pointerId) {
            return;
          }

          if (stateWithPointerId.lastY === null) {
            stateWithPointerId.lastY = event.clientY;
            stateWithPointerId.lastTime = nowMs();
            return;
          }

          const previousY = stateWithPointerId.lastY;
          const previousTime = stateWithPointerId.lastTime ?? nowMs();
          const currentTime = nowMs();
          stateWithPointerId.lastY = event.clientY;
          stateWithPointerId.lastTime = currentTime;

          const deltaY = previousY - event.clientY;
          if (Math.abs(deltaY) < 1) {
            return;
          }

          const dt = Math.max(currentTime - previousTime, 8);
          const scrollMultiplier = baseScrollMultiplier + Math.min(maxScrollBoost, Math.abs(deltaY) / boostDenominator);
          const deltaPixels = deltaY * scrollMultiplier;
          const instantVelocity = deltaPixels / dt;
          stateWithPointerId.velocity = stateWithPointerId.velocity * (1 - velocityAlpha) + instantVelocity * velocityAlpha;

          if (stateWithPointerId.velocity > maxVelocity) {
            stateWithPointerId.velocity = maxVelocity;
          } else if (stateWithPointerId.velocity < -maxVelocity) {
            stateWithPointerId.velocity = -maxVelocity;
          }

          if (event.cancelable) {
            event.preventDefault();
          }
          event.stopPropagation();
          scrollByPixels(deltaPixels);
        };

        const handlePointerUp = (event: PointerEvent) => {
          if (event.pointerType !== 'touch' || stateWithPointerId.pointerId !== event.pointerId) {
            return;
          }
          stateWithPointerId.pointerId = null;
          stateWithPointerId.lastY = null;
          stateWithPointerId.lastTime = null;
          try {
            container.releasePointerCapture(event.pointerId);
          } catch { /* ignored */ }

          if (typeof window === 'undefined') {
            return;
          }

          if (Math.abs(stateWithPointerId.velocity) < minVelocity) {
            stateWithPointerId.velocity = 0;
            return;
          }

          let lastFrame = nowMs();
          const step = () => {
            const frameTime = nowMs();
            const dt = Math.max(frameTime - lastFrame, 8);
            lastFrame = frameTime;

            const moved = scrollByPixels(stateWithPointerId.velocity * dt) ?? false;

            const sign = Math.sign(stateWithPointerId.velocity);
            const nextMagnitude = Math.max(0, Math.abs(stateWithPointerId.velocity) - deceleration * dt);
            stateWithPointerId.velocity = nextMagnitude * sign;

            if (!moved || nextMagnitude <= minVelocity) {
              stopKinetic();
              stateWithPointerId.velocity = 0;
              return;
            }

            stateWithPointerId.rafId = window.requestAnimationFrame(step);
          };

          stateWithPointerId.rafId = window.requestAnimationFrame(step);
        };

        container.addEventListener('pointerdown', handlePointerDown, listenerOptions);
        container.addEventListener('pointermove', handlePointerMove, listenerOptions);
        container.addEventListener('pointerup', handlePointerUp, listenerOptions);
        container.addEventListener('pointercancel', handlePointerUp, listenerOptions);

        const previousTouchAction = container.style.touchAction;
        container.style.touchAction = 'none';

        touchScrollCleanupRef.current = () => {
          stopKinetic();
          container.removeEventListener('pointerdown', handlePointerDown, listenerOptions);
          container.removeEventListener('pointermove', handlePointerMove, listenerOptions);
          container.removeEventListener('pointerup', handlePointerUp, listenerOptions);
          container.removeEventListener('pointercancel', handlePointerUp, listenerOptions);
          container.style.touchAction = previousTouchAction;
        };

        return;
      }

      const handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          return;
        }
        stopKinetic();
        state.lastY = event.touches[0].clientY;
        state.lastTime = nowMs();
        state.velocity = 0;
      };

      const handleTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          state.lastY = null;
          state.lastTime = null;
          state.velocity = 0;
          stopKinetic();
          return;
        }

        const currentY = event.touches[0].clientY;
        if (state.lastY === null) {
          state.lastY = currentY;
          state.lastTime = nowMs();
          return;
        }

        const previousY = state.lastY;
        const previousTime = state.lastTime ?? nowMs();
        const currentTime = nowMs();
        state.lastY = currentY;
        state.lastTime = currentTime;

        const deltaY = previousY - currentY;
        if (Math.abs(deltaY) < 1) {
          return;
        }

        const dt = Math.max(currentTime - previousTime, 8);
        const scrollMultiplier = baseScrollMultiplier + Math.min(maxScrollBoost, Math.abs(deltaY) / boostDenominator);
        const deltaPixels = deltaY * scrollMultiplier;
        const instantVelocity = deltaPixels / dt;
        state.velocity = state.velocity * (1 - velocityAlpha) + instantVelocity * velocityAlpha;

        if (state.velocity > maxVelocity) {
          state.velocity = maxVelocity;
        } else if (state.velocity < -maxVelocity) {
          state.velocity = -maxVelocity;
        }

        event.preventDefault();
        event.stopPropagation();
        scrollByPixels(deltaPixels);
      };

      const handleTouchEnd = () => {
        state.lastY = null;
        state.lastTime = null;

        if (typeof window === 'undefined') {
          return;
        }

        if (Math.abs(state.velocity) < minVelocity) {
          state.velocity = 0;
          return;
        }

        let lastFrame = nowMs();
        const step = () => {
          const frameTime = nowMs();
          const dt = Math.max(frameTime - lastFrame, 8);
          lastFrame = frameTime;

          const moved = scrollByPixels(state.velocity * dt) ?? false;

          const sign = Math.sign(state.velocity);
          const nextMagnitude = Math.max(0, Math.abs(state.velocity) - deceleration * dt);
          state.velocity = nextMagnitude * sign;

          if (!moved || nextMagnitude <= minVelocity) {
            stopKinetic();
            state.velocity = 0;
            return;
          }

          state.rafId = window.requestAnimationFrame(step);
        };

        state.rafId = window.requestAnimationFrame(step);
      };

      container.addEventListener('touchstart', handleTouchStart, listenerOptions);
      container.addEventListener('touchmove', handleTouchMove, listenerOptions);
      container.addEventListener('touchend', handleTouchEnd, listenerOptions);
      container.addEventListener('touchcancel', handleTouchEnd, listenerOptions);

      const previousTouchAction = container.style.touchAction;
      container.style.touchAction = 'none';

      touchScrollCleanupRef.current = () => {
        stopKinetic();
        container.removeEventListener('touchstart', handleTouchStart, listenerOptions);
        container.removeEventListener('touchmove', handleTouchMove, listenerOptions);
        container.removeEventListener('touchend', handleTouchEnd, listenerOptions);
        container.removeEventListener('touchcancel', handleTouchEnd, listenerOptions);
        container.style.touchAction = previousTouchAction;
      };
    }, [enableTouchScroll]);

    React.useEffect(() => {
      let disposed = false;
      let localTerminal: GhosttyTerminal | null = null;
      let localResizeObserver: ResizeObserver | null = null;
      let localDisposables: Array<{ dispose: () => void }> = [];

      const container = containerRef.current;
      if (!container) {
        return;
      }

      container.tabIndex = -1;

      const initialize = async () => {
        try {
          const ghostty = await getGhostty();
          if (disposed) {
            return;
          }

          const options = getGhosttyTerminalOptions(fontFamily, fontSize, theme, ghostty);

          const terminal = new GhosttyTerminal(options);

          const fitAddon = new FitAddon();

          localTerminal = terminal;
          terminalRef.current = terminal;
          fitAddonRef.current = fitAddon;

          terminal.loadAddon(fitAddon);
          terminal.open(container);

          const viewport = findScrollableViewport(container);
          if (viewport) {
            viewport.classList.add('overlay-scrollbar-target', 'overlay-scrollbar-container');
            viewportRef.current = viewport;
            forceRender();
          } else {
            viewportRef.current = null;
          }

          fitTerminal();
          setupTouchScroll();
          terminal.focus();

          localDisposables = [
            terminal.onData((data: string) => {
              inputHandlerRef.current(data);
            }),
          ];

          localResizeObserver = new ResizeObserver(() => {
            fitTerminal();
          });
          localResizeObserver.observe(container);

          if (typeof window !== 'undefined') {
            window.setTimeout(() => {
              fitTerminal();
            }, 0);
          }
        } catch {
          // ignored
        }
      };

      void initialize();

      return () => {
        disposed = true;
        touchScrollCleanupRef.current?.();
        touchScrollCleanupRef.current = null;

        localDisposables.forEach((disposable) => disposable.dispose());
        localResizeObserver?.disconnect();

        localTerminal?.dispose();
        terminalRef.current = null;
        fitAddonRef.current = null;
        viewportRef.current = null;
        resetWriteState();
      };
    }, [fitTerminal, fontFamily, fontSize, setupTouchScroll, theme, resetWriteState]);


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

    return (
      <div ref={containerRef} className={cn('relative h-full w-full', className)}>
        {viewportRef.current ? (
          <OverlayScrollbar
            containerRef={viewportRef}
            disableHorizontal
            className="overlay-scrollbar--flush overlay-scrollbar--dense overlay-scrollbar--zero"
          />
        ) : null}
      </div>
    );
  }
);

TerminalViewport.displayName = 'TerminalViewport';

export type { TerminalController };
export { TerminalViewport };
