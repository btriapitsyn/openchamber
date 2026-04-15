import {
  checkNgrokAvailable,
  resolveNgrokConfigValues,
  resolveNgrokAuthTokenInput,
  startNgrokEdgeTunnel,
  startNgrokEphemeralTunnel,
  startNgrokReservedTunnel,
} from '../../ngrok-tunnel.js';

import {
  TUNNEL_INTENT_EPHEMERAL_PUBLIC,
  TUNNEL_INTENT_PERSISTENT_PUBLIC,
  TUNNEL_MODE_NGROK_EDGE,
  TUNNEL_MODE_NGROK_EPHEMERAL,
  TUNNEL_MODE_NGROK_RESERVED,
  TUNNEL_PROVIDER_NGROK,
  TunnelServiceError,
} from '../types.js';

export const ngrokTunnelProviderCapabilities = {
  provider: TUNNEL_PROVIDER_NGROK,
  defaults: {
    mode: TUNNEL_MODE_NGROK_EPHEMERAL,
    optionDefaults: {},
  },
  modes: [
    {
      key: TUNNEL_MODE_NGROK_EPHEMERAL,
      label: 'Ephemeral Tunnel',
      intent: TUNNEL_INTENT_EPHEMERAL_PUBLIC,
      requires: ['token'],
      supports: ['sessionTTL'],
      stability: 'ga',
    },
    {
      key: TUNNEL_MODE_NGROK_RESERVED,
      label: 'Reserved Tunnel',
      intent: TUNNEL_INTENT_PERSISTENT_PUBLIC,
      requires: ['token', 'reservedDomain'],
      supports: ['customDomain', 'sessionTTL'],
      stability: 'ga',
    },
    {
      key: TUNNEL_MODE_NGROK_EDGE,
      label: 'Edge Tunnel',
      intent: TUNNEL_INTENT_PERSISTENT_PUBLIC,
      requires: ['token', 'edgeId'],
      supports: ['sessionTTL'],
      stability: 'ga',
    },
  ],
};

function tokenCheck(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { status: 'fail', detail: 'Ngrok auth token is required.' };
  }
  if (/\s/.test(value.trim())) {
    return { status: 'fail', detail: 'Ngrok auth token has whitespace; provide the raw token.' };
  }
  return { status: 'pass', detail: 'Ngrok auth token is configured.' };
}

async function resolveNgrokToken({ requestToken = '', sourceHint = '', configToken = '', configPath = '' } = {}) {
  const parsedRequestToken = resolveNgrokAuthTokenInput(requestToken);
  if (parsedRequestToken) {
    if (sourceHint === 'env') {
      return {
        token: parsedRequestToken,
        source: 'env',
        detail: 'Ngrok auth token loaded from NGROK_AUTHTOKEN.',
      };
    }
    return {
      token: parsedRequestToken,
      source: 'request',
      detail: 'Ngrok auth token provided explicitly.',
    };
  }

  const envToken = resolveNgrokAuthTokenInput(process.env.NGROK_AUTHTOKEN);
  if (envToken) {
    return {
      token: envToken,
      source: 'env',
      detail: 'Ngrok auth token loaded from NGROK_AUTHTOKEN.',
    };
  }

  const parsedConfigToken = resolveNgrokAuthTokenInput(configToken);
  if (parsedConfigToken) {
    return {
      token: parsedConfigToken,
      source: 'config',
      detail: configPath ? `Ngrok auth token loaded from ${configPath}.` : 'Ngrok auth token loaded from config file.',
    };
  }

  return {
    token: '',
    source: 'none',
    detail: configPath ? `No authtoken found in ${configPath}.` : '',
  };
}

