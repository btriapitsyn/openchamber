import { describe, expect, it, vi } from 'vitest';
import net from 'node:net';

import { applyConnectAttemptTimeout, CONNECT_ATTEMPT_TIMEOUT_MS } from './network-defaults.js';

describe('applyConnectAttemptTimeout', () => {
  it('raises the per-attempt connect timeout on runtimes that expose the setter', () => {
    const previous = net.getDefaultAutoSelectFamilyAttemptTimeout();
    try {
      expect(applyConnectAttemptTimeout()).toBe(true);
      expect(net.getDefaultAutoSelectFamilyAttemptTimeout()).toBe(CONNECT_ATTEMPT_TIMEOUT_MS);
    } finally {
      net.setDefaultAutoSelectFamilyAttemptTimeout(previous);
    }
  });

  it('is a no-op on runtimes without the setter', () => {
    expect(applyConnectAttemptTimeout({})).toBe(false);
  });

  it('survives a throwing setter', () => {
    const setDefaultAutoSelectFamilyAttemptTimeout = vi.fn(() => {
      throw new Error('not supported');
    });
    expect(applyConnectAttemptTimeout({ setDefaultAutoSelectFamilyAttemptTimeout })).toBe(false);
  });

  it('leaves family autoselection itself untouched', () => {
    const setDefaultAutoSelectFamily = vi.fn();
    const setDefaultAutoSelectFamilyAttemptTimeout = vi.fn();
    applyConnectAttemptTimeout({ setDefaultAutoSelectFamily, setDefaultAutoSelectFamilyAttemptTimeout });
    expect(setDefaultAutoSelectFamilyAttemptTimeout).toHaveBeenCalledTimes(1);
    expect(setDefaultAutoSelectFamilyAttemptTimeout).toHaveBeenCalledWith(CONNECT_ATTEMPT_TIMEOUT_MS);
    expect(setDefaultAutoSelectFamily).not.toHaveBeenCalled();
  });
});
