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
} from '@remixicon/react';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { cn } from '@/lib/utils';
import type { GitIdentityProfile } from '@/stores/useGitIdentitiesStore';

// Icon mapping
const ICON_MAP: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  branch: RiGitBranchLine,
  briefcase: RiBriefcaseLine,
  house: RiHomeLine,
  graduation: RiGraduationCapLine,
  code: RiCodeLine,
  heart: RiHeartLine,
};

// Color mapping matches PROFILE_COLORS definitions for consistent previews
const COLOR_MAP: Record<string, string> = {
  keyword: 'var(--syntax-keyword)',
  error: 'var(--status-error)',
  string: 'var(--syntax-string)',
  function: 'var(--syntax-function)',
  type: 'var(--syntax-type)',
};

export const GitIdentitiesSidebar: React.FC = () => {
  const {
    selectedProfileId,
    profiles,
    globalIdentity,
    setSelectedProfile,
    deleteProfile,
    loadProfiles,
    loadGlobalIdentity,
  } = useGitIdentitiesStore();

  const { setSidebarOpen } = useUIStore();
  const { isMobile } = useDeviceInfo();

  // Load profiles and global identity on mount
  React.useEffect(() => {
    loadProfiles();
    loadGlobalIdentity();
  }, [loadProfiles, loadGlobalIdentity]);

  const handleCreateProfile = () => {
    setSelectedProfile('new');
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
    <div className="flex h-full flex-col bg-sidebar">
      <div className={cn('border-b border-border/40 px-3 dark:border-white/10', isMobile ? 'mt-2 py-3' : 'py-3')}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="typography-ui-label font-semibold text-foreground">Git Profiles</h2>
          <div className="flex items-center gap-1">
            <span className="typography-meta text-muted-foreground">{profiles.length}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleCreateProfile}
            >
              <RiAddLine className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className="space-y-1 px-3 py-2">
          {/* Global Identity */}
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
                  if (isMobile) {
                    setSidebarOpen(false);
                  }
                }}
                onDelete={undefined}
                isReadOnly
              />
            </>
          )}

          {/* Custom Profiles */}
          {profiles.length > 0 && (
            <div className="px-2 pb-1.5 pt-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Custom Profiles
            </div>
          )}

           {profiles.length === 0 && !globalIdentity ? (
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
                    if (isMobile) {
                      setSidebarOpen(false);
                    }
                  }}
                  onDelete={() => handleDeleteProfile(profile)}
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
  // Get Icon component from map
  const IconComponent = ICON_MAP[profile.icon || 'branch'] || RiGitBranchLine;
  // Get color from map
  const iconColor = COLOR_MAP[profile.color || ''];

  return (
    <div className="group transition-all duration-200">
      <div className="relative">
        <div className="w-full flex items-center justify-between py-1.5 px-2 pr-1">
          <button
            onClick={onSelect}
            className="flex-1 text-left overflow-hidden"
            inputMode="none"
            tabIndex={0}
          >
             <div className="flex items-center gap-2">
               <IconComponent
                 className="w-4 h-4 flex-shrink-0"
                 style={{ color: iconColor }}
               />
              <div className={cn(
                "typography-ui-label font-medium truncate flex-1",
                isSelected
                  ? "text-primary"
                  : "text-foreground hover:text-primary/80"
              )}>
                {profile.name}
              </div>
            </div>

            {/* Email preview */}
            <div className="typography-meta text-muted-foreground truncate mt-0.5">
              {profile.userEmail}
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
    </div>
  );
};
