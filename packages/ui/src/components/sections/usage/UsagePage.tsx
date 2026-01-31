import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { UsageCard } from './UsageCard';
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    });
  } catch {
    return '-';
  }
};

export const UsagePage: React.FC = () => {
  const results = useQuotaStore((state) => state.results);
  const selectedProviderId = useQuotaStore((state) => state.selectedProviderId);
  const setSelectedProvider = useQuotaStore((state) => state.setSelectedProvider);
  const loadSettings = useQuotaStore((state) => state.loadSettings);
  const fetchAllQuotas = useQuotaStore((state) => state.fetchAllQuotas);
  const isLoading = useQuotaStore((state) => state.isLoading);
  const lastUpdated = useQuotaStore((state) => state.lastUpdated);
  const error = useQuotaStore((state) => state.error);

  useQuotaAutoRefresh();

  React.useEffect(() => {
    void loadSettings();
    void fetchAllQuotas();
  }, [loadSettings, fetchAllQuotas]);

  React.useEffect(() => {
    if (selectedProviderId) {
      return;
    }
    if (results.length === 0) {
      return;
    }
    const firstConfigured = results.find((entry) => entry.configured)?.providerId;
    setSelectedProvider(firstConfigured ?? QUOTA_PROVIDERS[0]?.id ?? null);
  }, [results, selectedProviderId, setSelectedProvider]);

  const selectedResult = results.find((entry) => entry.providerId === selectedProviderId) ?? null;

  if (!selectedProviderId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="typography-body">Select a provider to view usage details.</p>
      </div>
    );
  }

  const providerMeta = QUOTA_PROVIDERS.find((provider) => provider.id === selectedProviderId);
  const providerName = providerMeta?.name ?? selectedProviderId;
  const usage = selectedResult?.usage;

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-1">
          <h1 className="typography-ui-header font-semibold text-lg">{providerName} Usage</h1>
          <p className="typography-meta text-muted-foreground">
            {isLoading ? 'Refreshing usage...' : `Last updated ${formatTime(lastUpdated)}`}
          </p>
        </div>

        {!selectedResult && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-muted-foreground">
            <p className="typography-body">No usage data available yet.</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-muted-foreground">
            <p className="typography-body">Failed to refresh usage data.</p>
            <p className="typography-meta mt-1">{error}</p>
          </div>
        )}

        {selectedResult && !selectedResult.configured && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-muted-foreground">
            <p className="typography-body">Provider is not configured yet.</p>
            <p className="typography-meta mt-1">
              Add credentials in the Providers tab to enable usage tracking.
            </p>
          </div>
        )}

        {usage?.windows && Object.keys(usage.windows).length > 0 && (
          <div className="space-y-3">
            {Object.entries(usage.windows).map(([label, window]) => (
              <UsageCard key={label} title={label} window={window} />
            ))}
          </div>
        )}

        {usage?.models && Object.keys(usage.models).length > 0 && (
          <div className="space-y-3">
            <div className="typography-ui-header font-semibold text-foreground">Model Quotas</div>
            {Object.entries(usage.models).map(([modelName, modelUsage]) => {
              const entries = Object.entries(modelUsage.windows);
              if (entries.length === 0) {
                return null;
              }
              const [label, window] = entries[0];
              return <UsageCard key={modelName} title={label} subtitle={modelName} window={window} />;
            })}
          </div>
        )}

        {selectedResult?.configured && usage && Object.keys(usage.windows ?? {}).length === 0 &&
          Object.keys(usage.models ?? {}).length === 0 && (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4 text-muted-foreground">
            <p className="typography-body">No quota windows reported for this provider.</p>
          </div>
        )}
      </div>
    </ScrollableOverlay>
  );
};
