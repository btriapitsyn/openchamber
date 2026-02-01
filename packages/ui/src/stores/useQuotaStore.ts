import React from 'react';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ProviderResult, QuotaProviderId } from '@/types';
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { getDesktopSettings, isDesktopRuntime, isVSCodeRuntime } from '@/lib/desktop';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';

const DEFAULT_REFRESH_INTERVAL_MS = 60000;

interface QuotaSettingsState {
  autoRefresh: boolean;
  refreshIntervalMs: number;
}

interface QuotaStore extends QuotaSettingsState {
  results: ProviderResult[];
  selectedProviderId: QuotaProviderId | null;
  isLoading: boolean;
  isFetchingProvider: Record<string, boolean>;
  lastUpdated: number | null;
  error: string | null;

  loadSettings: () => Promise<void>;
  fetchAllQuotas: () => Promise<void>;
  fetchProviderQuota: (providerId: QuotaProviderId) => Promise<void>;
  setSelectedProvider: (providerId: QuotaProviderId | null) => void;
  setAutoRefresh: (enabled: boolean) => void;
  setRefreshInterval: (intervalMs: number) => void;
}

const parseSettings = (data: Record<string, unknown> | null): QuotaSettingsState => {
  const autoRefresh = typeof data?.usageAutoRefresh === 'boolean'
    ? data.usageAutoRefresh
    : false;
  const refreshIntervalMs =
    typeof data?.usageRefreshIntervalMs === 'number' && Number.isFinite(data.usageRefreshIntervalMs)
      ? Math.max(30000, Math.min(300000, Math.round(data.usageRefreshIntervalMs)))
      : DEFAULT_REFRESH_INTERVAL_MS;

  return { autoRefresh, refreshIntervalMs };
};

const loadSettingsFromRuntime = async (): Promise<QuotaSettingsState> => {
  if (isDesktopRuntime()) {
    const data = await getDesktopSettings();
    return parseSettings((data as Record<string, unknown>) ?? null);
  }

  const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
  if (runtimeSettings) {
    try {
      const result = await runtimeSettings.load();
      const settings = result?.settings as Record<string, unknown> | undefined;
      return parseSettings(settings ?? null);
    } catch {
      // fall through
    }
  }

  if (!isVSCodeRuntime()) {
    const response = await fetch('/api/config/settings', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    });
    if (response.ok) {
      const data = await response.json().catch(() => null);
      return parseSettings(data as Record<string, unknown> | null);
    }
  }

  return { autoRefresh: false, refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS };
};

export const useQuotaStore = create<QuotaStore>()(
  devtools(
    (set, get) => ({
      results: [],
      selectedProviderId: null,
      isLoading: false,
      isFetchingProvider: {},
      lastUpdated: null,
      error: null,
      autoRefresh: false,
      refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,

      loadSettings: async () => {
        try {
          const settings = await loadSettingsFromRuntime();
          set(settings);
        } catch (error) {
          console.warn('Failed to load usage settings:', error);
        }
      },

      fetchAllQuotas: async () => {
        set({ isLoading: true, error: null });
        const providerIds = QUOTA_PROVIDERS.map((provider) => provider.id);
        try {
          await Promise.all(
            providerIds.map((providerId) => get().fetchProviderQuota(providerId))
          );
          set({
            isLoading: false,
            lastUpdated: Date.now()
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch quotas';
          set({ isLoading: false, error: message });
        }
      },

      fetchProviderQuota: async (providerId) => {
        set((state) => ({
          isFetchingProvider: { ...state.isFetchingProvider, [providerId]: true }
        }));
        try {
          const response = await fetch(`/api/quota/${encodeURIComponent(providerId)}`);
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || 'Failed to fetch quota');
          }

          const result = payload as ProviderResult;
          set((state) => {
            const next = state.results.filter((entry) => entry.providerId !== providerId);
            next.push(result);
            return { results: next, error: null };
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch quota';
          const fallback: ProviderResult = {
            providerId,
            providerName: providerId,
            ok: false,
            configured: false,
            error: message,
            usage: null,
            fetchedAt: Date.now()
          };
          set((state) => {
            const next = state.results.filter((entry) => entry.providerId !== providerId);
            next.push(fallback);
            return { results: next, error: message };
          });
        } finally {
          set((state) => ({
            isFetchingProvider: { ...state.isFetchingProvider, [providerId]: false }
          }));
        }
      },

      setSelectedProvider: (providerId) => set({ selectedProviderId: providerId }),
      setAutoRefresh: (enabled) => set({ autoRefresh: enabled }),
      setRefreshInterval: (intervalMs) => {
        const clamped = Math.max(30000, Math.min(300000, Math.round(intervalMs)));
        set({ refreshIntervalMs: clamped });
      }
    }),
    { name: 'quota-store' }
  )
);

export const useQuotaAutoRefresh = () => {
  const autoRefresh = useQuotaStore((state) => state.autoRefresh);
  const refreshIntervalMs = useQuotaStore((state) => state.refreshIntervalMs);
  const fetchAllQuotas = useQuotaStore((state) => state.fetchAllQuotas);

  React.useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const interval = window.setInterval(() => {
      fetchAllQuotas();
    }, refreshIntervalMs);

    return () => window.clearInterval(interval);
  }, [autoRefresh, refreshIntervalMs, fetchAllQuotas]);
};
