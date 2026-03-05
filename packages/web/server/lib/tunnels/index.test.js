import { describe, expect, it } from 'bun:test';

import { createTunnelProviderRegistry } from './registry.js';
import { createTunnelService } from './index.js';
import {
  TUNNEL_INTENT_EPHEMERAL_PUBLIC,
  TUNNEL_INTENT_PERSISTENT_PUBLIC,
  TUNNEL_MODE_MANAGED_LOCAL,
  TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_MODE_QUICK,
  TUNNEL_PROVIDER_CLOUDFLARE,
  TunnelServiceError,
} from './types.js';

function createFakeProvider() {
  return {
    id: TUNNEL_PROVIDER_CLOUDFLARE,
    capabilities: {
      provider: TUNNEL_PROVIDER_CLOUDFLARE,
      modes: [
        { key: TUNNEL_MODE_QUICK, intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC, requires: [] },
        { key: TUNNEL_MODE_MANAGED_REMOTE, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: ['token', 'hostname'] },
        { key: TUNNEL_MODE_MANAGED_LOCAL, intent: TUNNEL_INTENT_PERSISTENT_PUBLIC, requires: [] },
      ],
    },
    async checkAvailability() {
      return { available: true, version: 'test' };
    },
    async start(request, context) {
      const url = request.mode === TUNNEL_MODE_QUICK
        ? `https://quick.example.com:${context.activePort}`
        : (request.mode === TUNNEL_MODE_MANAGED_REMOTE
          ? `https://${request.hostname}`
          : 'https://local.example.com');
      return {
        mode: request.mode,
        provider: TUNNEL_PROVIDER_CLOUDFLARE,
        stop() {},
        getPublicUrl() {
          return url;
        },
      };
    },
    stop(controller) {
      controller?.stop?.();
    },
    resolvePublicUrl(controller) {
      return controller?.getPublicUrl?.() ?? null;
    },
  };
}

describe('tunnel service', () => {
  it('starts quick tunnel using provider adapter', async () => {
    const registry = createTunnelProviderRegistry([createFakeProvider()]);
    let controller = null;
    const service = createTunnelService({
      registry,
      getController: () => controller,
      setController: (next) => {
        controller = next;
      },
      getActivePort: () => 3210,
    });

    const result = await service.start({ provider: 'cloudflare', mode: 'quick' });
    expect(result.publicUrl).toContain('quick.example.com');
    expect(result.activeMode).toBe(TUNNEL_MODE_QUICK);
  });

  it('validates managed-remote requirements', async () => {
    const registry = createTunnelProviderRegistry([createFakeProvider()]);
    let controller = null;
    const service = createTunnelService({
      registry,
      getController: () => controller,
      setController: (next) => {
        controller = next;
      },
      getActivePort: () => 3210,
    });

    await expect(service.start({ provider: 'cloudflare', mode: 'managed-remote' })).rejects.toBeInstanceOf(TunnelServiceError);
  });

  it('restarts when mode changes', async () => {
    const registry = createTunnelProviderRegistry([createFakeProvider()]);
    let controller = null;
    const service = createTunnelService({
      registry,
      getController: () => controller,
      setController: (next) => {
        controller = next;
      },
      getActivePort: () => 3210,
    });

    await service.start({ provider: 'cloudflare', mode: 'quick' });
    const result = await service.start({
      provider: 'cloudflare',
      mode: 'managed-remote',
      token: 'tok',
      hostname: 'example.com',
    });

    expect(result.activeMode).toBe(TUNNEL_MODE_MANAGED_REMOTE);
    expect(result.publicUrl).toBe('https://example.com');
  });

  it('passes managed-local config path variants', async () => {
    let lastRequest = null;
    const provider = createFakeProvider();
    provider.start = async (request) => {
      lastRequest = request;
      return {
        mode: request.mode,
        provider: TUNNEL_PROVIDER_CLOUDFLARE,
        stop() {},
        getPublicUrl() {
          return 'https://local.example.com';
        },
      };
    };

    const registry = createTunnelProviderRegistry([provider]);
    let controller = null;
    const service = createTunnelService({
      registry,
      getController: () => controller,
      setController: (next) => {
        controller = next;
      },
      getActivePort: () => 3210,
    });

    await service.start({ provider: 'cloudflare', mode: 'managed-local', configPath: null });
    expect(lastRequest?.configPath).toBeNull();

    service.stop();
    await service.start({ provider: 'cloudflare', mode: 'managed-local', configPath: './config.yml' });
    expect(typeof lastRequest?.configPath).toBe('string');
    expect(lastRequest?.configPath?.endsWith('config.yml')).toBe(true);
  });
});
