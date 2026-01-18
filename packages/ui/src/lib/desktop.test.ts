import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isDesktopRuntime,
  isVSCodeRuntime,
  isWebRuntime,
  getDesktopApi,
  isCliAvailable,
} from './desktop';

describe('Runtime Detection', () => {
  const originalWindow = global.window;

  beforeEach(() => {
    vi.resetAllMocks();
    (global as Record<string, unknown>).window = {};
  });

  afterEach(() => {
    (global as Record<string, unknown>).window = originalWindow;
  });

  describe('isDesktopRuntime', () => {
    it('should return false when window is undefined', () => {
      (global as Record<string, unknown>).window = undefined;
      expect(isDesktopRuntime()).toBe(false);
    });

    it('should return false when opencodeDesktop is not defined', () => {
      (global as Record<string, unknown>).window = {};
      expect(isDesktopRuntime()).toBe(false);
    });

    it('should return true when opencodeDesktop is defined', () => {
      (global as Record<string, unknown>).window = {
        opencodeDesktop: { getServerInfo: vi.fn() },
      };
      expect(isDesktopRuntime()).toBe(true);
    });
  });

  describe('isVSCodeRuntime', () => {
    it('should return false when window is undefined', () => {
      (global as Record<string, unknown>).window = undefined;
      expect(isVSCodeRuntime()).toBe(false);
    });

    it('should return false when runtime APIs not set', () => {
      (global as Record<string, unknown>).window = {};
      expect(isVSCodeRuntime()).toBe(false);
    });

    it('should return false when isVSCode is false', () => {
      (global as Record<string, unknown>).window = {
        __OPENCHAMBER_RUNTIME_APIS__: { runtime: { isVSCode: false } },
      };
      expect(isVSCodeRuntime()).toBe(false);
    });

    it('should return true when isVSCode is true', () => {
      (global as Record<string, unknown>).window = {
        __OPENCHAMBER_RUNTIME_APIS__: { runtime: { isVSCode: true } },
      };
      expect(isVSCodeRuntime()).toBe(true);
    });
  });

  describe('isWebRuntime', () => {
    it('should return false when window is undefined', () => {
      (global as Record<string, unknown>).window = undefined;
      expect(isWebRuntime()).toBe(false);
    });

    it('should return true for plain web environment', () => {
      (global as Record<string, unknown>).window = {};
      expect(isWebRuntime()).toBe(true);
    });

    it('should return false when in desktop runtime', () => {
      (global as Record<string, unknown>).window = {
        opencodeDesktop: { getServerInfo: vi.fn() },
      };
      expect(isWebRuntime()).toBe(false);
    });

    it('should return false when in VSCode runtime', () => {
      (global as Record<string, unknown>).window = {
        __OPENCHAMBER_RUNTIME_APIS__: { runtime: { isVSCode: true } },
      };
      expect(isWebRuntime()).toBe(false);
    });
  });

  describe('getDesktopApi', () => {
    it('should return null when not in desktop runtime', () => {
      (global as Record<string, unknown>).window = {};
      expect(getDesktopApi()).toBeNull();
    });

    it('should return the desktop API when available', () => {
      const mockApi = { getServerInfo: vi.fn() };
      (global as Record<string, unknown>).window = {
        opencodeDesktop: mockApi,
      };
      expect(getDesktopApi()).toBe(mockApi);
    });
  });

  describe('isCliAvailable', () => {
    it('should return false when window is undefined', () => {
      (global as Record<string, unknown>).window = undefined;
      expect(isCliAvailable()).toBe(false);
    });

    it('should return false when server info not available', () => {
      (global as Record<string, unknown>).window = {};
      expect(isCliAvailable()).toBe(false);
    });

    it('should return false when cliAvailable is false', () => {
      (global as Record<string, unknown>).window = {
        __OPENCHAMBER_DESKTOP_SERVER__: { cliAvailable: false },
      };
      expect(isCliAvailable()).toBe(false);
    });

    it('should return true when cliAvailable is true', () => {
      (global as Record<string, unknown>).window = {
        __OPENCHAMBER_DESKTOP_SERVER__: { cliAvailable: true },
      };
      expect(isCliAvailable()).toBe(true);
    });
  });
});
