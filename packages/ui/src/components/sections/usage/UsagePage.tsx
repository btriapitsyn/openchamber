import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { UsageCard } from './UsageCard';
import { QUOTA_PROVIDERS } from '@/lib/quota';
import { useQuotaAutoRefresh, useQuotaStore } from '@/stores/useQuotaStore';
import { Switch } from '@/components/ui/switch';
import { updateDesktopSettings } from '@/lib/persistence';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { RiArrowDownSLine, RiArrowRightSLine } from '@remixicon/react';
import type { UsageWindows, QuotaProviderId } from '@/types';
import { getAllModelFamilies, getDisplayModelName, sortModelFamilies, groupModelsByFamilyWithGetter } from '@/lib/quota/model-families';

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

interface ModelInfo {
  name: string;
  windows: UsageWindows;
}

export const UsagePage: React.FC = () => {
  const results = useQuotaStore((state) => state.results);
  const selectedProviderId = useQuotaStore((state) => state.selectedProviderId);
  const setSelectedProvider = useQuotaStore((state) => state.setSelectedProvider);
  const loadSettings = useQuotaStore((state) => state.loadSettings);
  const fetchAllQuotas = useQuotaStore((state) => state.fetchAllQuotas);
  const isLoading = useQuotaStore((state) => state.isLoading);
  const lastUpdated = useQuotaStore((state) => state.lastUpdated);
  const error = useQuotaStore((state) => state.error);
  const dropdownProviderIds = useQuotaStore((state) => state.dropdownProviderIds);
  const setDropdownProviderIds = useQuotaStore((state) => state.setDropdownProviderIds);
  const selectedModels = useQuotaStore((state) => state.selectedModels);
  const toggleModelSelected = useQuotaStore((state) => state.toggleModelSelected);
  const applyDefaultSelections = useQuotaStore((state) => state.applyDefaultSelections);

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

  const providerMeta = QUOTA_PROVIDERS.find((provider) => provider.id === selectedProviderId);
  const providerName = providerMeta?.name ?? selectedProviderId ?? 'Usage';
  const usage = selectedResult?.usage;
  const showInDropdown = selectedProviderId ? dropdownProviderIds.includes(selectedProviderId) : false;
  const handleDropdownToggle = React.useCallback((enabled: boolean) => {
    if (!selectedProviderId) {
      return;
    }
    const next = enabled
      ? Array.from(new Set([...dropdownProviderIds, selectedProviderId]))
      : dropdownProviderIds.filter((id) => id !== selectedProviderId);
    setDropdownProviderIds(next);
    void updateDesktopSettings({ usageDropdownProviders: next });
  }, [dropdownProviderIds, selectedProviderId, setDropdownProviderIds]);

  // Get models for the selected provider
  const providerModels = React.useMemo((): ModelInfo[] => {
    if (!usage?.models) return [];
    return Object.entries(usage.models)
      .map(([name, modelUsage]) => ({ name, windows: modelUsage }))
      .filter((model) => Object.keys(model.windows.windows).length > 0);
  }, [usage?.models]);

  // Apply default selections on mount if no prior selections exist
  React.useEffect(() => {
    if (selectedProviderId && providerModels.length > 0) {
      applyDefaultSelections(selectedProviderId, providerModels.map((m) => m.name));
    }
  }, [selectedProviderId, providerModels, applyDefaultSelections]);

  // Group models by family
  const modelsByFamily = React.useMemo(() => {
    if (!selectedProviderId || providerModels.length === 0) {
      return new Map<string | null, ModelInfo[]>();
    }
    return groupModelsByFamilyWithGetter(
      providerModels,
      (model) => model.name,
      selectedProviderId as QuotaProviderId
    );
  }, [providerModels, selectedProviderId]);

  // Get sorted families
  const sortedFamilies = React.useMemo(() => {
    if (!selectedProviderId) return [];
    const families = getAllModelFamilies(selectedProviderId as QuotaProviderId);
    return sortModelFamilies(families);
  }, [selectedProviderId]);

  // Collapsible state for family sections (persist per provider)
  const [collapsedFamilies, setCollapsedFamilies] = React.useState<Record<string, boolean>>(() => {
    // Default: all families start expanded (not collapsed)
    return {};
  });

  const toggleFamilyCollapsed = React.useCallback((familyId: string) => {
    setCollapsedFamilies((prev) => ({
      ...prev,
      [familyId]: !prev[familyId],
    }));
  }, []);

  const handleModelToggle = React.useCallback((modelName: string) => {
    if (!selectedProviderId) return;
    toggleModelSelected(selectedProviderId, modelName);
    // Also update settings to persist
    const currentSelected = selectedModels[selectedProviderId] ?? [];
    const isSelected = currentSelected.includes(modelName);
    const nextSelected = isSelected
      ? currentSelected.filter((m) => m !== modelName)
      : [...currentSelected, modelName];
    const nextSettings: Record<string, string[]> = { ...selectedModels, [selectedProviderId]: nextSelected };
    void updateDesktopSettings({ usageSelectedModels: nextSettings });
  }, [selectedProviderId, selectedModels, toggleModelSelected]);

  // Get selected models for this provider
  const providerSelectedModels = selectedProviderId ? (selectedModels[selectedProviderId] ?? []) : [];

  if (!selectedProviderId) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="typography-body">Select a provider to view usage details.</p>
      </div>
    );
  }

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ProviderLogo providerId={selectedProviderId} className="h-5 w-5" />
                <h1 className="typography-ui-header font-semibold text-lg">{providerName} Usage</h1>
              </div>
              <p className="typography-meta text-muted-foreground">
                {isLoading ? 'Refreshing usage...' : `Last updated ${formatTime(lastUpdated)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="typography-micro text-muted-foreground">Show in dropdown</span>
            <Switch
              checked={showInDropdown}
              onCheckedChange={handleDropdownToggle}
              aria-label={`Show ${providerName} in usage dropdown`}
              className="data-[state=checked]:bg-[var(--status-info)]"
            />
          </div>
        </div>

        {!selectedResult && (
          <div className="rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)]/60 p-4 text-muted-foreground">
            <p className="typography-body">No usage data available yet.</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)]/60 p-4 text-muted-foreground">
            <p className="typography-body">Failed to refresh usage data.</p>
            <p className="typography-meta mt-1">{error}</p>
          </div>
        )}

        {selectedResult && !selectedResult.configured && (
          <div className="rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)]/60 p-4 text-muted-foreground">
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

        {/* Models Section - Grouped by Family */}
        {providerModels.length > 0 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h2 className="typography-ui-header font-semibold text-foreground">Models</h2>
              <p className="typography-meta text-muted-foreground">
                Toggle on to show in header dropdown
              </p>
            </div>

            {/* Predefined families (Gemini, Claude) */}
            {sortedFamilies.map((family) => {
              const familyModels = modelsByFamily.get(family.id) ?? [];
              if (familyModels.length === 0) return null;

              const isCollapsed = collapsedFamilies[family.id] ?? false;

              return (
                <Collapsible
                  key={family.id}
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed(family.id)}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-left group">
                    <div className="space-y-0.5">
                      <div className="typography-ui-label font-semibold text-foreground">{family.label}</div>
                      <p className="typography-meta text-muted-foreground">
                        {familyModels.length} model{familyModels.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {isCollapsed ? (
                      <RiArrowRightSLine className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <RiArrowDownSLine className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-3">
                    {familyModels.map((model) => {
                      const entries = Object.entries(model.windows.windows);
                      if (entries.length === 0) return null;
                      const [label, window] = entries[0];
                      const isSelected = providerSelectedModels.includes(model.name);

                      return (
                        <UsageCard
                          key={model.name}
                          title={label}
                          subtitle={getDisplayModelName(model.name)}
                          window={window}
                          showToggle
                          toggleEnabled={isSelected}
                          onToggle={() => handleModelToggle(model.name)}
                        />
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}

            {/* Other family */}
            {(() => {
              const otherModels = modelsByFamily.get(null) ?? [];
              if (otherModels.length === 0) return null;

              const isCollapsed = collapsedFamilies['other'] ?? false;

              return (
                <Collapsible
                  open={!isCollapsed}
                  onOpenChange={() => toggleFamilyCollapsed('other')}
                >
                  <CollapsibleTrigger className="flex w-full items-center justify-between py-2 text-left group">
                    <div className="space-y-0.5">
                      <div className="typography-ui-label font-semibold text-foreground">Other</div>
                      <p className="typography-meta text-muted-foreground">
                        {otherModels.length} model{otherModels.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                    {isCollapsed ? (
                      <RiArrowRightSLine className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    ) : (
                      <RiArrowDownSLine className="h-5 w-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2 space-y-3">
                    {otherModels.map((model) => {
                      const entries = Object.entries(model.windows.windows);
                      if (entries.length === 0) return null;
                      const [label, window] = entries[0];
                      const isSelected = providerSelectedModels.includes(model.name);

                      return (
                        <UsageCard
                          key={model.name}
                          title={label}
                          subtitle={getDisplayModelName(model.name)}
                          window={window}
                          showToggle
                          toggleEnabled={isSelected}
                          onToggle={() => handleModelToggle(model.name)}
                        />
                      );
                    })}
                  </CollapsibleContent>
                </Collapsible>
              );
            })()}
          </div>
        )}

        {selectedResult?.configured && usage && Object.keys(usage.windows ?? {}).length === 0 &&
          providerModels.length === 0 && (
          <div className="rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)]/60 p-4 text-muted-foreground">
            <p className="typography-body">No quota windows reported for this provider.</p>
          </div>
        )}
      </div>
    </ScrollableOverlay>
  );
};
