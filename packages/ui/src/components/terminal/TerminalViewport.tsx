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
  let fallback: HTMLElement | null = null;

  for (const element of candidates) {
    const style = window.getComputedStyle(element);
    const overflowY = style.overflowY;
    if (overflowY !== 'auto' && overflowY !== 'scroll') {
      continue;
    }

    // Prefer an element that is currently scrollable.
    if (element.scrollHeight - element.clientHeight > 2) {
      return element;
    }

    // Otherwise keep the first overflow container as a fallback so we can
    // attach touch scroll before scrollback grows.
    if (!fallback) {
      fallback = element;
    }
  }

  return fallback;
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
    const lastReportedSizeRef = React.useRef<{ cols: number; rows: number } | null>(null);
    const pendingWriteRef = React.useRef('');
    const writeScheduledRef = React.useRef<number | null>(null);
    const isWritingRef = React.useRef(false);
    const lastProcessedChunkIdRef = React.useRef<number | null>(null);
    const touchScrollCleanupRef = React.useRef<(() => void) | null>(null);
    const viewportDiscoveryTimeoutRef = React.useRef<number | null>(null);
    const viewportDiscoveryAttemptsRef = React.useRef(0);
    const hiddenInputRef = React.useRef<HTMLTextAreaElement | null>(null);
    const [, forceRender] = React.useReducer((x) => x + 1, 0);
    const [terminalReadyVersion, bumpTerminalReady] = React.useReducer((x) => x + 1, 0);

    inputHandlerRef.current = onInput;
    resizeHandlerRef.current = onResize;

    const focusHiddenInput = React.useCallback((clientX?: number, clientY?: number) => {
      const input = hiddenInputRef.current;
      const container = containerRef.current;
      if (!input || !container) {
        return;
      }

      // Position the input near the user's tap/cursor so the global keyboard
      // avoidance logic can decide whether anything is actually obscured.
      const rect = container.getBoundingClientRect();
      const fallbackX = rect.left + rect.width / 2;
      const fallbackY = rect.top + rect.height - 12;
      const x = typeof clientX === 'number' ? clientX : fallbackX;
      const y = typeof clientY === 'number' ? clientY : fallbackY;

      const padding = 8;
      const left = Math.max(padding, Math.min(rect.width - padding, x - rect.left));
      const top = Math.max(padding, Math.min(rect.height - padding, y - rect.top));

      input.style.left = `${left}px`;
      input.style.top = `${top}px`;
      input.style.bottom = '';

      try {
        input.focus({ preventScroll: true });
      } catch {
        try {
          input.focus();
        } catch { /* ignored */ }
      }
    }, []);

    const resetWriteState = React.useCallback(() => {
      pendingWriteRef.current = '';
      if (writeScheduledRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(writeScheduledRef.current);
      }
      writeScheduledRef.current = null;
      isWritingRef.current = false;
      lastProcessedChunkIdRef.current = null;
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
        const next = { cols: terminal.cols, rows: terminal.rows };
        const previous = lastReportedSizeRef.current;
        if (!previous || previous.cols !== next.cols || previous.rows !== next.rows) {
          lastReportedSizeRef.current = next;
          resizeHandlerRef.current(next.cols, next.rows);
        }
      } catch { /* ignored */ }
    }, []);

    const flushWrites = React.useCallback(() => {
      if (isWritingRef.current) {
        return;
      }

      const term = terminalRef.current;
      if (!term) {
        resetWriteState();
        return;
      }

      if (!pendingWriteRef.current) {
        return;
      }

      const chunk = pendingWriteRef.current;
      pendingWriteRef.current = '';

      isWritingRef.current = true;
      term.write(chunk, () => {
        isWritingRef.current = false;
        if (pendingWriteRef.current) {
          if (typeof window !== 'undefined') {
            writeScheduledRef.current = window.requestAnimationFrame(() => {
              writeScheduledRef.current = null;
              flushWrites();
            });
          } else {
            flushWrites();
          }
        }
      });
    }, [resetWriteState]);

    const scheduleFlushWrites = React.useCallback(() => {
      if (writeScheduledRef.current !== null) {
        return;
      }
      if (typeof window !== 'undefined') {
        writeScheduledRef.current = window.requestAnimationFrame(() => {
          writeScheduledRef.current = null;
          flushWrites();
        });
      } else {
        flushWrites();
      }
    }, [flushWrites]);

    const enqueueWrite = React.useCallback(
      (data: string) => {
        if (!data) {
          return;
        }
        pendingWriteRef.current += data;
        scheduleFlushWrites();
      },
      [scheduleFlushWrites]
    );

    const setupTouchScroll = React.useCallback(() => {
      touchScrollCleanupRef.current?.();
      touchScrollCleanupRef.current = null;

      if (viewportDiscoveryTimeoutRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(viewportDiscoveryTimeoutRef.current);
        viewportDiscoveryTimeoutRef.current = null;
      }

      if (!enableTouchScroll) {
        viewportDiscoveryAttemptsRef.current = 0;
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      // Ghostty scrollback is internal (canvas-based). On touch devices we need
      // to translate touch deltas into terminal scroll calls.
      const terminal = terminalRef.current;
      if (!terminal) {
        return;
      }

      viewportDiscoveryAttemptsRef.current = 0;

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
        startX: null as number | null,
        startY: null as number | null,
        didMove: false,
      };

      const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

      const lineHeightPx = Math.max(12, Math.round(fontSize * 1.35));
      let remainderPx = 0;

      const scrollByPixels = (deltaPixels: number) => {
        if (!deltaPixels) {
          return false;
        }

        const before = terminal.getViewportY();

        const total = remainderPx + deltaPixels;
        const lines = Math.trunc(total / lineHeightPx);
        remainderPx = total - lines * lineHeightPx;

        if (lines !== 0) {
          // Touch delta is in pixels, convert to lines.
          // Natural mobile scrolling: finger up scrolls down.
          terminal.scrollLines(lines);
        }

        const after = terminal.getViewportY();
        return after !== before;
      };

      const stopKinetic = () => {
        if (state.rafId !== null && typeof window !== 'undefined') {
          window.cancelAnimationFrame(state.rafId);
        }
        state.rafId = null;
      };

      const listenerOptions: AddEventListenerOptions = { passive: false, capture: false };
      const supportsPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;

      if (supportsPointerEvents) {
        const stateWithPointerId = Object.assign(state, {
          pointerId: null as number | null,
          startX: null as number | null,
          startY: null as number | null,
          moved: false,
        });

        const TAP_MOVE_THRESHOLD_PX = 6;

        const handlePointerDown = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') {
            return;
          }
          stopKinetic();
          stateWithPointerId.pointerId = event.pointerId;
          stateWithPointerId.startX = event.clientX;
          stateWithPointerId.startY = event.clientY;
          stateWithPointerId.moved = false;
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

          if (stateWithPointerId.startX !== null && stateWithPointerId.startY !== null && !stateWithPointerId.moved) {
            const dx = event.clientX - stateWithPointerId.startX;
            const dy = event.clientY - stateWithPointerId.startY;
            if (Math.hypot(dx, dy) >= TAP_MOVE_THRESHOLD_PX) {
              stateWithPointerId.moved = true;
            }
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

          // Only prevent default once we're actually scrolling.
          if (stateWithPointerId.moved) {
            if (event.cancelable) {
              event.preventDefault();
            }
            event.stopPropagation();
          }

          scrollByPixels(deltaPixels);
        };

        const handlePointerUp = (event: PointerEvent) => {
          if (event.pointerType !== 'touch' || stateWithPointerId.pointerId !== event.pointerId) {
            return;
          }

          const wasTap = !stateWithPointerId.moved;

          stateWithPointerId.pointerId = null;
          stateWithPointerId.startX = null;
          stateWithPointerId.startY = null;
          stateWithPointerId.moved = false;
          stateWithPointerId.lastY = null;
          stateWithPointerId.lastTime = null;
          try {
            container.releasePointerCapture(event.pointerId);
          } catch { /* ignored */ }

          if (wasTap) {
            focusHiddenInput(event.clientX, event.clientY);
            return;
          }

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
        container.style.touchAction = 'manipulation';

        touchScrollCleanupRef.current = () => {
          stopKinetic();
          if (viewportDiscoveryTimeoutRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(viewportDiscoveryTimeoutRef.current);
            viewportDiscoveryTimeoutRef.current = null;
          }
          viewportDiscoveryAttemptsRef.current = 0;
          container.removeEventListener('pointerdown', handlePointerDown, listenerOptions);
          container.removeEventListener('pointermove', handlePointerMove, listenerOptions);
          container.removeEventListener('pointerup', handlePointerUp, listenerOptions);
          container.removeEventListener('pointercancel', handlePointerUp, listenerOptions);
          container.style.touchAction = previousTouchAction;
        };

        return;
      }

      const TAP_MOVE_THRESHOLD_PX = 6;

      const handleTouchStart = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          return;
        }
        stopKinetic();
        state.lastY = event.touches[0].clientY;
        state.lastTime = nowMs();
        state.velocity = 0;
        state.startX = event.touches[0].clientX;
        state.startY = event.touches[0].clientY;
        state.didMove = false;
      };

      const handleTouchMove = (event: TouchEvent) => {
        if (event.touches.length !== 1) {
          state.lastY = null;
          state.lastTime = null;
          state.velocity = 0;
          state.startX = null;
          state.startY = null;
          state.didMove = false;
          stopKinetic();
          return;
        }

        const currentX = event.touches[0].clientX;
        const currentY = event.touches[0].clientY;

        if (state.startX !== null && state.startY !== null && !state.didMove) {
          const dx = currentX - state.startX;
          const dy = currentY - state.startY;
          if (Math.hypot(dx, dy) >= TAP_MOVE_THRESHOLD_PX) {
            state.didMove = true;
          }
        }

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

        if (state.didMove) {
          event.preventDefault();
          event.stopPropagation();
        }

        scrollByPixels(deltaPixels);
      };

        const handleTouchEnd = (event: TouchEvent) => {
        const wasTap = !state.didMove;


        state.lastY = null;
        state.lastTime = null;

        const velocity = state.velocity;
        state.startX = null;
        state.startY = null;
        state.didMove = false;

        if (wasTap) {
          const point = event.changedTouches?.[0];
          focusHiddenInput(point?.clientX, point?.clientY);
          return;
        }

        if (typeof window === 'undefined') {
          return;
        }

        if (Math.abs(velocity) < minVelocity) {
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
      container.addEventListener('touchend', handleTouchEnd as unknown as EventListener, listenerOptions);
      container.addEventListener('touchcancel', handleTouchEnd as unknown as EventListener, listenerOptions);

      const previousTouchAction = container.style.touchAction;
      container.style.touchAction = 'manipulation';

      touchScrollCleanupRef.current = () => {
        stopKinetic();
        if (viewportDiscoveryTimeoutRef.current !== null && typeof window !== 'undefined') {
          window.clearTimeout(viewportDiscoveryTimeoutRef.current);
          viewportDiscoveryTimeoutRef.current = null;
        }
        viewportDiscoveryAttemptsRef.current = 0;
        container.removeEventListener('touchstart', handleTouchStart, listenerOptions);
        container.removeEventListener('touchmove', handleTouchMove, listenerOptions);
        container.removeEventListener('touchend', handleTouchEnd as unknown as EventListener, listenerOptions);
        container.removeEventListener('touchcancel', handleTouchEnd as unknown as EventListener, listenerOptions);
        container.style.touchAction = previousTouchAction;
      };
    }, [enableTouchScroll, focusHiddenInput, fontSize]);

    React.useEffect(() => {
      let disposed = false;
      let localTerminal: GhosttyTerminal | null = null;
      let localResizeObserver: ResizeObserver | null = null;
      let localDisposables: Array<{ dispose: () => void }> = [];

      const container = containerRef.current;
      if (!container) {
        return;
      }

      container.tabIndex = 0;

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
          bumpTerminalReady();

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
        lastReportedSizeRef.current = null;
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
      lastReportedSizeRef.current = null;
      fitTerminal();
      terminal.focus();
    }, [sessionKey, terminalReadyVersion, fitTerminal, resetWriteState]);

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
        if (lastProcessedChunkIdRef.current !== null) {
          terminal.reset();
          resetWriteState();
          fitTerminal();
        }
        return;
      }

      const lastProcessedId = lastProcessedChunkIdRef.current;
      let pending: TerminalChunk[];

      if (lastProcessedId === null) {
        pending = chunks;
      } else {
        const lastProcessedIndex = chunks.findIndex((chunk) => chunk.id === lastProcessedId);
        pending = lastProcessedIndex >= 0 ? chunks.slice(lastProcessedIndex + 1) : chunks;
      }

      if (pending.length > 0) {
        enqueueWrite(pending.map((chunk) => chunk.data).join(''));
      }

      lastProcessedChunkIdRef.current = chunks[chunks.length - 1].id;
    }, [chunks, terminalReadyVersion, enqueueWrite, fitTerminal, resetWriteState]);

    React.useImperativeHandle(
      ref,
      (): TerminalController => ({
        focus: () => {
          if (enableTouchScroll) {
            focusHiddenInput();
            return;
          }
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
      [enableTouchScroll, focusHiddenInput, fitTerminal, resetWriteState]
    );

    return (
      <div
        ref={containerRef}
        className={cn('relative h-full w-full', className)}
        style={{ backgroundColor: theme.background }}
        onClick={(event) => {
          if (enableTouchScroll) {
            focusHiddenInput(event.clientX, event.clientY);
          } else {
            terminalRef.current?.focus();
          }
        }}
      >
        {enableTouchScroll ? (
          <textarea
            ref={hiddenInputRef}
            inputMode="text"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            tabIndex={-1}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1,
              height: 1,
              opacity: 0.001,
              zIndex: 1,
              background: 'transparent',
              color: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              outline: 'none',
            }}
            onInput={(event) => {
              const raw = String(event.currentTarget.value || '');
              if (!raw) {
                return;
              }

              // iOS often inserts `\n` for Enter; the PTY expects CR.
              const value = raw.replace(/\r\n|\r|\n/g, '\r');
              inputHandlerRef.current(value);
              event.currentTarget.value = '';
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace') {
                // If there's nothing in the input buffer, emulate DEL.
                if (!event.currentTarget.value) {
                  inputHandlerRef.current('\x7f');
                }
              }
            }}
          />
        ) : null}
        {viewportRef.current && !enableTouchScroll ? (
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
