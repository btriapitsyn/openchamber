import { create } from 'zustand';
import type { TerminalSession } from '@/lib/terminalApi';

interface TerminalSessionState {
  sessionId: string;
  terminalSessionId: string | null;
  directory: string;
  isConnecting: boolean;
  buffer: string;
  updatedAt: number;
}

interface TerminalStore {
  // Map of OpenCode session ID → Terminal session state
  sessions: Map<string, TerminalSessionState>;

  // Get terminal session for OpenCode session
  getTerminalSession: (sessionId: string) => TerminalSessionState | undefined;

  // Set terminal session info
  setTerminalSession: (sessionId: string, terminalSession: TerminalSession, directory: string) => void;

  // Update connecting state
  setConnecting: (sessionId: string, isConnecting: boolean) => void;

  // Append terminal output to stored buffer
  appendToBuffer: (sessionId: string, chunk: string) => void;

  // Clear terminal session (but keep history)
  clearTerminalSession: (sessionId: string) => void;

  // Remove terminal session completely
  removeTerminalSession: (sessionId: string) => void;

  // Clear all terminal sessions (useful after server restart)
  clearAllTerminalSessions: () => void;
}

const TERMINAL_BUFFER_LIMIT = 60_000;

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: new Map(),

  getTerminalSession: (sessionId: string) => {
    return get().sessions.get(sessionId);
  },

  setTerminalSession: (sessionId: string, terminalSession: TerminalSession, directory: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(sessionId);
      const shouldResetBuffer =
        !existing ||
        existing.terminalSessionId !== terminalSession.sessionId ||
        existing.directory !== directory;
      const nextBuffer = shouldResetBuffer ? '' : existing?.buffer ?? '';
      newSessions.set(sessionId, {
        sessionId,
        terminalSessionId: terminalSession.sessionId,
        directory,
        isConnecting: false,
        buffer: nextBuffer,
        updatedAt: Date.now(),
      });
      return { sessions: newSessions };
    });
  },

  setConnecting: (sessionId: string, isConnecting: boolean) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(sessionId);
      if (existing) {
        newSessions.set(sessionId, { ...existing, isConnecting, updatedAt: Date.now() });
      } else {
        newSessions.set(sessionId, {
          sessionId,
          terminalSessionId: null,
          directory: '',
          isConnecting,
          buffer: '',
          updatedAt: Date.now(),
        });
      }
      return { sessions: newSessions };
    });
  },

  appendToBuffer: (sessionId: string, chunk: string) => {
    if (!chunk) {
      return;
    }

    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(sessionId);
      if (!existing) {
        return state;
      }

      const nextBuffer = (existing.buffer + chunk).slice(-TERMINAL_BUFFER_LIMIT);
      newSessions.set(sessionId, {
        ...existing,
        buffer: nextBuffer,
        updatedAt: Date.now(),
      });

      return { sessions: newSessions };
    });
  },

  clearTerminalSession: (sessionId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(sessionId);
      if (existing) {
        newSessions.set(sessionId, {
          ...existing,
          terminalSessionId: null,
          isConnecting: false,
          updatedAt: Date.now(),
        });
      }
      return { sessions: newSessions };
    });
  },

  removeTerminalSession: (sessionId: string) => {
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(sessionId);
      return { sessions: newSessions };
    });
  },

  clearAllTerminalSessions: () => {
    set({ sessions: new Map() });
  },
}));
