import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDeviceInfo } from '@/lib/device';
import { RiAddLine, RiStackLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

const ADD_PROVIDER_ID = '__add_provider__';

export const ProvidersSidebar: React.FC = () => {
  const providers = useConfigStore((state) => state.providers);
  const selectedProviderId = useConfigStore((state) => state.selectedProviderId);
  const setSelectedProvider = useConfigStore((state) => state.setSelectedProvider);
  const { isMobile } = useDeviceInfo();

  return (
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="typography-ui-label font-semibold text-foreground">Providers</h2>
          <div className="flex items-center gap-1">
            <span className="typography-meta text-muted-foreground">{providers.length}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setSelectedProvider(ADD_PROVIDER_ID)}
              aria-label="Connect provider"
              title="Connect provider"
            >
              <RiAddLine className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2 overflow-x-hidden">
        {providers.length === 0 ? (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <RiStackLine className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="typography-ui-label font-medium">No providers found</p>
            <p className="typography-meta mt-1 opacity-75">Check your OpenCode configuration</p>
          </div>
        ) : (
          providers.map((provider) => {
            const modelCount = Array.isArray(provider.models) ? provider.models.length : 0;
            const isSelected = provider.id === selectedProviderId;

            return (
              <div key={provider.id} className="group transition-all duration-200">
                <div className="relative">
                  <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1">
                    <button
                      type="button"
                      onClick={() => setSelectedProvider(provider.id)}
                      className="flex-1 text-left overflow-hidden"
                      tabIndex={0}
                    >
                      <div className="flex items-center gap-2">
                        <ProviderLogo providerId={provider.id} className="h-4 w-4 flex-shrink-0" />
                        <span className={cn(
                          "typography-ui-label font-medium truncate flex-1 min-w-0",
                          isSelected
                            ? "text-primary"
                            : "text-foreground hover:text-primary/80"
                        )}>
                          {provider.name || provider.id}
                        </span>
                        <span className="typography-meta text-muted-foreground flex-shrink-0">
                          {modelCount}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </ScrollableOverlay>
    </div>
  );
};
