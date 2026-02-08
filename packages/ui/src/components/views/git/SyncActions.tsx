import React from 'react';
import {
  RiRefreshLine,
  RiArrowDownLine,
  RiArrowUpLine,
  RiLoader4Line,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { GitRemote } from '@/lib/gitApi';

type SyncAction = 'fetch' | 'pull' | 'push' | null;

interface SyncActionsProps {
  syncAction: SyncAction;
  remotes: GitRemote[];
  onFetch: (remote: GitRemote) => void;
  onPull: (remote: GitRemote) => void;
  onPush: (remote: GitRemote) => void;
  disabled: boolean;
}

export const SyncActions: React.FC<SyncActionsProps> = ({
  syncAction,
  remotes = [],
  onFetch,
  onPull,
  onPush,
  disabled,
}) => {
  const hasNoRemotes = remotes.length === 0;
  const isDisabled = disabled || syncAction !== null || hasNoRemotes;
  const hasMultipleRemotes = remotes.length > 1;

  const handleFetch = () => {
    const remote = remotes[0];
    if (remotes.length === 1 && remote) {
      onFetch(remote);
    }
  };

  const handlePull = () => {
    const remote = remotes[0];
    if (remotes.length === 1 && remote) {
      onPull(remote);
    }
  };

  const handlePush = () => {
    const remote = remotes[0];
    if (remotes.length === 1 && remote) {
      onPush(remote);
    }
  };

  const renderButton = (
    action: SyncAction,
    icon: React.ReactNode,
    loadingIcon: React.ReactNode,
    label: string,
    onClick: () => void,
    tooltipText: string
  ) => {
    const button = (
      <Button
        variant="ghost"
        size="sm"
        className="h-8 px-2"
        onClick={onClick}
        disabled={isDisabled}
      >
        {syncAction === action ? loadingIcon : icon}
        <span className="hidden sm:inline">{label}</span>
      </Button>
    );

    return (
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent sideOffset={8}>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  };

  const renderDropdownButton = (
    action: SyncAction,
    icon: React.ReactNode,
    loadingIcon: React.ReactNode,
    label: string,
    onSelect: (remote: GitRemote) => void,
    tooltipText: string
  ) => {
    return (
      <DropdownMenu>
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                disabled={isDisabled}
              >
                {syncAction === action ? loadingIcon : icon}
                <span className="hidden sm:inline">{label}</span>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>{tooltipText}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          {remotes.map((remote) => (
            <DropdownMenuItem key={remote.name} onSelect={() => onSelect(remote)}>
              <div className="flex flex-col">
                <span className="typography-ui-label text-foreground">
                  {remote.name}
                </span>
                <span className="typography-meta text-muted-foreground truncate">
                  {remote.fetchUrl}
                </span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  return (
    <div className="flex items-center gap-0.5">
      {hasMultipleRemotes
        ? renderDropdownButton(
            'fetch',
            <RiRefreshLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Fetch',
            onFetch,
            'Fetch from remote'
          )
        : renderButton(
            'fetch',
            <RiRefreshLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Fetch',
            handleFetch,
            'Fetch from remote'
          )}

      {hasMultipleRemotes
        ? renderDropdownButton(
            'pull',
            <RiArrowDownLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Pull',
            onPull,
            'Pull changes'
          )
        : renderButton(
            'pull',
            <RiArrowDownLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Pull',
            handlePull,
            'Pull changes'
          )}

      {hasMultipleRemotes
        ? renderDropdownButton(
            'push',
            <RiArrowUpLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Push',
            onPush,
            'Push changes'
          )
        : renderButton(
            'push',
            <RiArrowUpLine className="size-4" />,
            <RiLoader4Line className="size-4 animate-spin" />,
            'Push',
            handlePush,
            'Push changes'
          )}
    </div>
  );
};
