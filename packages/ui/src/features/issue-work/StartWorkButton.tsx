import React, { useState } from 'react';
import { RiBriefcaseLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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

      <Dialog open={open} onOpenChange={(isOpen) => {
        if (!loading) {
          setOpen(isOpen);
          if (!isOpen) setIssueNumber('');
        }
      }}>
        <DialogContent showCloseButton={false} className="max-w-sm gap-5">
          <DialogHeader>
            <DialogTitle>Work on GitHub Issue</DialogTitle>
            <DialogDescription>
              Enter an issue number to create a branch, worktree, and session.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="typography-ui-label text-[hsl(var(--foreground))]">Issue number</label>
              <Input
                type="number"
                min={1}
                value={issueNumber}
                onChange={(e) => setIssueNumber(e.target.value)}
                placeholder="e.g. 42"
                required
                disabled={loading}
              />
              {error && (
                <p className="typography-micro text-[hsl(var(--status-error))]">{error}</p>
              )}
            </div>
            <DialogFooter className="w-full sm:justify-end">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setIssueNumber('');
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !issueNumber}>
                {loading ? 'Starting…' : 'Start Work'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
