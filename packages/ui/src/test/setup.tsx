import '@testing-library/jest-dom/vitest';
import React from 'react';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
});

vi.mock('@/hooks/useRuntimeAPIs', () => ({
  useRuntimeAPIs: () => ({
    terminal: {
      createSession: vi.fn().mockResolvedValue({ sessionId: 'test-session-id' }),
      connect: vi.fn().mockReturnValue({ close: vi.fn() }),
      sendInput: vi.fn().mockResolvedValue(undefined),
      resize: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      restartSession: vi.fn().mockResolvedValue({ sessionId: 'new-session-id' }),
      forceKill: vi.fn().mockResolvedValue(undefined),
    },
  }),
}));

vi.mock('@/components/terminal/TerminalViewport', () => ({
  TerminalViewport: React.forwardRef<unknown, { onInput?: (data: string) => void; onResize?: (cols: number, rows: number) => void }>(
    function MockTerminalViewport(props) {
      return (
        <div 
          data-testid="terminal-viewport"
          onKeyDown={(e: React.KeyboardEvent) => props.onInput?.(e.key)}
        >
          Mock Terminal Viewport
        </div>
      );
    }
  ),
}));

vi.mock('@/contexts/useThemeSystem', () => ({
  useThemeSystem: () => ({
    currentTheme: {
      colors: {
        bg: { DEFAULT: '#1a1a1a' },
        tx: { DEFAULT: '#ffffff' },
      },
    },
  }),
}));

vi.mock('@/lib/terminalTheme', () => ({
  convertThemeToXterm: () => ({
    background: '#1a1a1a',
    foreground: '#ffffff',
    cursor: '#ffffff',
  }),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

Object.defineProperty(window, 'getComputedStyle', {
  value: () => ({
    getPropertyValue: () => '',
  }),
});

Object.defineProperty(window, 'requestAnimationFrame', {
  value: (callback: FrameRequestCallback) => setTimeout(callback, 0),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  value: (id: number) => clearTimeout(id),
});
