import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useGitIdentitiesStore, type GitIdentityProfile } from '@/stores/useGitIdentitiesStore';
import {
  UserCircle,
  FloppyDisk,
  Trash,
  GitBranch,
  Briefcase,
  House,
  GraduationCap,
  Code,
  Heart
} from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

// Theme-aware semantic colors (using CSS variables from theme)
const PROFILE_COLORS = [
  { key: 'keyword', label: 'Orange', cssVar: 'var(--syntax-keyword)' },
  { key: 'error', label: 'Red', cssVar: 'var(--status-error)' },
  { key: 'success', label: 'Green', cssVar: 'var(--status-success)' },
  { key: 'info', label: 'Blue', cssVar: 'var(--status-info)' },
  { key: 'warning', label: 'Yellow', cssVar: 'var(--status-warning)' },
  { key: 'type', label: 'Cyan', cssVar: 'var(--syntax-type)' },
];

// Phosphor icon options
const PROFILE_ICONS = [
  { key: 'branch', Icon: GitBranch, label: 'Branch' },
  { key: 'briefcase', Icon: Briefcase, label: 'Work' },
  { key: 'house', Icon: House, label: 'Personal' },
  { key: 'graduation', Icon: GraduationCap, label: 'School' },
  { key: 'code', Icon: Code, label: 'Code' },
  { key: 'heart', Icon: Heart, label: 'Favorite' },
];

