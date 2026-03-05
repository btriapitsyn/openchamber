import { describe, expect, it } from 'bun:test';

import {
  TUNNEL_INTENT_EPHEMERAL_PUBLIC,
  TUNNEL_INTENT_PERSISTENT_PUBLIC,
  TUNNEL_MODE_MANAGED_LOCAL,
  TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_MODE_QUICK,
  TUNNEL_PROVIDER_CLOUDFLARE,
  TunnelServiceError,
  normalizeTunnelMode,
  normalizeTunnelStartRequest,
  validateTunnelStartRequest,
} from './types.js';

describe('tunnel request types', () => {
  it('normalizes unknown modes to quick for persisted settings usage', () => {
    expect(normalizeTunnelMode('named')).toBe(TUNNEL_MODE_QUICK);
  });

  it('normalizes tunnel start request defaults', () => {
    const request = normalizeTunnelStartRequest({});

    expect(request.provider).toBe(TUNNEL_PROVIDER_CLOUDFLARE);
    expect(request.mode).toBe(TUNNEL_MODE_QUICK);
    expect(request.token).toBe('');
    expect(request.hostname).toBe('');
  });

  it('preserves unknown mode in start request for explicit validation', () => {
    const request = normalizeTunnelStartRequest({ mode: 'future-mode' });
    expect(request.mode).toBe('future-mode');
  });

  it('requires token and hostname for managed-remote', () => {
    const capabilities = {
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      modes: [
        { key: TUNNEL_MODE_QUICK, intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC, requires: [] },
        { key: TUNNEL_MODE_MANAGED_REMOTE, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: ['token', 'hostname'] },
        { key: TUNNEL_MODE_MANAGED_LOCAL, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: [] },
      ],
    };

    expect(() => validateTunnelStartRequest({
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      mode: TUNNEL_MODE_MANAGED_REMOTE,
      token: '',
      hostname: '',
      configPath: undefined,
    }, capabilities)).toThrow(TunnelServiceError);
  });

  it('rejects unsupported mode explicitly', () => {
    const capabilities = {
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      modes: [
        { key: TUNNEL_MODE_QUICK, intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC, requires: [] },
        { key: TUNNEL_MODE_MANAGED_REMOTE, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: ['token', 'hostname'] },
        { key: TUNNEL_MODE_MANAGED_LOCAL, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: [] },
      ],
    };

    expect(() => validateTunnelStartRequest({
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      mode: 'future-mode',
      token: '',
      hostname: '',
      configPath: undefined,
    }, capabilities)).toThrow(TunnelServiceError);
  });

  it('validates intent mismatch', () => {
    const capabilities = {
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      modes: [
        { key: TUNNEL_MODE_QUICK, intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC, requires: [] },
      ],
    };

    expect(() => validateTunnelStartRequest({
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      mode: TUNNEL_MODE_QUICK,
      intent: TUNNEL_INTENT_PERSISTENT_PUBLIC,
      token: '',
      hostname: '',
      configPath: undefined,
    }, capabilities)).toThrow(TunnelServiceError);
  });
});
