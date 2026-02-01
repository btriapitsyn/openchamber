export type QuotaProviderId = 'openai' | 'google' | 'zai-coding-plan';

export interface UsageWindow {
  usedPercent: number | null;
  remainingPercent: number | null;
  windowSeconds: number | null;
  resetAfterSeconds: number | null;
  resetAt: number | null;
  resetAtFormatted: string | null;
  resetAfterFormatted: string | null;
}

export interface UsageWindows {
  windows: Record<string, UsageWindow>;
}

export interface ProviderUsage extends UsageWindows {
  models?: Record<string, UsageWindows>;
}

export interface ProviderResult {
  providerId: QuotaProviderId;
  providerName: string;
  ok: boolean;
  configured: boolean;
  error?: string;
  usage: ProviderUsage | null;
  fetchedAt: number;
}