export const GitIdentitiesPage: React.FC = () => {
  const {
    selectedProfileId,
    getProfileById,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useGitIdentitiesStore();

  const selectedProfile = React.useMemo(() =>
    selectedProfileId && selectedProfileId !== 'new' ? getProfileById(selectedProfileId) : null,
    [selectedProfileId, getProfileById]
  );
  const isNewProfile = selectedProfileId === 'new';
  const isGlobalProfile = selectedProfileId === 'global';

  // Form state
  const [name, setName] = React.useState('');
  const [userName, setUserName] = React.useState('');
  const [userEmail, setUserEmail] = React.useState('');
  const [sshKey, setSshKey] = React.useState('');
  const [color, setColor] = React.useState('keyword');
  const [icon, setIcon] = React.useState('branch');
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize form when profile changes
  React.useEffect(() => {
    if (isNewProfile) {
      // Reset form for new profile
      setName('');
      setUserName('');
      setUserEmail('');
      setSshKey('');
      setColor('keyword');
      setIcon('branch');
    } else if (selectedProfile) {
      // Load existing profile data
      setName(selectedProfile.name);
      setUserName(selectedProfile.userName);
      setUserEmail(selectedProfile.userEmail);
      setSshKey(selectedProfile.sshKey || '');
      setColor(selectedProfile.color || 'keyword');
      setIcon(selectedProfile.icon || 'branch');
    }
  }, [selectedProfile, isNewProfile, selectedProfileId]);

  const handleSave = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      toast.error('User name and email are required');
      return;
    }

    setIsSaving(true);

    try {
      const profileData: Omit<GitIdentityProfile, 'id'> & { id?: string } = {
        name: name.trim() || userName.trim(),
        userName: userName.trim(),
        userEmail: userEmail.trim(),
        sshKey: sshKey.trim() || null,
        color,
        icon,
      };

      let success: boolean;
      if (isNewProfile) {
        success = await createProfile(profileData);
      } else if (selectedProfileId) {
        success = await updateProfile(selectedProfileId, profileData);
      } else {
        return;
      }

      if (success) {
        toast.success(isNewProfile ? 'Profile created successfully' : 'Profile updated successfully');
      } else {
        toast.error(isNewProfile ? 'Failed to create profile' : 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error saving profile:', error);
      toast.error('An error occurred while saving');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProfileId || isNewProfile) return;

    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      const success = await deleteProfile(selectedProfileId);
      if (success) {
        toast.success('Profile deleted successfully');
      } else {
        toast.error('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      toast.error('An error occurred while deleting');
    }
  };

  // Get current color CSS value
  const currentColorValue = React.useMemo(() => {
    const colorConfig = PROFILE_COLORS.find(c => c.key === color);
    return colorConfig?.cssVar || 'var(--syntax-keyword)';
  }, [color]);

  // Get current Icon component
  const CurrentIconComponent = React.useMemo(() => {
    const iconConfig = PROFILE_ICONS.find(i => i.key === icon);
    return iconConfig?.Icon || GitBranch;
  }, [icon]);

  if (!selectedProfileId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <UserCircle className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select a profile from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="typography-h1 font-semibold">
            {isNewProfile ? 'New Git Profile' : isGlobalProfile ? 'Global Default Identity' : name || 'Edit Profile'}
          </h1>
          <p className="typography-body text-muted-foreground mt-1">
            {isNewProfile
              ? 'Create a new Git identity profile for your repositories'
              : isGlobalProfile
              ? 'System-wide Git identity from global configuration (read-only)'
              : 'Configure Git identity settings for this profile'}
          </p>
        </div>

        {/* Profile Information - hide for global profile */}
        {!isGlobalProfile && (
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Profile Information</h2>
            <p className="typography-meta text-muted-foreground/80">
              Basic profile settings and display name
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              Display Name
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Work Profile, Personal, etc."
            />
            <p className="typography-meta text-muted-foreground">
              Friendly name to identify this profile (optional, defaults to user name)
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {PROFILE_COLORS.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setColor(c.key)}
                    className={cn(
                      'w-8 h-8 rounded-lg border-2 transition-all',
                      color === c.key
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:border-border'
                    )}
                    style={{ backgroundColor: c.cssVar }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="typography-ui-label font-medium text-foreground">
                Icon
              </label>
              <div className="flex gap-2 flex-wrap">
                {PROFILE_ICONS.map((i) => {
                  const IconComponent = i.Icon;
                  return (
                    <button
                      key={i.key}
                      onClick={() => setIcon(i.key)}
                      className={cn(
                        'w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center',
                        icon === i.key
                          ? 'border-primary bg-accent scale-110'
                          : 'border-border hover:border-primary/50'
                      )}
                      title={i.label}
                    >
                      <IconComponent
                        className="w-4 h-4"
                        weight="fill"
                        style={{ color: currentColorValue }}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Git Configuration */}
        <div className="space-y-4">
          <div className="space-y-1">
            <h2 className="typography-h2 font-semibold text-foreground">Git Configuration</h2>
            <p className="typography-meta text-muted-foreground/80">
              Git user settings that will be applied to repositories
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              User Name {!isGlobalProfile && <span className="text-destructive">*</span>}
            </label>
            <Input
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="John Doe"
              required={!isGlobalProfile}
              readOnly={isGlobalProfile}
              disabled={isGlobalProfile}
            />
            <p className="typography-meta text-muted-foreground">
              Git user.name configuration value
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              User Email {!isGlobalProfile && <span className="text-destructive">*</span>}
            </label>
            <Input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="john@example.com"
              required={!isGlobalProfile}
              readOnly={isGlobalProfile}
              disabled={isGlobalProfile}
            />
            <p className="typography-meta text-muted-foreground">
              Git user.email configuration value
            </p>
          </div>

          <div className="space-y-2">
            <label className="typography-ui-label font-medium text-foreground">
              SSH Key Path
            </label>
            <Input
              value={sshKey}
              onChange={(e) => setSshKey(e.target.value)}
              placeholder="/Users/username/.ssh/id_rsa"
              readOnly={isGlobalProfile}
              disabled={isGlobalProfile}
            />
            <p className="typography-meta text-muted-foreground">
              Path to SSH private key for authentication (optional)
            </p>
          </div>
        </div>

        {/* Actions - hide for global profile */}
        {!isGlobalProfile && (
        <div className="flex justify-between border-t border-border/40 pt-4">
          {!isNewProfile && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              className="gap-2 h-6 px-2 text-xs"
            >
              <Trash className="h-3 w-3" weight="bold" />
              Delete Profile
            </Button>
          )}
          <div className={cn('flex gap-2', isNewProfile && 'ml-auto')}>
            <Button
              size="sm"
              variant="default"
              onClick={handleSave}
              disabled={isSaving}
              className="gap-2 h-6 px-2 text-xs"
            >
              <FloppyDisk className="h-3 w-3" weight="bold" />
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          </div>
        </div>
        )}
      </div>
    </div>
  );
};
