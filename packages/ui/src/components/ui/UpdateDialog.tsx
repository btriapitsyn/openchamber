import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { RiCheckLine, RiClipboardLine, RiDownloadCloudLine, RiDownloadLine, RiExternalLinkLine, RiLoaderLine, RiRestartLine, RiTerminalLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import type { UpdateInfo, UpdateProgress } from '@/lib/desktop';

type WebUpdateState = 'idle' | 'updating' | 'restarting' | 'reconnecting' | 'error';

interface UpdateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  info: UpdateInfo | null;
  downloading: boolean;
  downloaded: boolean;
  progress: UpdateProgress | null;
  error: string | null;
  onDownload: () => void;
  onRestart: () => void;
  /** Runtime type to show different UI for desktop vs web */
  runtimeType?: 'desktop' | 'web' | 'vscode' | null;
}

const GITHUB_RELEASES_URL = 'https://github.com/btriapitsyn/openchamber/releases';

type ChangelogSection = {
  version: string;
  date: string;
  start: number;
  end: number;
  raw: string;
};

type ParsedChangelog =
  | {
      kind: 'raw';
      title: string;
      content: string;
    }
  | {
      kind: 'sections';
      title: string;
      sections: Array<{ version: string; dateLabel: string; content: string }>;
    };

function formatIsoDateForUI(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

function stripChangelogHeading(sectionRaw: string): string {
  return sectionRaw.replace(/^## \[[^\]]+\] - \d{4}-\d{2}-\d{2}\s*\n?/, '').trim();
}

function compareSemverDesc(a: string, b: string): number {
  const pa = a.split('.').map((v) => Number.parseInt(v, 10));
  const pb = b.split('.').map((v) => Number.parseInt(v, 10));
  for (let i = 0; i < 3; i += 1) {
    const da = Number.isFinite(pa[i]) ? (pa[i] as number) : 0;
    const db = Number.isFinite(pb[i]) ? (pb[i] as number) : 0;
    if (da !== db) {
      return db - da;
    }
  }
  return 0;
}

function parseChangelogSections(body: string): ChangelogSection[] {
  const re = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})\s*$/gm;
  const matches: Array<{ version: string; date: string; start: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    matches.push({
      version: m[1] ?? '',
      date: m[2] ?? '',
      start: m.index,
    });
  }

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match, idx) => {
    const end = matches[idx + 1]?.start ?? body.length;
    const raw = body.slice(match.start, end).trim();
    return { version: match.version, date: match.date, start: match.start, end, raw };
  });
}


