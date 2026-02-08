import React from 'react';
import {
  RiArrowUpLine,
  RiArrowDownLine,
  RiArrowDownSLine,
  RiLoader4Line,
  RiGitBranchLine,
  RiGitRepositoryLine,
  RiBriefcaseLine,
  RiHomeLine,
  RiGraduationCapLine,
  RiCodeLine,
  RiHeartLine,
  RiHistoryLine,
  RiUser3Line,
} from '@remixicon/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { BranchSelector } from './BranchSelector';
import { WorktreeBranchDisplay } from './WorktreeBranchDisplay';
import { SyncActions } from './SyncActions';
import type { GitStatus, GitIdentityProfile, GitRemote } from '@/lib/api/types';

type SyncAction = 'fetch' | 'pull' | 'push' | null;

interface GitHeaderProps {
  status: GitStatus | null;
  localBranches: string[];
  remoteBranches: string[];
  branchInfo: Record<string, { ahead?: number; behind?: number }> | undefined;
  syncAction: SyncAction;
  remotes: GitRemote[];
  onFetch: (remote: GitRemote) => void;
  onPull: (remote: GitRemote) => void;
  onPush: (remote: GitRemote) => void;
  onCheckoutBranch: (branch: string) => void;
  onCreateBranch: (name: string) => Promise<void>;
  onRenameBranch?: (oldName: string, newName: string) => Promise<void>;
  activeIdentityProfile: GitIdentityProfile | null;
  availableIdentities: GitIdentityProfile[];
  onSelectIdentity: (profile: GitIdentityProfile) => void;
  isApplyingIdentity: boolean;
  isWorktreeMode: boolean;
  onOpenHistory?: () => void;
  onOpenBranchPicker?: () => void;
}

const IDENTITY_ICON_MAP: Record<
  string,
  React.ComponentType<React.ComponentProps<typeof RiGitBranchLine>>
> = {
  branch: RiGitBranchLine,
  briefcase: RiBriefcaseLine,
  house: RiHomeLine,
  graduation: RiGraduationCapLine,
  code: RiCodeLine,
  heart: RiHeartLine,
  user: RiUser3Line,
};

const IDENTITY_COLOR_MAP: Record<string, string> = {
  keyword: 'var(--syntax-keyword)',
  error: 'var(--status-error)',
  string: 'var(--syntax-string)',
  function: 'var(--syntax-function)',
  type: 'var(--syntax-type)',
  success: 'var(--status-success)',
  info: 'var(--status-info)',
  warning: 'var(--status-warning)',
};

function getIdentityColor(token?: string | null) {
  if (!token) {
    return 'var(--primary)';
  }
  return IDENTITY_COLOR_MAP[token] || 'var(--primary)';
}

interface IdentityIconProps {
  icon?: string | null;
  className?: string;
  colorToken?: string | null;
}

const IdentityIcon: React.FC<IdentityIconProps> = ({ icon, className, colorToken }) => {
  const IconComponent = IDENTITY_ICON_MAP[icon ?? 'branch'] ?? RiUser3Line;
  return (
    <IconComponent
      className={className}
      style={{ color: getIdentityColor(colorToken) }}
    />
  );
};

interface IdentityDropdownProps {
  activeProfile: GitIdentityProfile | null;
  identities: GitIdentityProfile[];
  onSelect: (profile: GitIdentityProfile) => void;
  isApplying: boolean;
}

