import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { NumberInput } from '@/components/ui/number-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { DEFAULT_MESSAGE_LIMIT } from '@/stores/types/sessionTypes';

const MIN_LIMIT = 10;
const MAX_LIMIT = 500;

export const MemoryLimitsSettings: React.FC = () => {
  const { isMobile } = useDeviceInfo();

  const messageLimit = useUIStore((state) => state.messageLimit);
  const setMessageLimit = useUIStore((state) => state.setMessageLimit);

  const [isLoading, setIsLoading] = React.useState(true);

  // Load settings from server on mount
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { messageLimit?: number } | null = null;

        // 1. Runtime settings API (VSCode)
        if (!data) {
          const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
          if (runtimeSettings) {
            try {
              const result = await runtimeSettings.load();
              const settings = result?.settings as Record<string, unknown> | undefined;
              if (settings) {
                data = {
                  messageLimit: typeof settings.messageLimit === 'number' ? settings.messageLimit : undefined,
                };
              }
            } catch {
              // fall through
            }
          }
        }

        // 2. Fetch API (Web/server)
        if (!data) {
          const response = await fetch('/api/config/settings', {
            method: 'GET',
            headers: { Accept: 'application/json' },
          });
          if (response.ok) {
            data = await response.json();
          }
        }

        if (data && typeof data.messageLimit === 'number') {
          setMessageLimit(data.messageLimit);
        }
      } catch (error) {
        console.warn('Failed to load memory limits settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setMessageLimit]);

  const handleChange = React.useCallback((value: number) => {
    setMessageLimit(value);
    void updateDesktopSettings({ messageLimit: value }).catch((error: unknown) => {
      console.warn('Failed to save messageLimit:', error);
    });
  }, [setMessageLimit]);

  if (isLoading) {
    return null;
  }

  const isDefault = messageLimit === DEFAULT_MESSAGE_LIMIT;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Message Memory</h3>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              How many messages to keep in view per session.<br />
              Older messages are available via "Load more". Background sessions are trimmed automatically.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="typography-ui-label text-foreground">Message limit</span>
              <span className="typography-meta text-muted-foreground">Messages loaded per session</span>
            </div>
            <div className="flex items-center gap-2">
              {!isDefault && (
                <span className="typography-meta text-muted-foreground/60">(default: {DEFAULT_MESSAGE_LIMIT})</span>
              )}
              {isMobile ? (
                <MobileInput value={messageLimit} min={MIN_LIMIT} max={MAX_LIMIT} onChange={handleChange} />
              ) : (
                <NumberInput
                  value={messageLimit}
                  onValueChange={handleChange}
                  min={MIN_LIMIT}
                  max={MAX_LIMIT}
                  step={10}
                  aria-label="Message limit"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MobileInput: React.FC<{ value: number; min: number; max: number; onChange: (v: number) => void }> = ({
  value,
  min,
  max,
  onChange,
}) => {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setDraft(nextValue);
    if (nextValue.trim() === '') return;
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, Math.round(parsed))));
  }, [min, max, onChange]);

  const handleBlur = React.useCallback(() => {
    if (draft.trim() === '') {
      setDraft(String(value));
      return;
    }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    onChange(clamped);
    setDraft(String(clamped));
  }, [draft, value, min, max, onChange]);

  return (
    <input
      type="number"
      inputMode="numeric"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      aria-label="Message limit"
      className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-center typography-ui-label text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
    />
  );
};
