import { describe, expect, test } from 'bun:test';
import { getProviderLogoFallbackIcon } from './providerLogoFallback';

describe('provider logo fallbacks', () => {
  test('uses a local terminal icon for Command Code provider ID variants', () => {
    for (const providerId of ['command-code', 'commandcode', 'command_code', 'command code']) {
      expect(getProviderLogoFallbackIcon(providerId)).toBe('terminal-box');
    }
  });

  test('uses a local ai-agent icon for FreeInference provider ID variants', () => {
    for (const providerId of ['freeinference', 'free-inference', 'free_inference']) {
      expect(getProviderLogoFallbackIcon(providerId)).toBe('ai-agent');
    }
  });

  test('does not replace providers with their own logo assets', () => {
    expect(getProviderLogoFallbackIcon('claude-code')).toBeNull();
    expect(getProviderLogoFallbackIcon('cursor')).toBeNull();
  });
});