async function installWebUpdate(): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/openchamber/update-install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      return { success: false, error: data.error || `Server error: ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Failed to install update' };
  }
}

async function waitForServerRestart(maxAttempts = 30, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('/health', { method: 'GET' });
      if (response.ok) {
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}

export const UpdateDialog: React.FC<UpdateDialogProps> = ({
  open,
  onOpenChange,
  info,
  downloading,
  downloaded,
  progress,
  error,
  onDownload,
  onRestart,
  runtimeType = 'desktop',
}) => {
  const [copied, setCopied] = useState(false);
  const [webUpdateState, setWebUpdateState] = useState<WebUpdateState>('idle');
  const [webError, setWebError] = useState<string | null>(null);

  const releaseUrl = info?.version
    ? `${GITHUB_RELEASES_URL}/tag/v${info.version}`
    : GITHUB_RELEASES_URL;

  const progressPercent = progress?.total
    ? Math.round((progress.downloaded / progress.total) * 100)
    : 0;

  const isWebRuntime = runtimeType === 'web';
  const updateCommand = info?.updateCommand || 'openchamber update';

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setWebUpdateState('idle');
      setWebError(null);
    }
  }, [open]);

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(updateCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied
    }
  };

  const handleWebUpdate = useCallback(async () => {
    setWebUpdateState('updating');
    setWebError(null);

    const result = await installWebUpdate();

    if (!result.success) {
      setWebUpdateState('error');
      setWebError(result.error || 'Update failed');
      return;
    }

    // Server will restart, wait for it to come back
    setWebUpdateState('restarting');

    // Wait a bit for server to shut down
    await new Promise(resolve => setTimeout(resolve, 2000));

    setWebUpdateState('reconnecting');

    const serverBack = await waitForServerRestart();

    if (serverBack) {
      // Reload the page to get the new version
      window.location.reload();
    } else {
      setWebUpdateState('error');
      setWebError('Server did not restart. Please refresh manually or run: openchamber restart');
    }
  }, []);

  const isWebUpdating = webUpdateState !== 'idle' && webUpdateState !== 'error';

  const changelog = useMemo<ParsedChangelog | null>(() => {
    if (!info?.body) {
      return null;
    }

    const body = info.body.trim();
    if (!body) {
      return null;
    }

    const sections = parseChangelogSections(body);

    if (sections.length === 0) {
      return {
        kind: 'raw',
        title: "What's new",
        content: body,
      };
    }

    const sorted = [...sections].sort((a, b) => compareSemverDesc(a.version, b.version));
    return {
      kind: 'sections',
      title: "What's new",
      sections: sorted.map((section) => ({
        version: section.version,
        dateLabel: formatIsoDateForUI(section.date),
        content: stripChangelogHeading(section.raw) || body,
      })),
    };
  }, [info?.body]);

  return (
    <Dialog open={open} onOpenChange={isWebUpdating ? undefined : onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RiDownloadCloudLine className="h-5 w-5 text-primary" />
            {webUpdateState === 'restarting' || webUpdateState === 'reconnecting'
              ? 'Updating...'
              : 'Update Available'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {(info?.currentVersion || info?.version) && (
            <div className="flex items-center gap-2 text-sm">
              {info?.currentVersion && (
                <span className="font-mono">{info.currentVersion}</span>
              )}
              {info?.currentVersion && info?.version && (
                <span className="text-muted-foreground">→</span>
              )}
              {info?.version && (
                <span className="font-mono text-primary">{info.version}</span>
              )}
            </div>
          )}

          {/* Web update progress */}
          {isWebRuntime && isWebUpdating && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <RiLoaderLine className="h-5 w-5 animate-spin text-primary" />
                <div className="text-sm">
                  {webUpdateState === 'updating' && 'Installing update...'}
                  {webUpdateState === 'restarting' && 'Server restarting...'}
                  {webUpdateState === 'reconnecting' && 'Waiting for server...'}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                The page will reload automatically when the update is complete.
              </p>
            </div>
          )}

          {changelog && !isWebUpdating && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="typography-ui-label font-medium text-foreground/90">
                  {changelog.title}
                </div>
              </div>

              <ScrollableOverlay
                className={cn(
                  'max-h-56 rounded-md border border-border/70',
                  'bg-background/40 p-3'
                )}
                fillContainer={false}
              >
                {changelog.kind === 'raw' ? (
                  <SimpleMarkdownRenderer
                    content={changelog.content}
                    className="typography-markdown-body text-foreground/90 leading-relaxed pr-3"
                  />
                ) : (
                  <div className="space-y-4 pr-3">
                    {changelog.sections.map((section, idx) => (
                      <div
                        key={section.version}
                        className={cn(
                          idx > 0 && 'border-t border-border/40 pt-3'
                        )}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className={cn(
                              'typography-ui-badge font-mono',
                              'bg-primary/10 text-primary',
                              'px-2 py-0.5 rounded-md'
                            )}
                          >
                            v{section.version}
                          </span>
                          <span className="typography-micro text-muted-foreground">
                            {section.dateLabel}
                          </span>
                        </div>
                        <SimpleMarkdownRenderer
                          content={section.content}
                          className="typography-markdown-body text-foreground/90 leading-relaxed"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </ScrollableOverlay>
            </div>
          )}

          {/* Web runtime: show CLI command only on error as fallback */}
          {isWebRuntime && webUpdateState === 'error' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <RiTerminalLine className="h-4 w-4" />
                <span>Or update via terminal:</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-muted rounded-md font-mono text-sm text-foreground overflow-x-auto">
                  {updateCommand}
                </code>
                <button
                  onClick={handleCopyCommand}
                  className={cn(
                    'flex items-center justify-center p-2 rounded-md',
                    'text-muted-foreground hover:text-foreground hover:bg-interactive-hover',
                    'transition-colors',
                    copied && 'text-primary'
                  )}
                  title={copied ? 'Copied!' : 'Copy command'}
                >
                  {copied ? (
                    <RiCheckLine className="h-4 w-4" />
                  ) : (
                    <RiClipboardLine className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Desktop runtime: show download progress */}
          {!isWebRuntime && downloading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Downloading...</span>
                <span className="font-mono">{progressPercent}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {(error || webError) && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error || webError}</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md',
                'text-sm text-muted-foreground',
                'hover:text-foreground hover:bg-interactive-hover',
                'transition-colors'
              )}
            >
              <RiExternalLinkLine className="h-4 w-4" />
              GitHub
            </a>

            {/* Desktop runtime buttons */}
            {!isWebRuntime && !downloaded && !downloading && (
              <button
                onClick={onDownload}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md',
                  'text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'transition-colors'
                )}
              >
                <RiDownloadLine className="h-4 w-4" />
                Download Update
              </button>
            )}

            {!isWebRuntime && downloading && (
              <button
                disabled
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md',
                  'text-sm font-medium',
                  'bg-primary/50 text-primary-foreground',
                  'cursor-not-allowed'
                )}
              >
                <RiLoaderLine className="h-4 w-4 animate-spin" />
                Downloading...
              </button>
            )}

            {!isWebRuntime && downloaded && (
              <button
                onClick={onRestart}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md',
                  'text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'transition-colors'
                )}
              >
                <RiRestartLine className="h-4 w-4" />
                Restart to Update
              </button>
            )}

            {/* Web runtime: Update Now button */}
            {isWebRuntime && !isWebUpdating && (
              <button
                onClick={handleWebUpdate}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md',
                  'text-sm font-medium',
                  'bg-primary text-primary-foreground',
                  'hover:bg-primary/90',
                  'transition-colors'
                )}
              >
                <RiDownloadLine className="h-4 w-4" />
                Update Now
              </button>
            )}

            {/* Web runtime: updating state */}
            {isWebRuntime && isWebUpdating && (
              <button
                disabled
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-md',
                  'text-sm font-medium',
                  'bg-primary/50 text-primary-foreground',
                  'cursor-not-allowed'
                )}
              >
                <RiLoaderLine className="h-4 w-4 animate-spin" />
                Updating...
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
