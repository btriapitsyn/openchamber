import { describe, it, expect, beforeEach } from 'vitest';
import { useTerminalStore } from './useTerminalStore';

describe('useTerminalStore', () => {
  beforeEach(() => {
    useTerminalStore.getState().clearAllTerminalSessions();
  });

  describe('normalizeDirectory', () => {
    it('should normalize directory paths by removing trailing slashes', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user/', { sessionId: 'test-1', cols: 80, rows: 24 });
      
      expect(store.getTerminalSession('/home/user')).toBeDefined();
      expect(store.getTerminalSession('/home/user/')?.terminalSessionId).toBe('test-1');
    });

    it('should trim whitespace from directory paths', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('  /home/user  ', { sessionId: 'test-1', cols: 80, rows: 24 });
      
      expect(store.getTerminalSession('/home/user')?.terminalSessionId).toBe('test-1');
    });

    it('should handle root directory correctly', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/', { sessionId: 'root-session', cols: 80, rows: 24 });
      
      expect(store.getTerminalSession('/')?.terminalSessionId).toBe('root-session');
    });
  });

  describe('setTerminalSession', () => {
    it('should create a new terminal session', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-123', cols: 80, rows: 24 });
      
      const session = store.getTerminalSession('/home/user');
      expect(session).toBeDefined();
      expect(session?.terminalSessionId).toBe('session-123');
      expect(session?.isConnecting).toBe(false);
      expect(session?.bufferChunks).toEqual([]);
      expect(session?.bufferLength).toBe(0);
    });

    it('should reset buffer when session ID changes', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello World');
      
      expect(store.getTerminalSession('/home/user')?.bufferLength).toBeGreaterThan(0);
      
      store.setTerminalSession('/home/user', { sessionId: 'session-2', cols: 80, rows: 24 });
      
      expect(store.getTerminalSession('/home/user')?.bufferLength).toBe(0);
      expect(store.getTerminalSession('/home/user')?.terminalSessionId).toBe('session-2');
    });

    it('should preserve buffer when session ID is the same', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello World');
      
      const originalLength = store.getTerminalSession('/home/user')?.bufferLength ?? 0;
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      
      expect(store.getTerminalSession('/home/user')?.bufferLength).toBe(originalLength);
    });
  });

  describe('setConnecting', () => {
    it('should set connecting state for existing session', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.setConnecting('/home/user', true);
      
      expect(store.getTerminalSession('/home/user')?.isConnecting).toBe(true);
      
      store.setConnecting('/home/user', false);
      
      expect(store.getTerminalSession('/home/user')?.isConnecting).toBe(false);
    });

    it('should create session state if it does not exist', () => {
      const store = useTerminalStore.getState();
      
      store.setConnecting('/new/path', true);
      
      const session = store.getTerminalSession('/new/path');
      expect(session).toBeDefined();
      expect(session?.isConnecting).toBe(true);
      expect(session?.terminalSessionId).toBeNull();
    });
  });

  describe('appendToBuffer', () => {
    it('should append data to buffer', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello ');
      store.appendToBuffer('/home/user', 'World');
      
      const session = store.getTerminalSession('/home/user');
      expect(session?.buffer).toBe('Hello World');
      expect(session?.bufferLength).toBe(11);
      expect(session?.bufferChunks.length).toBe(2);
    });

    it('should ignore empty chunks', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', '');
      
      expect(store.getTerminalSession('/home/user')?.bufferChunks.length).toBe(0);
    });

    it('should create session state if it does not exist', () => {
      const store = useTerminalStore.getState();
      
      store.appendToBuffer('/new/path', 'test data');
      
      const session = store.getTerminalSession('/new/path');
      expect(session).toBeDefined();
      expect(session?.buffer).toBe('test data');
    });

    it('should assign unique chunk IDs', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'chunk1');
      store.appendToBuffer('/home/user', 'chunk2');
      store.appendToBuffer('/home/user', 'chunk3');
      
      const session = store.getTerminalSession('/home/user');
      const ids = session?.bufferChunks.map(c => c.id) ?? [];
      
      expect(new Set(ids).size).toBe(3);
    });
  });

  describe('clearBuffer', () => {
    it('should clear the buffer but keep session', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello World');
      
      store.clearBuffer('/home/user');
      
      const session = store.getTerminalSession('/home/user');
      expect(session?.terminalSessionId).toBe('session-1');
      expect(session?.buffer).toBe('');
      expect(session?.bufferChunks).toEqual([]);
      expect(session?.bufferLength).toBe(0);
    });

    it('should do nothing for non-existent session', () => {
      const store = useTerminalStore.getState();
      
      store.clearBuffer('/non/existent');
      
      expect(store.getTerminalSession('/non/existent')).toBeUndefined();
    });
  });

  describe('clearTerminalSession', () => {
    it('should clear session ID but keep buffer', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello World');
      
      store.clearTerminalSession('/home/user');
      
      const session = store.getTerminalSession('/home/user');
      expect(session?.terminalSessionId).toBeNull();
      expect(session?.isConnecting).toBe(false);
      expect(session?.buffer).toBe('Hello World');
    });
  });

  describe('removeTerminalSession', () => {
    it('should completely remove the session', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer('/home/user', 'Hello World');
      
      store.removeTerminalSession('/home/user');
      
      expect(store.getTerminalSession('/home/user')).toBeUndefined();
    });
  });

  describe('clearAllTerminalSessions', () => {
    it('should remove all sessions', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/path/1', { sessionId: 'session-1', cols: 80, rows: 24 });
      store.setTerminalSession('/path/2', { sessionId: 'session-2', cols: 80, rows: 24 });
      store.setTerminalSession('/path/3', { sessionId: 'session-3', cols: 80, rows: 24 });
      
      store.clearAllTerminalSessions();
      
      expect(store.getTerminalSession('/path/1')).toBeUndefined();
      expect(store.getTerminalSession('/path/2')).toBeUndefined();
      expect(store.getTerminalSession('/path/3')).toBeUndefined();
    });

    it('should reset chunk ID counter', () => {
      const store = useTerminalStore.getState();
      
      store.appendToBuffer('/path/1', 'chunk');
      store.appendToBuffer('/path/1', 'chunk');
      store.appendToBuffer('/path/1', 'chunk');
      
      store.clearAllTerminalSessions();
      
      store.appendToBuffer('/new/path', 'new chunk');
      
      const session = store.getTerminalSession('/new/path');
      expect(session?.bufferChunks[0].id).toBe(1);
    });
  });

  describe('session key handling', () => {
    it('should handle UUID-style keys (for tab isolation)', () => {
      const store = useTerminalStore.getState();
      const tabId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
      
      store.setTerminalSession(tabId, { sessionId: 'session-1', cols: 80, rows: 24 });
      store.appendToBuffer(tabId, 'Hello from tab');
      
      const session = store.getTerminalSession(tabId);
      expect(session?.terminalSessionId).toBe('session-1');
      expect(session?.buffer).toBe('Hello from tab');
    });

    it('should keep tab-based and directory-based sessions separate', () => {
      const store = useTerminalStore.getState();
      const tabId = 'tab-uuid-123';
      const directory = '/home/user/project';
      
      store.setTerminalSession(tabId, { sessionId: 'tab-session', cols: 80, rows: 24 });
      store.setTerminalSession(directory, { sessionId: 'dir-session', cols: 80, rows: 24 });
      
      store.appendToBuffer(tabId, 'Tab content');
      store.appendToBuffer(directory, 'Dir content');
      
      expect(store.getTerminalSession(tabId)?.buffer).toBe('Tab content');
      expect(store.getTerminalSession(directory)?.buffer).toBe('Dir content');
    });
  });

  describe('buffer limit enforcement', () => {
    it('should trim old chunks when buffer exceeds limit', () => {
      const store = useTerminalStore.getState();
      
      store.setTerminalSession('/home/user', { sessionId: 'session-1', cols: 80, rows: 24 });
      
      const largeChunk = 'x'.repeat(600000);
      store.appendToBuffer('/home/user', largeChunk);
      store.appendToBuffer('/home/user', largeChunk);
      
      const session = store.getTerminalSession('/home/user');
      expect(session?.bufferLength).toBeLessThanOrEqual(1000000);
    });
  });
});
