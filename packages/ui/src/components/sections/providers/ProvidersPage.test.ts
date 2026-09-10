import { describe, expect, test } from 'bun:test';
import { rankByQuery } from '../../../lib/search/fuzzySearch';
import {
  FREEINFERENCE_PROVIDER_ID,
  FREEINFERENCE_NAME,
  getPresetSearchKeywords,
} from './freeinference-preset';
import { requiresProviderAuth, shouldLoadAvailableProviders } from './providerAvailability';
import {
  getOAuthAuthMethods,
  normalizeAuthType,
  parseAuthPayload,
  requiresOpenCodeRestartAfterOAuth,
  providerHasCredentials,
  shouldAutoOpenAuthPanel,
  shouldShowApiKeyAuth,
  shouldShowModelsSection,
} from './providerAuth';

describe('ProvidersPage available provider loading', () => {
  test('loads available providers only in add-provider mode', () => {
    expect(shouldLoadAvailableProviders(false)).toBe(false);
    expect(shouldLoadAvailableProviders(true)).toBe(true);
  });
});

describe('ProvidersPage provider authentication', () => {
  test('does not require credentials for a custom provider defined in config', () => {
    expect(requiresProviderAuth(true, false, true)).toBe(false);
    expect(requiresProviderAuth(true, false, false)).toBe(true);
    expect(requiresProviderAuth(true, true, false)).toBe(false);
  });
});

describe('provider auth method helpers', () => {
  test('normalizeAuthType recognizes oauth and api labels', () => {
    expect(normalizeAuthType({ type: 'oauth', label: 'Login with Cursor' })).toBe('oauth');
    expect(normalizeAuthType({ type: 'api', label: 'API Key' })).toBe('api');
    expect(normalizeAuthType({ label: 'OAuth browser login' })).toBe('oauth');
    expect(normalizeAuthType({ name: 'API key' })).toBe('api');
  });

  test('parseAuthPayload keeps only object auth method entries', () => {
    expect(parseAuthPayload({
      cursor: [{ type: 'oauth', label: 'Cursor' }, 'skip'],
      openai: null,
    })).toEqual({
      cursor: [{ type: 'oauth', label: 'Cursor' }],
    });
    expect(parseAuthPayload(null)).toEqual({});
  });

  test('shouldShowApiKeyAuth hides API key for oauth-only providers', () => {
    expect(shouldShowApiKeyAuth([{ type: 'oauth', label: 'Cursor OAuth' }])).toBe(false);
    expect(shouldShowApiKeyAuth([
      { type: 'api', label: 'API Key' },
      { type: 'oauth', label: 'ChatGPT' },
    ])).toBe(true);
    expect(shouldShowApiKeyAuth([{ type: 'api', label: 'API Key' }])).toBe(true);
    // Unknown / unloaded methods keep the legacy API key fallback.
    expect(shouldShowApiKeyAuth([])).toBe(true);
  });

  test('getOAuthAuthMethods preserves original method indexes', () => {
    const methods = [
      { type: 'api', label: 'API Key' },
      { type: 'oauth', label: 'OAuth' },
      { type: 'oauth', label: 'Device' },
    ];
    expect(getOAuthAuthMethods(methods)).toEqual([
      { method: methods[1], methodIndex: 1 },
      { method: methods[2], methodIndex: 2 },
    ]);
    expect(getOAuthAuthMethods([{ type: 'oauth', label: 'Cursor' }])).toEqual([
      { method: { type: 'oauth', label: 'Cursor' }, methodIndex: 0 },
    ]);
  });

  test('Claude CLI OAuth does not require an OpenCode restart', () => {
    expect(requiresOpenCodeRestartAfterOAuth('claude-code')).toBe(false);
    expect(requiresOpenCodeRestartAfterOAuth('github-copilot')).toBe(true);
  });
});

