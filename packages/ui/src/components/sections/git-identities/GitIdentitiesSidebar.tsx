import React from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  RiAddLine,
  RiGitBranchLine,
  RiMore2Line,
  RiDeleteBinLine,
  RiBriefcaseLine,
  RiHomeLine,
  RiGraduationCapLine,
  RiCodeLine,
  RiHeartLine,
  RiDownloadLine,
} from '@remixicon/react';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { isVSCodeRuntime } from '@/lib/desktop';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { cn } from '@/lib/utils';
import type { GitIdentityProfile, DiscoveredGitCredential } from '@/stores/useGitIdentitiesStore';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  branch: RiGitBranchLine,
  briefcase: RiBriefcaseLine,
  house: RiHomeLine,
  graduation: RiGraduationCapLine,
  code: RiCodeLine,
  heart: RiHeartLine,
};

const COLOR_MAP: Record<string, string> = {
  keyword: 'var(--syntax-keyword)',
  error: 'var(--status-error)',
  string: 'var(--syntax-string)',
  function: 'var(--syntax-function)',
  type: 'var(--syntax-type)',
};

interface GitIdentitiesSidebarProps {
  onItemSelect?: () => void;
}

export const GitIdentitiesSidebar: React.FC<GitIdentitiesSidebarProps> = ({ onItemSelect }) => {
  const {
    selectedProfileId,
    profiles,
    globalIdentity,
    setSelectedProfile,
    deleteProfile,
    loadProfiles,
    loadGlobalIdentity,
    loadDiscoveredCredentials,
    getUnimportedCredentials,
  } = useGitIdentitiesStore();

  const { setSidebarOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();

  const [isDesktopRuntime, setIsDesktopRuntime] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return typeof window.opencodeDesktop !== 'undefined';
  });

  const isVSCode = React.useMemo(() => isVSCodeRuntime(), []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    setIsDesktopRuntime(typeof window.opencodeDesktop !== 'undefined');
  }, []);

  const unimportedCredentials = getUnimportedCredentials();

  React.useEffect(() => {
    loadProfiles();
    loadGlobalIdentity();
    loadDiscoveredCredentials();
  }, [loadProfiles, loadGlobalIdentity, loadDiscoveredCredentials]);

  const handleImportCredential = (credential: DiscoveredGitCredential) => {
    // Set a special "import" selection that carries the credential data
    // The form will read this and pre-fill fields
    setSelectedProfile(`import:${credential.host}:${credential.username}`);
    onItemSelect?.();
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const bgClass = isDesktopRuntime
    ? 'bg-transparent'
    : isVSCode
      ? 'bg-background'
      : 'bg-sidebar';

  const handleCreateProfile = () => {
    setSelectedProfile('new');
    onItemSelect?.();
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const handleDeleteProfile = async (profile: GitIdentityProfile) => {
    if (window.confirm(`Are you sure you want to delete profile "${profile.name}"?`)) {
      const success = await deleteProfile(profile.id);
      if (success) {
        toast.success(`Profile "${profile.name}" deleted successfully`);
      } else {
        toast.error('Failed to delete profile');
      }
    }
  };

  return (
    <div className={cn('flex h-full flex-col', bgClass)}>
      <div className={cn('border-b px-3', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between gap-2">
          <span className="typography-meta text-muted-foreground">Total {profiles.length}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 -my-1 text-muted-foreground"
            onClick={handleCreateProfile}
          >
            <RiAddLine className="size-4" />
          </Button>
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2">
          {}
          {globalIdentity && (
            <>
              <div className="px-2 pb-1.5 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                System Default
              </div>
              <ProfileListItem
                profile={globalIdentity}
                isSelected={selectedProfileId === 'global'}
                onSelect={() => {
                  setSelectedProfile('global');
                  onItemSelect?.();
                  if (isMobile) {
                    setSidebarOpen(false);
                  }
                }}
                onDelete={undefined}
                isReadOnly
              />
            </>
          )}

          {}
          {profiles.length > 0 && (
            <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Custom Profiles
            </div>
          )}

           {profiles.length === 0 && !globalIdentity && unimportedCredentials.length === 0 ? (
             <div className="py-12 px-4 text-center text-muted-foreground">
               <RiGitBranchLine className="mx-auto mb-3 h-10 w-10 opacity-50" />
               <p className="typography-ui-label font-medium">No profiles configured</p>
               <p className="typography-meta mt-1 opacity-75">Use the + button above to create one</p>
             </div>
          ) : (
            <>
              {profiles.map((profile) => (
                <ProfileListItem
                  key={profile.id}
                  profile={profile}
                  isSelected={selectedProfileId === profile.id}
                  onSelect={() => {
                    setSelectedProfile(profile.id);
                    onItemSelect?.();
                    if (isMobile) {
                      setSidebarOpen(false);
                    }
                  }}
                  onDelete={() => handleDeleteProfile(profile)}
                />
              ))}
            </>
          )}

          {/* Discovered Credentials Section */}
          {unimportedCredentials.length > 0 && (
            <>
              <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Discovered Credentials
              </div>
              <p className="px-2 pb-2 typography-micro text-muted-foreground/60">
                Found in ~/.git-credentials
              </p>
              {unimportedCredentials.map((cred) => (
                <DiscoveredCredentialItem
                  key={`${cred.host}-${cred.username}`}
                  credential={cred}
                  onImport={() => handleImportCredential(cred)}
                />
              ))}
            </>
          )}
      </ScrollableOverlay>
    </div>
  );
};

interface ProfileListItemProps {
  profile: GitIdentityProfile;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  isReadOnly?: boolean;
}

const ProfileListItem: React.FC<ProfileListItemProps> = ({
  profile,
  isSelected,
  onSelect,
  onDelete,
  isReadOnly = false,
}) => {
  const IconComponent = ICON_MAP[profile.icon || 'branch'] || RiGitBranchLine;
  const iconColor = COLOR_MAP[profile.color || ''];
  const authType = profile.authType || 'ssh';

  return (
    <div
      className={cn(
        'group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200',
        isSelected ? 'dark:bg-accent/80 bg-primary/12' : 'hover:dark:bg-accent/40 hover:bg-primary/6'
      )}
    >
      <div className="flex min-w-0 flex-1 items-center">
        <button
          onClick={onSelect}
          className="flex min-w-0 flex-1 flex-col gap-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          tabIndex={0}
        >
          <div className="flex items-center gap-1.5">
            <IconComponent
              className="w-4 h-4 flex-shrink-0"
              style={{ color: iconColor }}
            />
            <span className="typography-ui-label font-normal truncate text-foreground">
              {profile.name}
            </span>
            <span className="typography-micro text-muted-foreground bg-muted px-1 rounded flex-shrink-0 leading-none pb-px border border-border/50">
              {authType}
            </span>
          </div>

          <div className="typography-micro text-muted-foreground/60 truncate leading-tight">
            {authType === 'token' && profile.host ? profile.host : profile.userEmail}
          </div>
        </button>

        {!isReadOnly && onDelete && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 flex-shrink-0 -mr-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
              >
                <RiMore2Line className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-fit min-w-20">
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                className="text-destructive focus:text-destructive"
              >
                <RiDeleteBinLine className="h-4 w-4 mr-px" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
};

interface DiscoveredCredentialItemProps {
  credential: DiscoveredGitCredential;
  onImport: () => void;
}

const getCredentialDisplayName = (host: string): string => {
  const parts = host.split('/');
  if (parts.length >= 3) {
    return parts[parts.length - 1];
  }
  return host;
};

const DiscoveredCredentialItem: React.FC<DiscoveredCredentialItemProps> = ({
  credential,
  onImport,
}) => {
  const displayName = getCredentialDisplayName(credential.host);
  const isRepoSpecific = credential.host.includes('/');

  return (
    <div className="group relative flex items-center rounded-md px-1.5 py-1 transition-all duration-200 hover:dark:bg-accent/40 hover:bg-primary/6">
      <div className="flex min-w-0 flex-1 items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-0">
          <div className="flex items-center gap-1.5">
            <span className="typography-ui-label font-normal truncate text-foreground">
              {displayName}
            </span>
          </div>
          <div className="typography-micro text-muted-foreground/60 truncate leading-tight">
            {isRepoSpecific ? credential.host : credential.username}
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onImport}
          className="h-6 px-2 text-xs gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
        >
          <RiDownloadLine className="h-3 w-3" />
          Import
        </Button>
      </div>
    </div>
  );
};