function normalizeEndpointSelector(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function normalizeDomain(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toLowerCase();
}

function resolveEndpointFromConfig({ endpoints = [], endpointSelector = '', explicitReservedDomain = '', explicitEdgeId = '' } = {}) {
  const normalizedSelector = normalizeEndpointSelector(endpointSelector);
  const selectedByName = normalizedSelector
    ? endpoints.find((entry) => normalizeEndpointSelector(entry?.name) === normalizedSelector)
    : null;

  if (normalizedSelector && !selectedByName) {
    return {
      selected: null,
      detail: `No endpoint named '${endpointSelector}' found in ngrok config.`,
      conflict: true,
    };
  }

  if (selectedByName) {
    return { selected: selectedByName, detail: `Endpoint '${selectedByName.name || endpointSelector}' selected from ngrok config.` };
  }

  if (endpoints.length === 1) {
    return { selected: endpoints[0], detail: `Using the only endpoint '${endpoints[0].name || endpoints[0].url || endpoints[0].domain}' from ngrok config.` };
  }

  if (endpoints.length > 1) {
    if (explicitReservedDomain) {
      const selectedByDomain = endpoints.find((entry) => normalizeDomain(entry?.domain) === normalizeDomain(explicitReservedDomain));
      if (selectedByDomain) {
        return { selected: selectedByDomain, detail: `Matched endpoint '${selectedByDomain.name || selectedByDomain.url}' by reserved domain.` };
      }
    }
    if (explicitEdgeId) {
      const selectedByEdge = endpoints.find((entry) => normalizeDomain(entry?.url) === normalizeDomain(explicitEdgeId));
      if (selectedByEdge) {
        return { selected: selectedByEdge, detail: `Matched endpoint '${selectedByEdge.name || selectedByEdge.url}' by edge id.` };
      }
    }

    return {
      selected: null,
      detail: 'Multiple endpoints found in ngrok config. Provide --endpoint-id <name> to select one.',
      conflict: true,
    };
  }

  return { selected: null, detail: 'No endpoints found in ngrok config.' };
}

async function resolveNgrokRuntimeInputs(request, dependencyPath) {
  const configValues = await resolveNgrokConfigValues({
    ngrokPath: dependencyPath,
    configPath: request.configPath,
  });

  const tokenResolution = await resolveNgrokToken({
    requestToken: request.token,
    sourceHint: typeof request.authTokenSource === 'string' ? request.authTokenSource : '',
    configToken: configValues.token,
    configPath: configValues.configPath,
  });

  const explicitReservedDomain = typeof request.reservedDomain === 'string' ? request.reservedDomain.trim().toLowerCase() : '';
  const explicitEdgeId = typeof request.edgeId === 'string' ? request.edgeId.trim() : '';
  const endpointSelector = typeof request.endpointId === 'string' ? request.endpointId.trim() : '';

  const endpointResolution = resolveEndpointFromConfig({
    endpoints: configValues.endpoints,
    endpointSelector,
    explicitReservedDomain,
    explicitEdgeId,
  });

  const reservedDomain = explicitReservedDomain
    || (typeof endpointResolution.selected?.domain === 'string' ? endpointResolution.selected.domain : '');

  const edgeId = explicitEdgeId
    || (typeof endpointResolution.selected?.url === 'string' ? endpointResolution.selected.url : '');

  return {
    token: tokenResolution.token,
    tokenDetail: tokenResolution.detail,
    tokenSource: tokenResolution.source,
    reservedDomain,
    edgeId,
    endpointDetail: endpointResolution.detail || '',
    endpointConflict: endpointResolution.conflict === true,
    configPath: configValues.configPath,
    configDetail: configValues.detail,
  };
}

function summarizeChecks(checks) {
  const failures = checks.filter((entry) => entry.status === 'fail').length;
  const warnings = checks.filter((entry) => entry.status === 'warn').length;
  return {
    ready: failures === 0,
    failures,
    warnings,
  };
}

function mapNgrokStartupError(error) {
  if (error instanceof TunnelServiceError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('ngrok is not installed')
    || normalized.includes('command not found')
    || normalized.includes('enoent')
  ) {
    return new TunnelServiceError('missing_dependency', message);
  }

  if (
    normalized.includes('auth token is required')
    || normalized.includes('invalid authtoken')
    || normalized.includes('authentication failed')
    || normalized.includes('unauthorized')
    || normalized.includes('forbidden')
    || normalized.includes('requires reserveddomain')
    || normalized.includes('requires edgeid')
  ) {
    return new TunnelServiceError('validation_error', message);
  }

  return new TunnelServiceError('startup_failed', message);
}

function describeMode(mode, checks) {
  const summary = summarizeChecks(checks);
  return {
    mode,
    checks,
    summary,
    ready: summary.ready,
    blockers: checks
      .filter((entry) => entry.status === 'fail' && entry.id !== 'startup_readiness')
      .map((entry) => entry.detail || entry.label || entry.id),
  };
}

export function createNgrokTunnelProvider() {
  return {
    id: TUNNEL_PROVIDER_NGROK,
    capabilities: ngrokTunnelProviderCapabilities,
    checkAvailability: async () => {
      const result = await checkNgrokAvailable();
      if (result.available) {
        return result;
      }
      return {
        ...result,
        message: 'ngrok is not installed. Install it with: brew install ngrok/ngrok/ngrok',
      };
    },
    diagnose: async (request = {}) => {
      const dependency = await checkNgrokAvailable();
      const providerChecks = [
        {
          id: 'dependency',
          label: 'ngrok installed',
          status: dependency.available ? 'pass' : 'fail',
          detail: dependency.available
            ? (dependency.version || dependency.path || 'ngrok available')
            : 'ngrok is not installed. Install it with: brew install ngrok/ngrok/ngrok',
        },
      ];

      const startupReady = dependency.available;
      const startupDetail = startupReady
        ? 'Provider dependency check passed.'
        : 'Resolve provider dependency before starting tunnels.';

      const resolvedInputs = dependency.available
        ? await resolveNgrokRuntimeInputs(request, dependency.path)
        : {
          token: resolveNgrokAuthTokenInput(request.token),
          tokenDetail: '',
          reservedDomain: request.reservedDomain || '',
          edgeId: request.edgeId || '',
          endpointDetail: '',
          endpointConflict: false,
          configPath: '',
          configDetail: '',
        };

      const token = tokenCheck(resolvedInputs.token);
      const tokenDetailHint = resolvedInputs.tokenDetail || '';
      if (token.status === 'pass' && tokenDetailHint) {
        token.detail = tokenDetailHint;
      } else if (token.status === 'fail' && tokenDetailHint) {
        token.detail = `Ngrok auth token is required. ${tokenDetailHint}`;
      }
      const reservedDomain = typeof resolvedInputs.reservedDomain === 'string' && resolvedInputs.reservedDomain.trim().length > 0;
      const edgeId = typeof resolvedInputs.edgeId === 'string' && resolvedInputs.edgeId.trim().length > 0;
      const endpointConflict = resolvedInputs.endpointConflict === true;

      const allModes = [
        describeMode(TUNNEL_MODE_NGROK_EPHEMERAL, [
          {
            id: 'startup_readiness',
            label: 'Provider startup readiness',
            status: startupReady ? 'pass' : 'fail',
            detail: startupDetail,
          },
          {
            id: 'auth_token',
            label: 'Ngrok auth token',
            status: token.status,
            detail: token.detail,
          },
        ]),
        describeMode(TUNNEL_MODE_NGROK_RESERVED, [
          {
            id: 'startup_readiness',
            label: 'Provider startup readiness',
            status: startupReady ? 'pass' : 'fail',
            detail: startupDetail,
          },
          {
            id: 'auth_token',
            label: 'Ngrok auth token',
            status: token.status,
            detail: token.detail,
          },
          {
            id: 'reserved_domain',
            label: 'Reserved domain',
            status: endpointConflict ? 'fail' : (reservedDomain ? 'pass' : 'fail'),
            detail: endpointConflict
              ? (resolvedInputs.endpointDetail || 'Multiple endpoints require explicit endpoint selection.')
              : (reservedDomain
                ? (resolvedInputs.endpointDetail || resolvedInputs.reservedDomain.trim())
                : 'Reserved mode requires reservedDomain (or resolvable endpoint from config).'),
          },
        ]),
        describeMode(TUNNEL_MODE_NGROK_EDGE, [
          {
            id: 'startup_readiness',
            label: 'Provider startup readiness',
            status: startupReady ? 'pass' : 'fail',
            detail: startupDetail,
          },
          {
            id: 'auth_token',
            label: 'Ngrok auth token',
            status: token.status,
            detail: token.detail,
          },
          {
            id: 'edge_id',
            label: 'Edge ID',
            status: endpointConflict ? 'fail' : (edgeId ? 'pass' : 'fail'),
            detail: endpointConflict
              ? (resolvedInputs.endpointDetail || 'Multiple endpoints require explicit endpoint selection.')
              : (edgeId
                ? (resolvedInputs.endpointDetail || resolvedInputs.edgeId.trim())
                : 'Edge mode requires edgeId (or endpointId/config endpoint).'),
          },
        ]),
      ];

      const modeFilter = typeof request.mode === 'string' && request.mode.trim().length > 0
        ? request.mode.trim().toLowerCase()
        : null;

      return {
        providerChecks,
        modes: modeFilter ? allModes.filter((entry) => entry.mode === modeFilter) : allModes,
      };
    },
    start: async (request, context = {}) => {
      if (!context.originUrl) {
        throw new TunnelServiceError('validation_error', 'originUrl is required for ngrok tunnel mode');
      }

      const dependency = await checkNgrokAvailable();
      const resolvedInputs = await resolveNgrokRuntimeInputs(request, dependency.path);
      if (!resolvedInputs.token) {
        throw new TunnelServiceError('validation_error', 'Ngrok auth token is required. Provide token/authToken, set NGROK_AUTHTOKEN, or configure ngrok authtoken.');
      }

      try {
        if (request.mode === TUNNEL_MODE_NGROK_RESERVED) {
          if (resolvedInputs.endpointConflict) {
            throw new TunnelServiceError('validation_error', resolvedInputs.endpointDetail || 'Multiple endpoints found in ngrok config. Provide endpointId or reservedDomain.');
          }
          if (!resolvedInputs.reservedDomain) {
            throw new TunnelServiceError('validation_error', 'Reserved mode requires reservedDomain or a selectable endpoint in ngrok config.');
          }
          return startNgrokReservedTunnel({
            authToken: resolvedInputs.token,
            originUrl: context.originUrl,
            reservedDomain: resolvedInputs.reservedDomain,
          });
        }

        if (request.mode === TUNNEL_MODE_NGROK_EDGE) {
          if (resolvedInputs.endpointConflict) {
            throw new TunnelServiceError('validation_error', resolvedInputs.endpointDetail || 'Multiple endpoints found in ngrok config. Provide endpointId or edgeId.');
          }
          if (!resolvedInputs.edgeId) {
            throw new TunnelServiceError('validation_error', 'Edge mode requires edgeId or a selectable endpoint in ngrok config.');
          }
          return startNgrokEdgeTunnel({
            authToken: resolvedInputs.token,
            originUrl: context.originUrl,
            edgeId: resolvedInputs.edgeId,
          });
        }

        return startNgrokEphemeralTunnel({
          authToken: resolvedInputs.token,
          originUrl: context.originUrl,
        });
      } catch (error) {
        throw mapNgrokStartupError(error);
      }
    },
    stop: (controller) => {
      controller?.stop?.();
    },
    resolvePublicUrl: (controller) => controller?.getPublicUrl?.() ?? null,
    getMetadata: (controller) => ({
      edgeId: typeof controller?.edgeId === 'string' ? controller.edgeId : null,
      reservedDomain: typeof controller?.reservedDomain === 'string' ? controller.reservedDomain : null,
    }),
  };
}
