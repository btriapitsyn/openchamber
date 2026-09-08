import { describe, expect, test } from 'bun:test';

import { fetchCallableSmallModelProviders } from './smallModelRequest';

describe('fetchCallableSmallModelProviders', () => {
  test('scopes provider discovery to the requested directory', async () => {
    const calls: Array<{ input: string; init: unknown }> = [];
    type FetchImpl = NonNullable<Parameters<typeof fetchCallableSmallModelProviders>[1]>;
    const fetchImpl: FetchImpl = async (input, init) => {
      calls.push({ input: String(input), init });
      return Response.json({ authenticatedProviders: ['custom', 'custom', 'anthropic'] });
    };

    const providers = await fetchCallableSmallModelProviders('/repo', fetchImpl);

    expect(providers).toEqual(['custom', 'anthropic']);
    expect(calls).toEqual([{
      input: '/api/small-model',
      init: {
        method: 'GET',
        headers: { Accept: 'application/json' },
        query: { directory: '/repo' },
      },
    }]);
  });
});
