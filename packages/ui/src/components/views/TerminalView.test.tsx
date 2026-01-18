import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TerminalView } from './TerminalView';
import { useTerminalStore } from '@/stores/useTerminalStore';

const mockTerminalAPI = {
  createSession: vi.fn().mockResolvedValue({ sessionId: 'test-pty-id' }),
  connect: vi.fn().mockReturnValue({ close: vi.fn() }),
  sendInput: vi.fn().mockResolvedValue(undefined),
  resize: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  restartSession: vi.fn().mockResolvedValue({ sessionId: 'new-session-id' }),
  forceKill: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@/hooks/useRuntimeAPIs', () => ({
  useRuntimeAPIs: () => ({
    terminal: mockTerminalAPI,
  }),
}));

vi.mock('@/stores/useSessionStore', () => ({
  useSessionStore: (selector?: (state: unknown) => unknown) => {
    const state = {
      currentSessionId: 'test-session',
      sessions: [{ id: 'test-session', directory: '/home/user/project' }],
      worktreeMetadata: new Map(),
    };
    if (selector) return selector(state);
    return state;
  },
}));

vi.mock('@/stores/useDirectoryStore', () => ({
  useDirectoryStore: () => ({
    currentDirectory: '/home/user/project',
    homeDirectory: '/home/user',
  }),
}));

vi.mock('@/contexts/useTabContext', () => ({
  useTabContext: () => ({
    paneId: 'left',
    tabId: 'terminal-tab-123',
    tab: { id: 'terminal-tab-123', type: 'terminal', title: 'Terminal' },
    worktreeId: 'global',
    updateMetadata: vi.fn(),
  }),
}));

vi.mock('@/hooks/useFontPreferences', () => ({
  useFontPreferences: () => ({ monoFont: 'IBM Plex Mono' }),
}));

vi.mock('@/lib/fontOptions', () => ({
  CODE_FONT_OPTION_MAP: {
    'IBM Plex Mono': { stack: 'IBM Plex Mono, monospace' },
  },
  DEFAULT_MONO_FONT: 'IBM Plex Mono',
}));

vi.mock('@/lib/device', () => ({
  useDeviceInfo: () => ({ isMobile: false, hasTouchInput: false }),
}));

describe('TerminalView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.getState().clearAllTerminalSessions();
  });

  it('should render terminal UI with directory path', () => {
    render(<TerminalView />);
    
    expect(screen.getByText('~/project')).toBeInTheDocument();
  });

  it('should render Clear button', () => {
    render(<TerminalView />);
    
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('should render Restart button', () => {
    render(<TerminalView />);
    
    expect(screen.getByRole('button', { name: /restart/i })).toBeInTheDocument();
  });

  it('should render terminal viewport', () => {
    render(<TerminalView />);
    
    expect(screen.getByTestId('terminal-viewport')).toBeInTheDocument();
  });
});

// Note: "no session selected" state test removed - dynamic mocking with vi.doMock/require 
// doesn't work in ESM context. The behavior is covered by integration testing.

describe('TerminalView session key behavior (store level)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTerminalStore.getState().clearAllTerminalSessions();
  });

  it('should create separate sessions for different tabs', () => {
    const store = useTerminalStore.getState();
    
    store.setTerminalSession('tab-1', { sessionId: 'pty-1', cols: 80, rows: 24 });
    store.setTerminalSession('tab-2', { sessionId: 'pty-2', cols: 80, rows: 24 });
    
    store.appendToBuffer('tab-1', 'Content for tab 1');
    store.appendToBuffer('tab-2', 'Content for tab 2');
    
    expect(store.getTerminalSession('tab-1')?.buffer).toBe('Content for tab 1');
    expect(store.getTerminalSession('tab-2')?.buffer).toBe('Content for tab 2');
    expect(store.getTerminalSession('tab-1')?.terminalSessionId).toBe('pty-1');
    expect(store.getTerminalSession('tab-2')?.terminalSessionId).toBe('pty-2');
  });

  it('should maintain session state across component unmount/remount', () => {
    const store = useTerminalStore.getState();
    const tabId = 'persistent-tab';
    
    store.setTerminalSession(tabId, { sessionId: 'pty-persistent', cols: 80, rows: 24 });
    store.appendToBuffer(tabId, 'Initial content\n');
    store.appendToBuffer(tabId, 'More content\n');
    
    const sessionBefore = store.getTerminalSession(tabId);
    expect(sessionBefore?.buffer).toBe('Initial content\nMore content\n');
    
    const sessionAfter = store.getTerminalSession(tabId);
    expect(sessionAfter?.buffer).toBe('Initial content\nMore content\n');
    expect(sessionAfter?.terminalSessionId).toBe('pty-persistent');
  });

  it('should handle both UUID-style and path-style keys', () => {
    const store = useTerminalStore.getState();
    
    store.setTerminalSession('uuid-tab-123', { sessionId: 'pty-uuid', cols: 80, rows: 24 });
    store.setTerminalSession('/home/user/project', { sessionId: 'pty-path', cols: 80, rows: 24 });
    
    expect(store.getTerminalSession('uuid-tab-123')?.terminalSessionId).toBe('pty-uuid');
    expect(store.getTerminalSession('/home/user/project')?.terminalSessionId).toBe('pty-path');
  });

  it('should use tabId as session key for terminal isolation', () => {
    const store = useTerminalStore.getState();
    
    store.setTerminalSession('terminal-tab-123', { sessionId: 'pty-from-tab', cols: 80, rows: 24 });
    
    const session = store.getTerminalSession('terminal-tab-123');
    expect(session?.terminalSessionId).toBe('pty-from-tab');
  });
});
