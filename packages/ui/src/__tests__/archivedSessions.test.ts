import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getArchivedSessions,
  archiveSession,
  unarchiveSession,
  isSessionArchived,
  subscribe,
} from '@/lib/archivedSessions';

const STORAGE_KEY = 'oc.sessions.archived';

describe('archivedSessions', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('getArchivedSessions', () => {
    it('returns empty object when storage is empty', () => {
      const result = getArchivedSessions();
      expect(result).toEqual({});
    });

    it('returns empty object when storage contains null', () => {
      localStorage.setItem(STORAGE_KEY, 'null');
      const result = getArchivedSessions();
      expect(result).toEqual({});
    });

    it('returns empty object when storage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not json');
      const result = getArchivedSessions();
      expect(result).toEqual({});
    });

    it('returns empty object when storage contains array', () => {
      localStorage.setItem(STORAGE_KEY, '["array"]');
      const result = getArchivedSessions();
      expect(result).toEqual({});
    });

    it('parses valid data correctly', () => {
      const data = {
        '/path/to/project': ['session-1', 'session-2'],
        '/another/path': ['session-3'],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const result = getArchivedSessions();
      expect(result).toEqual(data);
    });

    it('filters out non-string session IDs', () => {
      const data = {
        '/path': ['valid', 123, null, 'also-valid'],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const result = getArchivedSessions();
      expect(result).toEqual({
        '/path': ['valid', 'also-valid'],
      });
    });

    it('filters out directories with no valid session IDs', () => {
      const data = {
        '/path': [123, null],
        '/other': ['valid'],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const result = getArchivedSessions();
      expect(result).toEqual({
        '/other': ['valid'],
      });
    });

    it('filters out non-array values for directories', () => {
      const data = {
        '/path': 'not-an-array',
        '/other': ['valid'],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const result = getArchivedSessions();
      expect(result).toEqual({
        '/other': ['valid'],
      });
    });
  });

  describe('archiveSession', () => {
    it('adds session to empty storage', () => {
      archiveSession('session-1', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-1'],
      });
    });

    it('adds session to existing directory', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      archiveSession('session-2', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-1', 'session-2'],
      });
    });

    it('adds session to new directory', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project1': ['session-1'] }));
      archiveSession('session-2', '/project2');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project1': ['session-1'],
        '/project2': ['session-2'],
      });
    });

    it('does not duplicate session ID', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      archiveSession('session-1', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-1'],
      });
    });
  });

  describe('unarchiveSession', () => {
    it('removes session from storage', () => {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ '/project': ['session-1', 'session-2'] })
      );
      unarchiveSession('session-1', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-2'],
      });
    });

    it('removes directory when last session is unarchived', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      unarchiveSession('session-1', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({});
    });

    it('does nothing when session is not in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      unarchiveSession('session-999', '/project');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-1'],
      });
    });

    it('does nothing when directory is not in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      unarchiveSession('session-1', '/other');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
      expect(stored).toEqual({
        '/project': ['session-1'],
      });
    });
  });

  describe('isSessionArchived', () => {
    it('returns true when session is archived', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      const result = isSessionArchived('session-1', '/project');
      expect(result).toBe(true);
    });

    it('returns false when session is not archived', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      const result = isSessionArchived('session-2', '/project');
      expect(result).toBe(false);
    });

    it('returns false when directory is not in storage', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      const result = isSessionArchived('session-1', '/other');
      expect(result).toBe(false);
    });

    it('returns false when storage is empty', () => {
      const result = isSessionArchived('session-1', '/project');
      expect(result).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('calls listener when archive changes', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);
      archiveSession('session-1', '/project');
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('calls listener when unarchive changes', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ '/project': ['session-1'] }));
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);
      unarchiveSession('session-1', '/project');
      expect(listener).toHaveBeenCalledTimes(1);
      unsubscribe();
    });

    it('stops calling listener after unsubscribe', () => {
      const listener = vi.fn();
      const unsubscribe = subscribe(listener);
      archiveSession('session-1', '/project');
      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      archiveSession('session-2', '/project');
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('supports multiple listeners', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const unsub1 = subscribe(listener1);
      const unsub2 = subscribe(listener2);
      archiveSession('session-1', '/project');
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      unsub1();
      unsub2();
    });

    it('continues notifying other listeners if one throws', () => {
      const listener1 = vi.fn(() => {
        throw new Error('test error');
      });
      const listener2 = vi.fn();
      const unsub1 = subscribe(listener1);
      const unsub2 = subscribe(listener2);
      archiveSession('session-1', '/project');
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      unsub1();
      unsub2();
    });
  });
});
