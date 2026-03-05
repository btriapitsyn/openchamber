import {
  checkCloudflaredAvailable,
  startCloudflareManagedLocalTunnel,
  startCloudflareManagedRemoteTunnel,
  startCloudflareQuickTunnel,
} from '../../cloudflare-tunnel.js';

import {
  TUNNEL_INTENT_EPHEMERAL_PUBLIC,
  TUNNEL_INTENT_PERSISTENT_PUBLIC,
  TUNNEL_MODE_MANAGED_LOCAL,
  TUNNEL_MODE_MANAGED_REMOTE,
  TUNNEL_MODE_QUICK,
  TUNNEL_PROVIDER_CLOUDFLARE,
  TunnelServiceError,
} from '../types.js';

export const cloudflareTunnelProviderCapabilities = {
  provider: TUNNEL_PROVIDER_CLOUDFLARE,
  defaults: {
    mode: TUNNEL_MODE_QUICK,
    optionDefaults: {},
  },
  modes: [
    {
      key: TUNNEL_MODE_QUICK,
      label: 'Quick Tunnel',
      intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC,
      requires: [],
      supports: ['sessionTTL'],
      stability: 'ga',
    },
    {
      key: TUNNEL_MODE_MANAGED_REMOTE,
      label: 'Managed Remote Tunnel',
      intent: TUNNEL_INTENT_PERSISTENT_PUBLIC,
      requires: ['token', 'hostname'],
      supports: ['customDomain', 'sessionTTL'],
      stability: 'ga',
    },
    {
      key: TUNNEL_MODE_MANAGED_LOCAL,
      label: 'Managed Local Tunnel',
      intent: TUNNEL_INTENT_PERSISTENT_PUBLIC,
      requires: [],
      supports: ['configFile', 'customDomain', 'sessionTTL'],
      stability: 'ga',
    },
  ],
};

export function createCloudflareTunnelProvider() {
  return {
    id: TUNNEL_PROVIDER_CLOUDFLARE,
    capabilities: cloudflareTunnelProviderCapabilities,
    checkAvailability: async () => {
      const result = await checkCloudflaredAvailable();
      if (result.available) {
        return result;
      }
      return {
        ...result,
        message: 'cloudflared is not installed. Install it with: brew install cloudflared',
      };
    },
    start: async (request, context = {}) => {
      if (request.mode === TUNNEL_MODE_MANAGED_REMOTE) {
        return startCloudflareManagedRemoteTunnel({
          token: request.token,
          hostname: request.hostname,
        });
      }

      if (request.mode === TUNNEL_MODE_MANAGED_LOCAL) {
        return startCloudflareManagedLocalTunnel({
          configPath: request.configPath,
          hostname: request.hostname,
        });
      }

      if (!context.originUrl) {
        throw new TunnelServiceError('validation_error', 'originUrl is required for quick tunnel mode');
      }

      return startCloudflareQuickTunnel({
        originUrl: context.originUrl,
        port: context.activePort,
      });
    },
    stop: (controller) => {
      controller?.stop?.();
    },
    resolvePublicUrl: (controller) => controller?.getPublicUrl?.() ?? null,
    getMetadata: (controller) => ({
      configPath: controller?.getEffectiveConfigPath?.() ?? null,
      resolvedHostname: controller?.getResolvedHostname?.() ?? null,
    }),
  };
}
