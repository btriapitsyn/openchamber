import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getSafeStorage } from './safeStorage';

describe('getSafeStorage', () => {
  const originalWindow = global.window;
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    (global as Record<string, unknown>).window = originalWindow;
    (global as Record<string, unknown>).localStorage = originalLocalStorage;
  });

  describe('when window is undefined (SSR)', () => {
    it('should return in-memory storage', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('test', 'value');
      expect(storage.getItem('test')).toBe('value');
      
      storage.removeItem('test');
      expect(storage.getItem('test')).toBeNull();
    });
  });

  describe('when localStorage is unavailable', () => {
    it('should fall back to in-memory storage', async () => {
      (global as Record<string, unknown>).window = {};
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('key', 'value');
      expect(storage.getItem('key')).toBe('value');
    });
  });

  describe('in-memory storage behavior', () => {
    it('should implement getItem', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      expect(storage.getItem('nonexistent')).toBeNull();
      storage.setItem('exists', 'value');
      expect(storage.getItem('exists')).toBe('value');
    });

    it('should implement setItem', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      expect(storage.getItem('a')).toBe('1');
      expect(storage.getItem('b')).toBe('2');
    });

    it('should implement removeItem', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('toRemove', 'value');
      expect(storage.getItem('toRemove')).toBe('value');
      storage.removeItem('toRemove');
      expect(storage.getItem('toRemove')).toBeNull();
    });

    it('should implement clear', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('a', '1');
      storage.setItem('b', '2');
      storage.clear();
      expect(storage.getItem('a')).toBeNull();
      expect(storage.getItem('b')).toBeNull();
      expect(storage.length).toBe(0);
    });

    it('should implement key', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      storage.setItem('first', '1');
      storage.setItem('second', '2');
      
      const keys = [storage.key(0), storage.key(1)];
      expect(keys).toContain('first');
      expect(keys).toContain('second');
      expect(storage.key(999)).toBeNull();
    });

    it('should implement length', async () => {
      (global as Record<string, unknown>).window = undefined;
      
      const { getSafeStorage: getSafeStorageFresh } = await import('./safeStorage');
      const storage = getSafeStorageFresh();
      
      expect(storage.length).toBe(0);
      storage.setItem('a', '1');
      expect(storage.length).toBe(1);
      storage.setItem('b', '2');
      expect(storage.length).toBe(2);
      storage.removeItem('a');
      expect(storage.length).toBe(1);
    });
  });

  describe('singleton behavior', () => {
    it('should return same instance on multiple calls', () => {
      const storage1 = getSafeStorage();
      const storage2 = getSafeStorage();
      expect(storage1).toBe(storage2);
    });
  });
});
