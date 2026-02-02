import type { ProviderResult, QuotaProviderId } from '@/types';

export interface QuotaProvider {
  id: QuotaProviderId;
  name: string;
  isConfigured: () => Promise<boolean>;
  fetchQuota: () => Promise<ProviderResult>;
}
