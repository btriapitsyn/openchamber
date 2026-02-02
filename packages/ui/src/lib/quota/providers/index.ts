import type { QuotaProviderId } from '@/types';

export interface QuotaProviderMeta {
  id: QuotaProviderId;
  name: string;
}

export const QUOTA_PROVIDERS: QuotaProviderMeta[] = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'google', name: 'Google' },
  { id: 'zai-coding-plan', name: 'z.ai' }
];

export const QUOTA_PROVIDER_MAP = QUOTA_PROVIDERS.reduce<Record<string, QuotaProviderMeta>>(
  (acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  },
  {}
);
