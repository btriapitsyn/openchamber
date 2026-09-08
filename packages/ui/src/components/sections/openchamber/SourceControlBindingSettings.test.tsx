import { expect, test } from 'bun:test';

test('every locale supplies repository context copy', async () => {
  const keys = ['configure', 'description', 'needsAttention', 'settings'];
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) expect(dict[`gitView.context.${key}`]).toBeTruthy();
  }
});

test('every locale supplies checkout hydration repair copy', async () => {
  const keys = [
    'title', 'description', 'parentRemote', 'retry', 'endpoint', 'chooseEndpoint',
    'systemConfirmation', 'lfsMissing', 'kind.submodule', 'kind.lfs',
    'status.succeeded', 'status.failed', 'status.cancelled', 'status.authorization-required',
    'status.invalid', 'status.client-missing', 'status.not-needed',
  ] as const;
  const { dict: english } = await import('../../../lib/i18n/messages/en.ts');
  for (const locale of ['en', 'de', 'es', 'fr', 'ja', 'ko', 'pl', 'pt-BR', 'uk', 'zh-CN', 'zh-TW']) {
    const { dict } = await import(`../../../lib/i18n/messages/${locale}.ts`);
    for (const key of keys) {
      const messageKey = `gitView.hydration.${key}` as const;
      expect(dict[messageKey]).toBeTruthy();
      if (locale !== 'en' && !['kind.lfs'].includes(key)) expect(dict[messageKey]).not.toBe(english[messageKey]);
    }
  }
});
