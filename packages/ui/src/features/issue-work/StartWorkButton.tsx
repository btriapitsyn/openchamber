import React, { useState } from 'react';
import { RiBriefcaseLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useStartWork } from './useStartWork';


export function StartWorkButton() {
  const [open, setOpen] = useState(false);
  const [issueNumber, setIssueNumber] = useState('');
  const { startWork, loading, error } = useStartWork();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number(issueNumber);
    if (!Number.isFinite(num) || num <= 0) return;
    try {
      await startWork(num);
      setOpen(false);
      setIssueNumber('');
    } catch {
      // error is already surfaced below the input
    }
  };

  return (
    <>
      <Tooltip delayDuration={800}>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 px-0"
            onClick={() => setOpen(true)}
            aria-label="Work on GitHub issue"
          >
            <RiBriefcaseLine className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8}>Work on issue</TooltipContent>
      </Tooltip>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] p-5 shadow-lg">
            <h3 className="mb-1 text-base font-semibold">Work on GitHub Issue</h3>
            <p className="mb-4 text-sm text-[hsl(var(--muted-foreground))]">
              Enter an issue number to create a branch, worktree, and session.
            </p>
            <form onSubmit={handleSubmit}>
              <label className="mb-1 block text-sm font-medium">Issue number</label>
              <input
                type="number"
                min={1}
                value={issueNumber}
                onChange={(e) => setIssueNumber(e.target.value)}
                className="mb-3 w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                placeholder="e.g. 42"
                required
                disabled={loading}
              />
              {error && (
                <p className="mb-3 text-sm text-[hsl(var(--destructive))]">{error}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setOpen(false);
                    setIssueNumber('');
                  }}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={loading || !issueNumber}>
                  {loading ? 'Starting…' : 'Start Work'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