const IdentityDropdown: React.FC<IdentityDropdownProps> = ({
  activeProfile,
  identities,
  onSelect,
  isApplying,
}) => {
  const isDisabled = isApplying || identities.length === 0;

  return (
    <DropdownMenu>
      <Tooltip delayDuration={1000}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 py-1 h-8 typography-ui-label"
              style={{ color: getIdentityColor(activeProfile?.color) }}
              disabled={isDisabled}
            >
              {isApplying ? (
                <RiLoader4Line className="size-4 animate-spin" />
              ) : (
                <IdentityIcon
                  icon={activeProfile?.icon}
                  colorToken={activeProfile?.color}
                  className="size-4"
                />
              )}
              <span className="max-w-[120px] truncate hidden sm:inline">
                {activeProfile?.name || 'No identity'}
              </span>
              <RiArrowDownSLine className="size-4 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="space-y-1">
          <p className="typography-ui-label text-foreground">
            {activeProfile?.userName || 'Unknown user'}
          </p>
          <p className="typography-meta text-muted-foreground">
            {activeProfile?.userEmail || 'No email configured'}
          </p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        {identities.length === 0 ? (
          <div className="px-2 py-1.5">
            <p className="typography-meta text-muted-foreground">
              No profiles available to apply.
            </p>
          </div>
        ) : (
          identities.map((profile) => (
            <DropdownMenuItem key={profile.id} onSelect={() => onSelect(profile)}>
              <span className="flex items-center gap-2">
                <IdentityIcon
                  icon={profile.icon}
                  colorToken={profile.color}
                  className="size-4"
                />
                <span className="flex flex-col">
                  <span className="typography-ui-label text-foreground">
                    {profile.name}
                  </span>
                  <span className="typography-meta text-muted-foreground">
                    {profile.userEmail}
                  </span>
                </span>
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const GitHeader: React.FC<GitHeaderProps> = ({
  status,
  localBranches,
  remoteBranches,
  branchInfo,
  syncAction,
  remotes,
  onFetch,
  onPull,
  onPush,
  onCheckoutBranch,
  onCreateBranch,
  onRenameBranch,
  activeIdentityProfile,
  availableIdentities,
  onSelectIdentity,
  isApplyingIdentity,
  isWorktreeMode,
  onOpenHistory,
  onOpenBranchPicker,
}) => {
  if (!status) {
    return null;
  }

  return (
    <header className="flex flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2 bg-background">
      {isWorktreeMode ? (
        <WorktreeBranchDisplay
          currentBranch={status.current}
          onRename={onRenameBranch}
        />
      ) : (
        <BranchSelector
          currentBranch={status.current}
          localBranches={localBranches}
          remoteBranches={remoteBranches}
          branchInfo={branchInfo}
          onCheckout={onCheckoutBranch}
          onCreate={onCreateBranch}
        />
      )}

      {(Boolean(status.tracking) || status.ahead > 0 || status.behind > 0) && (
        <Tooltip delayDuration={800}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-1.5 typography-meta text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <RiArrowUpLine className="size-3.5 text-primary/70" />
                <span className="font-semibold text-foreground">{status.ahead}</span>
              </span>
              {Boolean(status.tracking) && (
                <span className="flex items-center gap-0.5">
                  <RiArrowDownLine className="size-3.5 text-primary/70" />
                  <span className="font-semibold text-foreground">{status.behind}</span>
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>
            {status.tracking
              ? `Upstream: ${status.tracking}`
              : 'Unpublished commits (no upstream set yet)'}
          </TooltipContent>
        </Tooltip>
      )}

      <SyncActions
        syncAction={syncAction}
        remotes={remotes}
        onFetch={onFetch}
        onPull={onPull}
        onPush={onPush}
        disabled={!status}
      />

      <div className="flex-1" />

      {onOpenBranchPicker ? (
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 py-1 h-8 typography-ui-label"
              onClick={onOpenBranchPicker}
            >
              <RiGitRepositoryLine className="size-4" />
              <span className="hidden sm:inline">Manage branches</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>Manage branches</TooltipContent>
        </Tooltip>
      ) : null}

      {onOpenHistory ? (
        <Tooltip delayDuration={1000}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 px-2 py-1 h-8 typography-ui-label"
              onClick={onOpenHistory}
            >
              <RiHistoryLine className="size-4" />
              <span className="hidden sm:inline">History</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent sideOffset={8}>Show commit history</TooltipContent>
        </Tooltip>
      ) : null}

      <IdentityDropdown
        activeProfile={activeIdentityProfile}
        identities={availableIdentities}
        onSelect={onSelectIdentity}
        isApplying={isApplyingIdentity}
      />
    </header>
  );
};
