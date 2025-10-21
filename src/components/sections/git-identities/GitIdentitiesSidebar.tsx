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
  Plus,
  GitBranch,
  DotsThreeVertical as MoreVertical,
  Trash as Trash2,
  Briefcase,
  House,
  GraduationCap,
  Code,
  Heart,
  type Icon as PhosphorIcon
} from '@phosphor-icons/react';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { cn } from '@/lib/utils';
import type { GitIdentityProfile } from '@/stores/useGitIdentitiesStore';

// Icon mapping
const ICON_MAP: Record<string, PhosphorIcon> = {
  branch: GitBranch,
  briefcase: Briefcase,
  house: House,
  graduation: GraduationCap,
  code: Code,
  heart: Heart,
};

// Color mapping (semantic theme colors)
const COLOR_MAP: Record<string, string> = {
  keyword: 'var(--syntax-keyword)',
  error: 'var(--status-error)',
  success: 'var(--status-success)',
  info: 'var(--status-info)',
  warning: 'var(--status-warning)',
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
        <div className="flex items-center justify-between">
          <h2 className="typography-ui-label font-semibold text-foreground">Git Profiles</h2>
          <span className="typography-meta text-muted-foreground">
            {profiles.length} total
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="space-y-1 px-3 py-2">
          <Button
            variant="ghost"
            onClick={handleCreateProfile}
            className="w-full justify-start gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
          >
            <Plus className="h-4 w-4 flex-shrink-0" weight="bold" />
            <span className="typography-ui-label font-medium">New Profile</span>
          </Button>

          {/* Global Identity */}
          {globalIdentity && (
            <>
              <div className="typography-ui-label px-2 pt-2 pb-1.5 text-foreground font-medium">
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
            <div className="typography-ui-label px-2 pt-3 pb-1.5 text-foreground font-medium">
              Custom Profiles
            </div>
          )}

          {profiles.length === 0 && !globalIdentity ? (
            <div className="py-12 px-4 text-center text-muted-foreground">
              <GitBranch className="mx-auto mb-3 h-10 w-10 opacity-50" />
              <p className="typography-ui-label font-medium">No profiles configured</p>
              <p className="typography-meta mt-1 opacity-75">Create one to get started</p>
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
        </div>
      </div>
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
  const IconComponent = ICON_MAP[profile.icon || 'branch'] || GitBranch;
  // Get color from map
  const iconColor = COLOR_MAP[profile.color || 'keyword'] || 'var(--syntax-keyword)';

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
                weight="fill"
                style={{ color: iconColor }}
              />
              <div className={cn(
                "typography-ui-label font-medium truncate flex-1 transition-colors",
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
                  <MoreVertical weight="regular" className="h-3.5 w-3.5" />
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
                  <Trash2 className="h-4 w-4 mr-px" />
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
