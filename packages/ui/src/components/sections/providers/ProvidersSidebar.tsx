import React from 'react';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { Button } from '@/components/ui/button';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDeviceInfo } from '@/lib/device';
import { isVSCodeRuntime } from '@/lib/desktop';
import { RiAddLine, RiStackLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

const ADD_PROVIDER_ID = '__add_provider__';

interface ProvidersSidebarProps {
  onItemSelect?: () => void;
}

export const ProvidersSidebar: React.FC<ProvidersSidebarProps> = ({ onItemSelect }) => {
  const providers = useConfigStore((state) => state.providers);
  const selectedProviderId = useConfigStore((state) => state.selectedProviderId);
  const setSelectedProvider = useConfigStore((state) => state.setSelectedProvider);
  const { isMobile } = useDeviceInfo();

  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return typeof window.opencodeDesktop !== 'undefined';
  });

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
  }, []);

  const bgClass = isDesktopRuntime
    ? 'bg-transparent'
    : isVSCode
      ? 'bg-background'
      : 'bg-sidebar';

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <div className={cn('border-b px-3', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">Total {providers.length}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 -my-1 text-muted-foreground"
            onClick={() => {
              setSelectedProvider(ADD_PROVIDER_ID);
              onItemSelect?.();
            }}
            aria-label="Connect provider"
            title="Connect provider"
          >
            <RiAddLine className="size-4" />
          </Button>
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
              <div
                key={provider.id}
                className={cn(
                  'group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200',
                  isSelected ? 'bg-interactive-selection' : 'hover:bg-interactive-hover'
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProvider(provider.id);
                    onItemSelect?.();
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                  tabIndex={0}
                >
                  <ProviderLogo providerId={provider.id} className="h-4 w-4 flex-shrink-0" />
                  <span className="typography-ui-label font-normal truncate flex-1 min-w-0 text-foreground">
                    {provider.name || provider.id}
                  </span>
                  <span className="typography-micro text-muted-foreground/60 flex-shrink-0">
                    {modelCount}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </ScrollableOverlay>
    </div>
  );
};