describe('provider credential state helpers', () => {
  test('providerHasCredentials requires key, options.apiKey, declared env, or auth source', () => {
    // Built-in catalog entry with no credential signal at all.
    expect(providerHasCredentials({ key: undefined, authSourceExists: false })).toBe(false);
    expect(providerHasCredentials({ key: '', authSourceExists: false })).toBe(false);
    expect(providerHasCredentials({ key: '   ', authSourceExists: false })).toBe(false);

    // OpenCode reports an active credential via provider.key.
    expect(providerHasCredentials({ key: 'sk-...', authSourceExists: false })).toBe(true);
    // Auth.json provenance alone is enough while sources are authoritative.
    expect(providerHasCredentials({ key: undefined, authSourceExists: true })).toBe(true);
  });

  test('providerHasCredentials counts declared env vars for multi-variable providers', () => {
    // Bedrock/Azure/Vertex resolve credentials from several env vars, so
    // OpenCode never sets Provider.key for them; the declared env list is the
    // only signal that the provider is configured.
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, envDeclared: true })).toBe(true);
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, envDeclared: false })).toBe(false);
  });

  test('providerHasCredentials treats options.apiKey as a usable credential', () => {
    // Config-defined providers ship provider.options to the client but never
    // reach Provider.key, so the only authoritative signal is options.apiKey.
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, optionsApiKey: 'sk-config' })).toBe(true);
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, optionsApiKey: '' })).toBe(false);
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, optionsApiKey: '   ' })).toBe(false);
    expect(providerHasCredentials({ key: undefined, authSourceExists: false, optionsApiKey: null })).toBe(false);
  });

  test('env-less OAuth-only provider without credentials opens panel and hides models', () => {
    const hasCredentials = providerHasCredentials({
      key: undefined,
      authSourceExists: false,
    });
    expect(hasCredentials).toBe(false);
    expect(shouldAutoOpenAuthPanel({
      sourcesLoaded: true,
      hasCredentials,
      userDismissed: false,
    })).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 1,
      sourcesLoaded: true,
      hasCredentials,
    })).toBe(false);
  });

  test('provider with stored auth or key shows Connected and models', () => {
    const fromKey = providerHasCredentials({ key: 'sk-live', authSourceExists: false });
    const fromAuth = providerHasCredentials({ key: undefined, authSourceExists: true });
    expect(fromKey).toBe(true);
    expect(fromAuth).toBe(true);
    expect(shouldAutoOpenAuthPanel({
      sourcesLoaded: true,
      hasCredentials: fromKey,
      userDismissed: false,
    })).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 3,
      sourcesLoaded: true,
      hasCredentials: fromAuth,
    })).toBe(true);
  });

  test('editable custom provider keeps models visible even with no credentials signal', () => {
    // Config-defined custom providers (e.g. local LM Studio/Ollama style)
    // are user-editable in place; a stale 'Credentials missing' must not
    // hide their models section. Without the exemption, a keyless local
    // custom provider regresses to 'Credentials missing' with models hidden.
    const hasCredentials = providerHasCredentials({
      key: undefined,
      authSourceExists: false,
      optionsApiKey: null,
    });
    expect(hasCredentials).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 1,
      sourcesLoaded: true,
      hasCredentials: false,
      isEditableCustomProvider: true,
    })).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 1,
      sourcesLoaded: true,
      hasCredentials: false,
      isEditableCustomProvider: false,
    })).toBe(false);
  });

  test('auth save followed by providers refresh recognizes credentials without stale missing state', () => {
    // Pre-save: sources say no auth, provider has no key yet.
    const before = providerHasCredentials({
      key: undefined,
      authSourceExists: false,
    });
    expect(before).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 2,
      sourcesLoaded: true,
      hasCredentials: before,
    })).toBe(false);

    // After reloadOpenCodeConfiguration, providers array gets a key even if the
    // sources snapshot has not been refetched yet.
    const afterProvidersRefresh = providerHasCredentials({
      key: 'oauth-token-present',
      authSourceExists: false,
    });
    expect(afterProvidersRefresh).toBe(true);
    expect(shouldAutoOpenAuthPanel({
      sourcesLoaded: true,
      hasCredentials: afterProvidersRefresh,
      userDismissed: false,
    })).toBe(false);
    expect(shouldShowModelsSection({
      modelCount: 2,
      sourcesLoaded: true,
      hasCredentials: afterProvidersRefresh,
    })).toBe(true);

    // After sources refetch completes, auth.exists also becomes true.
    expect(providerHasCredentials({
      key: 'oauth-token-present',
      authSourceExists: true,
    })).toBe(true);
  });

  test('explicit hide keeps the auth panel closed while credentials are still missing', () => {
    expect(shouldAutoOpenAuthPanel({
      sourcesLoaded: true,
      hasCredentials: false,
      userDismissed: true,
    })).toBe(false);
  });

  test('models stay visible while sources are still loading', () => {
    expect(shouldShowModelsSection({
      modelCount: 4,
      sourcesLoaded: false,
      hasCredentials: false,
    })).toBe(true);
  });

  test('FreeInference provider displays models when credentials are present', () => {
    const creds = providerHasCredentials({
      key: 'fi_test_key_123',
      authSourceExists: true,
    });
    expect(creds).toBe(true);
    expect(shouldShowModelsSection({
      modelCount: 3,
      sourcesLoaded: true,
      hasCredentials: creds,
    })).toBe(true);
  });
});

describe('provider preset search discoverability', () => {
  const sampleProviders = [
    { id: 'anthropic', name: 'Anthropic' },
    { id: 'openai', name: 'OpenAI' },
    { id: FREEINFERENCE_PROVIDER_ID, name: FREEINFERENCE_NAME },
    { id: 'google', name: 'Google' },
  ];

  const search = (query: string) =>
    rankByQuery(sampleProviders, query, (p) => [
      p.name || p.id,
      p.id,
      ...getPresetSearchKeywords(p.id),
    ]);

  test('finds FreeInference using exact and spaced terms', () => {
    expect(search('freeinference')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
    expect(search('free inference')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
    expect(search('free-inference')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
  });

  test('finds FreeInference using harvard and madsys terms', () => {
    expect(search('harvard')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
    expect(search('madsys')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
    expect(search('harvard madsys')[0]?.id).toBe(FREEINFERENCE_PROVIDER_ID);
  });
});

