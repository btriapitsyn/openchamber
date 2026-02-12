import React from 'react';
import { RiDiscordFill, RiGithubFill, RiTwitterXFill } from '@remixicon/react';
import { useUpdateStore } from '@/stores/useUpdateStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';

const GITHUB_URL = 'https://github.com/btriapitsyn/openchamber';

export const AboutSettings: React.FC = () => {
  const currentVersion = useUpdateStore((state) => state.info?.currentVersion) || 'unknown';
  const { isMobile } = useDeviceInfo();

  // Compact mobile layout for sidebar footer
  if (isMobile) {
    return (
      <div className="w-full space-y-2">
        {/* Version row */}
        <div className="flex items-center justify-between">
          <span className="typography-meta text-muted-foreground">
            v{currentVersion}
          </span>
        </div>

        {/* Links row */}
        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 typography-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <RiGithubFill className="h-3.5 w-3.5" />
            <span>GitHub</span>
          </a>

          <a
            href="https://discord.gg/ZYRSdnwwKA"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 typography-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <RiDiscordFill className="h-3.5 w-3.5" />
            <span>Discord</span>
          </a>

          <a
            href="https://x.com/btriapitsyn"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 typography-meta text-muted-foreground hover:text-foreground transition-colors"
          >
            <RiTwitterXFill className="h-3.5 w-3.5" />
            <span>@btriapitsyn</span>
          </a>
        </div>
      </div>
    );
  }


  // Desktop layout
  return (
    <div className="w-full space-y-6">
      <div className="space-y-1">
        <h3 className="typography-ui-header font-semibold text-foreground">
          About OpenChamber
        </h3>
      </div>

      {/* Version */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <div className="typography-ui-label text-muted-foreground">Version</div>
            <div className="typography-ui-header font-mono">{currentVersion}</div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="flex items-center gap-4">
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-1.5 text-muted-foreground hover:text-foreground',
            'typography-meta transition-colors'
          )}
        >
          <RiGithubFill className="h-4 w-4" />
          <span>GitHub</span>
        </a>

        <a
          href="https://x.com/btriapitsyn"
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            'flex items-center gap-1.5 text-muted-foreground hover:text-foreground',
            'typography-meta transition-colors'
          )}
        >
          <RiTwitterXFill className="h-4 w-4" />
          <span>@btriapitsyn</span>
        </a>
      </div>
    </div>
  );
};
