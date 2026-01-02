import { create } from 'zustand';
import type { TerminalSession } from '@/lib/terminalApi';

export interface TerminalChunk {
  id: number;
  data: string;
}

interface TerminalSessionState {
  directory: string;
  terminalSessionId: string | null;
  isConnecting: boolean;
  buffer: string;
  bufferChunks: TerminalChunk[];
  bufferLength: number;
  updatedAt: number;
}

interface TerminalStore {
  sessions: Map<string, TerminalSessionState>;
  nextChunkId: number;

  getTerminalSession: (directory: string) => TerminalSessionState | undefined;
  setTerminalSession: (directory: string, terminalSession: TerminalSession) => void;
  setConnecting: (directory: string, isConnecting: boolean) => void;
  appendToBuffer: (directory: string, chunk: string) => void;
  clearTerminalSession: (directory: string) => void;
  clearBuffer: (directory: string) => void;
  removeTerminalSession: (directory: string) => void;
  clearAllTerminalSessions: () => void;
}

const TERMINAL_BUFFER_LIMIT = 1_000_000;

function normalizeDirectory(dir: string): string {
  let normalized = dir.trim();
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

const createEmptySessionState = (directory: string): TerminalSessionState => ({
  directory,
  terminalSessionId: null,
  isConnecting: false,
  buffer: '',
  bufferChunks: [],
  bufferLength: 0,
  updatedAt: Date.now(),
});

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  sessions: new Map(),
  nextChunkId: 1,

  getTerminalSession: (directory: string) => {
    const key = normalizeDirectory(directory);
    return get().sessions.get(key);
  },

  setTerminalSession: (directory: string, terminalSession: TerminalSession) => {
    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(key);
      const shouldResetBuffer =
        !existing ||
        existing.terminalSessionId !== terminalSession.sessionId;

      const baseState = shouldResetBuffer
        ? createEmptySessionState(key)
        : existing ?? createEmptySessionState(key);

      newSessions.set(key, {
        ...baseState,
        terminalSessionId: terminalSession.sessionId,
        directory: key,
        isConnecting: false,
        updatedAt: Date.now(),
      });

      return { sessions: newSessions };
    });
  },

  setConnecting: (directory: string, isConnecting: boolean) => {
    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(key) ?? createEmptySessionState(key);
      newSessions.set(key, {
        ...existing,
        isConnecting,
        updatedAt: Date.now(),
      });
      return { sessions: newSessions };
    });
  },

  appendToBuffer: (directory: string, chunk: string) => {
    if (!chunk) {
      return;
    }

    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(key) ?? createEmptySessionState(key);

      const chunkId = state.nextChunkId;
      const chunkEntry: TerminalChunk = { id: chunkId, data: chunk };

      const bufferChunks = [...existing.bufferChunks, chunkEntry];
      let bufferLength = existing.bufferLength + chunk.length;

      while (bufferLength > TERMINAL_BUFFER_LIMIT && bufferChunks.length > 1) {
        const removed = bufferChunks.shift();
        if (!removed) {
          break;
        }
        bufferLength -= removed.data.length;
      }

      const buffer = bufferChunks.map((entry) => entry.data).join('');

      newSessions.set(key, {
        ...existing,
        buffer,
        bufferChunks,
        bufferLength,
        updatedAt: Date.now(),
      });

      return { sessions: newSessions, nextChunkId: chunkId + 1 };
    });
  },

  clearTerminalSession: (directory: string) => {
    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(key);
      if (existing) {
        newSessions.set(key, {
          ...existing,
          terminalSessionId: null,
          isConnecting: false,
          updatedAt: Date.now(),
        });
      }
      return { sessions: newSessions };
    });
  },

  clearBuffer: (directory: string) => {
    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      const existing = newSessions.get(key);
      if (!existing) {
        return state;
      }
      newSessions.set(key, {
        ...existing,
        buffer: '',
        bufferChunks: [],
        bufferLength: 0,
        updatedAt: Date.now(),
      });
      return { sessions: newSessions };
    });
  },

  removeTerminalSession: (directory: string) => {
    const key = normalizeDirectory(directory);
    set((state) => {
      const newSessions = new Map(state.sessions);
      newSessions.delete(key);
      return { sessions: newSessions };
    });
  },

  clearAllTerminalSessions: () => {
    set({ sessions: new Map(), nextChunkId: 1 });
  },
}));
