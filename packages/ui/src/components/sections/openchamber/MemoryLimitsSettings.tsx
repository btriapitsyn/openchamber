import React from 'react';
import { RiInformationLine } from '@remixicon/react';
import { NumberInput } from '@/components/ui/number-input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';
import { updateDesktopSettings } from '@/lib/persistence';
import { getDesktopSettings, isDesktopRuntime } from '@/lib/desktop';
import { getRegisteredRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { DEFAULT_MEMORY_LIMITS, DEFAULT_ACTIVE_SESSION_WINDOW } from '@/stores/types/sessionTypes';

const MIN_HISTORICAL = 10;
const MAX_HISTORICAL = 500;
const MIN_VIEWPORT = 20;
const MAX_VIEWPORT = 500;
const MIN_ACTIVE = 30;
const MAX_ACTIVE = 1000;

export const MemoryLimitsSettings: React.FC = () => {
  const { isMobile } = useDeviceInfo();
  
  const memoryLimitHistorical = useUIStore((state) => state.memoryLimitHistorical);
  const memoryLimitViewport = useUIStore((state) => state.memoryLimitViewport);
  const memoryLimitActiveSession = useUIStore((state) => state.memoryLimitActiveSession);
  const setMemoryLimitHistorical = useUIStore((state) => state.setMemoryLimitHistorical);
  const setMemoryLimitViewport = useUIStore((state) => state.setMemoryLimitViewport);
  const setMemoryLimitActiveSession = useUIStore((state) => state.setMemoryLimitActiveSession);

  const [isLoading, setIsLoading] = React.useState(true);

  // Load settings from server on mount
  React.useEffect(() => {
    const loadSettings = async () => {
      try {
        let data: { memoryLimitHistorical?: number; memoryLimitViewport?: number; memoryLimitActiveSession?: number } | null = null;

        // 1. Desktop runtime (Tauri)
        if (isDesktopRuntime()) {
          data = await getDesktopSettings();
        } else {
          // 2. Runtime settings API (VSCode)
          const runtimeSettings = getRegisteredRuntimeAPIs()?.settings;
          if (runtimeSettings) {
            try {
              const result = await runtimeSettings.load();
              const settings = result?.settings as Record<string, unknown> | undefined;
              if (settings) {
                data = {
                  memoryLimitHistorical: typeof settings.memoryLimitHistorical === 'number' ? settings.memoryLimitHistorical : undefined,
                  memoryLimitViewport: typeof settings.memoryLimitViewport === 'number' ? settings.memoryLimitViewport : undefined,
                  memoryLimitActiveSession: typeof settings.memoryLimitActiveSession === 'number' ? settings.memoryLimitActiveSession : undefined,
                };
              }
            } catch {
              // Fall through to fetch
            }
          }

          // 3. Fetch API (Web)
          if (!data) {
            const response = await fetch('/api/config/settings', {
              method: 'GET',
              headers: { Accept: 'application/json' },
            });
            if (response.ok) {
              data = await response.json();
            }
          }
        }

        if (data) {
          if (typeof data.memoryLimitHistorical === 'number') {
            setMemoryLimitHistorical(data.memoryLimitHistorical);
          }
          if (typeof data.memoryLimitViewport === 'number') {
            setMemoryLimitViewport(data.memoryLimitViewport);
          }
          if (typeof data.memoryLimitActiveSession === 'number') {
            setMemoryLimitActiveSession(data.memoryLimitActiveSession);
          }
        }
      } catch (error) {
        console.warn('Failed to load memory limits settings:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [setMemoryLimitHistorical, setMemoryLimitViewport, setMemoryLimitActiveSession]);

  const persistSetting = React.useCallback(async (key: string, value: number) => {
    try {
      await updateDesktopSettings({ [key]: value });

      if (!isDesktopRuntime()) {
        const response = await fetch('/api/config/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [key]: value }),
        });
        if (!response.ok) {
          console.warn(`Failed to save ${key} to server:`, response.status, response.statusText);
        }
      }
    } catch (error) {
      console.warn(`Failed to save ${key}:`, error);
    }
  }, []);

  const handleHistoricalChange = React.useCallback((value: number) => {
    setMemoryLimitHistorical(value);
    persistSetting('memoryLimitHistorical', value);
  }, [setMemoryLimitHistorical, persistSetting]);

  const handleViewportChange = React.useCallback((value: number) => {
    setMemoryLimitViewport(value);
    persistSetting('memoryLimitViewport', value);
  }, [setMemoryLimitViewport, persistSetting]);

  const handleActiveSessionChange = React.useCallback((value: number) => {
    setMemoryLimitActiveSession(value);
    persistSetting('memoryLimitActiveSession', value);
  }, [setMemoryLimitActiveSession, persistSetting]);

  if (isLoading) {
    return null;
  }

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
              Control how many messages are kept in memory for performance optimization.<br />
              Lower values use less memory but may require reloading older messages.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="space-y-3">
        <MemoryLimitRow
          label="Initial load limit"
          description="Messages loaded when opening a session"
          value={memoryLimitHistorical}
          defaultValue={DEFAULT_MEMORY_LIMITS.HISTORICAL_MESSAGES}
          min={MIN_HISTORICAL}
          max={MAX_HISTORICAL}
          onChange={handleHistoricalChange}
          isMobile={isMobile}
        />

        <MemoryLimitRow
          label="Background trim limit"
          description="Max messages kept when switching away"
          value={memoryLimitViewport}
          defaultValue={DEFAULT_MEMORY_LIMITS.VIEWPORT_MESSAGES}
          min={MIN_VIEWPORT}
          max={MAX_VIEWPORT}
          onChange={handleViewportChange}
          isMobile={isMobile}
        />

        <MemoryLimitRow
          label="Active session limit"
          description="Max messages for active session"
          value={memoryLimitActiveSession}
          defaultValue={DEFAULT_ACTIVE_SESSION_WINDOW}
          min={MIN_ACTIVE}
          max={MAX_ACTIVE}
          onChange={handleActiveSessionChange}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
};

interface MemoryLimitRowProps {
  label: string;
  description: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  isMobile: boolean;
}

const MemoryLimitRow: React.FC<MemoryLimitRowProps> = ({
  label,
  description,
  value,
  defaultValue,
  min,
  max,
  onChange,
  isMobile,
}) => {
  const [draft, setDraft] = React.useState(String(value));

  React.useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const handleMobileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value;
    setDraft(nextValue);
    if (nextValue.trim() === '') {
      return;
    }
    const parsed = Number(nextValue);
    if (!Number.isFinite(parsed)) {
      return;
    }
    const clamped = Math.min(max, Math.max(min, Math.round(parsed)));
    onChange(clamped);
  }, [min, max, onChange]);

  const handleMobileBlur = React.useCallback(() => {
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

  const isDefault = value === defaultValue;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="typography-ui-label text-foreground">{label}</span>
          <span className="typography-meta text-muted-foreground">{description}</span>
        </div>
        <div className="flex items-center gap-2">
          {!isDefault && (
            <span className="typography-meta text-muted-foreground/60">(default: {defaultValue})</span>
          )}
          {isMobile ? (
            <input
              type="number"
              inputMode="numeric"
              value={draft}
              onChange={handleMobileChange}
              onBlur={handleMobileBlur}
              aria-label={label}
              className="h-8 w-20 rounded-lg border border-border bg-background px-2 text-center typography-ui-label text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          ) : (
            <NumberInput
              value={value}
              onValueChange={onChange}
              min={min}
              max={max}
              step={10}
              aria-label={label}
            />
          )}
        </div>
      </div>
    </div>
  );
};
