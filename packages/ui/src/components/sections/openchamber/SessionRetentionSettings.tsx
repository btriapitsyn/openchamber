import React from 'react';
import { toast } from '@/components/ui';
import { NumberInput } from '@/components/ui/number-input';
import { ButtonSmall } from '@/components/ui/button-small';
import { Switch } from '@/components/ui/switch';
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
    <div className="mb-8">
      <div className="mb-3 px-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          Session Retention
        </h3>
        <p className="typography-meta text-muted-foreground mt-0.5">
          Automatically delete inactive sessions based on their last activity. Keeps recent 5 sessions.
        </p>
      </div>

      <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
        <label className="group flex cursor-pointer items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-[var(--interactive-hover)]/30 border-b border-[var(--surface-subtle)]">
          <div className="flex min-w-0 flex-col">
            <span className="typography-ui-label text-foreground">Enable auto-cleanup</span>
            <span className="typography-meta text-muted-foreground">Automatically delete old inactive sessions</span>
          </div>
          <Switch
            checked={autoDeleteEnabled}
            onCheckedChange={setAutoDeleteEnabled}
            className="data-[state=checked]:bg-[var(--primary-base)]"
          />
        </label>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
            <span className="typography-ui-label text-foreground">Retention Period</span>
            <span className="typography-meta text-muted-foreground">Days since last activity</span>
          </div>
          <div className="flex items-center gap-3 flex-1 justify-end">
            {isMobile ? (
              <input
                type="number"
                inputMode="numeric"
                value={mobileDraftDays}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setMobileDraftDays(nextValue);
                  if (nextValue.trim() === '') return;
                  const parsed = Number(nextValue);
                  if (!Number.isFinite(parsed)) return;
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
                className="h-8 w-16 rounded-md border border-[var(--interactive-border)] bg-background px-2 text-center typography-ui-label text-foreground focus:outline-none focus:ring-1 focus:ring-[var(--primary-base)]"
              />
            ) : (
              <NumberInput
                value={autoDeleteAfterDays}
                onValueChange={setAutoDeleteAfterDays}
                min={MIN_DAYS}
                max={MAX_DAYS}
                step={1}
                aria-label="Retention period in days"
                className="w-20 tabular-nums"
              />
            )}
            <span className="typography-ui-label text-muted-foreground">days</span>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-muted/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="typography-meta text-foreground font-medium mb-0.5">Manual Cleanup</p>
          <p className="typography-meta text-muted-foreground">
            Eligible for deletion right now: <span className="tabular-nums">{pendingCount}</span>
          </p>
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
    </div>
  );
};
