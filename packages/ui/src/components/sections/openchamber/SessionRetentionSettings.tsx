import React from 'react';
import { toast } from '@/components/ui';
import { RiInformationLine } from '@remixicon/react';
import { NumberInput } from '@/components/ui/number-input';
import { ButtonSmall } from '@/components/ui/button-small';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Checkbox } from '@/components/ui/checkbox';
import { useDeviceInfo } from '@/lib/device';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';

const MIN_DAYS = 1;
const MAX_DAYS = 365;

export const SessionRetentionSettings: React.FC = () => {
  const { isMobile } = useDeviceInfo();
  const autoDeleteEnabled = useUIStore((state) => state.autoDeleteEnabled);
  const autoDeleteAfterDays = useUIStore((state) => state.autoDeleteAfterDays);
  const setAutoDeleteEnabled = useUIStore((state) => state.setAutoDeleteEnabled);
  const setAutoDeleteAfterDays = useUIStore((state) => state.setAutoDeleteAfterDays);

  const [mobileDraftDays, setMobileDraftDays] = React.useState(String(autoDeleteAfterDays));

  React.useEffect(() => {
    setMobileDraftDays(String(autoDeleteAfterDays));
  }, [autoDeleteAfterDays]);

  const { candidates, isRunning, runCleanup } = useSessionAutoCleanup({ autoRun: false });
  const pendingCount = candidates.length;

  const handleRunCleanup = React.useCallback(async () => {
    const result = await runCleanup({ force: true });
    if (result.deletedIds.length === 0 && result.failedIds.length === 0) {
      toast.message('No sessions eligible for deletion');
      return;
    }
    if (result.deletedIds.length > 0) {
      toast.success(`Deleted ${result.deletedIds.length} session${result.deletedIds.length === 1 ? '' : 's'}`);
    }
    if (result.failedIds.length > 0) {
      toast.error(`Failed to delete ${result.failedIds.length} session${result.failedIds.length === 1 ? '' : 's'}`);
    }
  }, [runCleanup]);

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h3 className="typography-ui-header font-semibold text-foreground">Session retention</h3>
          <Tooltip delayDuration={1000}>
            <TooltipTrigger asChild>
              <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
            </TooltipTrigger>
            <TooltipContent sideOffset={8} className="max-w-xs">
              Automatically delete inactive sessions based on their last activity.<br />
              You can also run a one-time cleanup without enabling auto-cleanup.<br />
              Keeps the most recent 5 sessions, and never deletes shared sessions.
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <Checkbox
          checked={autoDeleteEnabled}
          onChange={setAutoDeleteEnabled}
        />
        <span className="typography-ui-header font-semibold text-foreground">Enable auto-cleanup</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          {isMobile ? (
            <input
              type="number"
              inputMode="numeric"
              value={mobileDraftDays}
              onChange={(event) => {
                const nextValue = event.target.value;
                setMobileDraftDays(nextValue);
                if (nextValue.trim() === '') {
                  return;
                }
                const parsed = Number(nextValue);
                if (!Number.isFinite(parsed)) {
                  return;
                }
                const clamped = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(parsed)));
                setAutoDeleteAfterDays(clamped);
              }}
              onBlur={() => {
                if (mobileDraftDays.trim() === '') {
                  setMobileDraftDays(String(autoDeleteAfterDays));
                  return;
                }
                const parsed = Number(mobileDraftDays);
                if (!Number.isFinite(parsed)) {
                  setMobileDraftDays(String(autoDeleteAfterDays));
                  return;
                }
                const clamped = Math.min(MAX_DAYS, Math.max(MIN_DAYS, Math.round(parsed)));
                setAutoDeleteAfterDays(clamped);
                setMobileDraftDays(String(clamped));
              }}
              aria-label="Retention period in days"
              className="h-8 w-16 rounded-lg border border-border bg-background px-2 text-center typography-ui-label text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/50"
            />
          ) : (
            <NumberInput
              value={autoDeleteAfterDays}
              onValueChange={setAutoDeleteAfterDays}
              min={MIN_DAYS}
              max={MAX_DAYS}
              step={1}
              aria-label="Retention period in days"
            />
          )}
          <span className="typography-ui-label text-muted-foreground">days since last activity</span>
        </div>
        <ButtonSmall
          type="button"
          variant="outline"
          onClick={handleRunCleanup}
          disabled={isRunning}
        >
          {isRunning ? 'Cleaning up...' : 'Run cleanup now'}
        </ButtonSmall>
      </div>

      <div className="typography-meta text-muted-foreground">
        Eligible for deletion right now: {pendingCount}
      </div>
    </div>
  );
};
