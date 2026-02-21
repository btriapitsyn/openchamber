import React from 'react';
import { Button } from '@/components/ui/button';
import { ButtonSmall } from '@/components/ui/button-small';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui';
import { useGitIdentitiesStore, type GitIdentityProfile, type GitIdentityAuthType } from '@/stores/useGitIdentitiesStore';
import {
  RiUser3Line,
  RiDeleteBinLine,
  RiGitBranchLine,
  RiBriefcaseLine,
  RiHomeLine,
  RiGraduationCapLine,
  RiCodeLine,
  RiInformationLine,
  RiKeyLine,
  RiLock2Line
} from '@remixicon/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ButtonLarge } from '@/components/ui/button-large';

const PROFILE_COLORS = [
  { key: 'keyword', label: 'Green', cssVar: 'var(--syntax-keyword)' },
  { key: 'error', label: 'Red', cssVar: 'var(--status-error)' },
  { key: 'string', label: 'Cyan', cssVar: 'var(--syntax-string)' },
  { key: 'function', label: 'Orange', cssVar: 'var(--syntax-function)' },
  { key: 'type', label: 'Yellow', cssVar: 'var(--syntax-type)' },
];

const PROFILE_ICONS = [
  { key: 'branch', Icon: RiGitBranchLine, label: 'Branch' },
  { key: 'briefcase', Icon: RiBriefcaseLine, label: 'Work' },
  { key: 'house', Icon: RiHomeLine, label: 'Personal' },
  { key: 'graduation', Icon: RiGraduationCapLine, label: 'School' },
  { key: 'code', Icon: RiCodeLine, label: 'Code' },
];

export const GitIdentitiesPage: React.FC = () => {
  const {
    selectedProfileId,
    getProfileById,
    createProfile,
    updateProfile,
    deleteProfile,
  } = useGitIdentitiesStore();

  const importData = React.useMemo(() => {
    if (selectedProfileId?.startsWith('import:')) {
      const [, host, username] = selectedProfileId.split(':');
      return { host, username };
    }
    return null;
  }, [selectedProfileId]);

  const selectedProfile = React.useMemo(() =>
    selectedProfileId && selectedProfileId !== 'new' && !importData ? getProfileById(selectedProfileId) : null,
    [selectedProfileId, getProfileById, importData]
  );
  const isNewProfile = selectedProfileId === 'new' || importData !== null;
  const isGlobalProfile = selectedProfileId === 'global';

  const [name, setName] = React.useState('');
  const [userName, setUserName] = React.useState('');
  const [userEmail, setUserEmail] = React.useState('');
  const [authType, setAuthType] = React.useState<GitIdentityAuthType>('ssh');
  const [sshKey, setSshKey] = React.useState('');
  const [host, setHost] = React.useState('');
  const [color, setColor] = React.useState('keyword');
  const [icon, setIcon] = React.useState('branch');
  const [isSaving, setIsSaving] = React.useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
  const [isDeleting, setIsDeleting] = React.useState(false);

  React.useEffect(() => {
    if (importData) {
      const parts = importData.host.split('/');
      const displayName = parts.length >= 3 ? parts[parts.length - 1] : importData.host;

      setName(displayName);
      setUserName(importData.username);
      setUserEmail('');
      setAuthType('token');
      setSshKey('');
      setHost(importData.host);
      setColor('string');
      setIcon('code');
    } else if (isNewProfile) {
      setName('');
      setUserName('');
      setUserEmail('');
      setAuthType('ssh');
      setSshKey('');
      setHost('');
      setColor('keyword');
      setIcon('branch');
    } else if (selectedProfile) {
      setName(selectedProfile.name);
      setUserName(selectedProfile.userName);
      setUserEmail(selectedProfile.userEmail);
      setAuthType(selectedProfile.authType || 'ssh');
      setSshKey(selectedProfile.sshKey || '');
      setHost(selectedProfile.host || '');
      setColor(selectedProfile.color || 'keyword');
      setIcon(selectedProfile.icon || 'branch');
    }
  }, [selectedProfile, isNewProfile, selectedProfileId, importData]);

  const handleSave = async () => {
    if (!userName.trim() || !userEmail.trim()) {
      toast.error('User name and email are required');
      return;
    }

    if (authType === 'token' && !host.trim()) {
      toast.error('Host is required for token-based authentication');
      return;
    }

    setIsSaving(true);

    try {
      const profileData: Omit<GitIdentityProfile, 'id'> & { id?: string } = {
        name: name.trim() || userName.trim(),
        userName: userName.trim(),
        userEmail: userEmail.trim(),
        authType,
        sshKey: authType === 'ssh' ? (sshKey.trim() || null) : null,
        host: authType === 'token' ? (host.trim() || null) : null,
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

  const handleDelete = () => {
    if (!selectedProfileId || isNewProfile) return;
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedProfileId || isNewProfile) {
      return;
    }

    setIsDeleting(true);
    try {
      const success = await deleteProfile(selectedProfileId);
      if (success) {
        toast.success('Profile deleted successfully');
        setIsDeleteDialogOpen(false);
      } else {
        toast.error('Failed to delete profile');
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      toast.error('An error occurred while deleting');
    } finally {
      setIsDeleting(false);
    }
  };

  const currentColorValue = React.useMemo(() => {
    const colorConfig = PROFILE_COLORS.find(c => c.key === color);
    return colorConfig?.cssVar || 'var(--syntax-keyword)';
  }, [color]);

  if (!selectedProfileId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-muted-foreground">
          <RiUser3Line className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="typography-body">Select a profile from the sidebar</p>
          <p className="typography-meta mt-1 opacity-75">or create a new one</p>
        </div>
      </div>
    );
  }

  return (
    <ScrollableOverlay keyboardAvoid outerClassName="h-full" className="w-full bg-background">
      <div className="mx-auto w-full max-w-4xl px-5 py-6">
        
        {/* Header & Actions */}
        <div className="mb-8 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="typography-ui-header font-semibold text-foreground truncate">
              {importData ? 'Import Credential' : isNewProfile ? 'New Git Profile' : isGlobalProfile ? 'Global Identity' : name || 'Edit Profile'}
            </h2>
            <p className="typography-meta text-muted-foreground truncate mt-0.5">
              {importData
                ? `Import token credential for ${importData.host}`
                : isNewProfile
                ? 'Create a new Git identity profile for your repositories'
                : isGlobalProfile
                ? 'System-wide Git identity (read-only)'
                : 'Configure Git identity settings for this profile'}
            </p>
          </div>
          {!isGlobalProfile && (
            <Button onClick={handleSave} disabled={isSaving} size="sm">
              {isSaving ? 'Saving...' : 'Save Profile'}
            </Button>
          )}
        </div>

        {/* Profile Information */}
        {!isGlobalProfile && (
          <div className="mb-8">
            <div className="mb-3 px-1">
              <h3 className="typography-ui-header font-semibold text-foreground">
                Profile Display
              </h3>
              <p className="typography-meta text-muted-foreground mt-0.5">
                Customize how this profile looks in OpenChamber.
              </p>
            </div>

            <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
                <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                  <span className="typography-ui-label text-foreground">Display Name</span>
                  <span className="typography-meta text-muted-foreground">Friendly name</span>
                </div>
                <div className="flex-1 max-w-sm flex justify-end">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Work Profile, Personal, etc."
                    className="h-8 focus-visible:ring-[var(--primary-base)]"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
                <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                  <span className="typography-ui-label text-foreground">Color</span>
                  <span className="typography-meta text-muted-foreground">Badge accent color</span>
                </div>
                <div className="flex gap-1.5 flex-wrap flex-1 justify-end">
                  {PROFILE_COLORS.map((c) => (
                    <button
                      key={c.key}
                      onClick={() => setColor(c.key)}
                      className={cn(
                        'w-7 h-7 rounded-md border-2 transition-all cursor-pointer',
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

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
                <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                  <span className="typography-ui-label text-foreground">Icon</span>
                  <span className="typography-meta text-muted-foreground">Visual identifier</span>
                </div>
                <div className="flex gap-1.5 flex-wrap flex-1 justify-end">
                  {PROFILE_ICONS.map((i) => {
                    const IconComponent = i.Icon;
                    return (
                      <button
                        key={i.key}
                        onClick={() => setIcon(i.key)}
                        className={cn(
                          'w-8 h-8 rounded-md border-2 transition-all flex items-center justify-center cursor-pointer',
                          icon === i.key
                            ? 'border-[var(--interactive-border)] bg-[var(--surface-muted)] scale-110'
                            : 'border-transparent hover:border-[var(--interactive-border)] hover:bg-[var(--surface-muted)]/50'
                        )}
                        title={i.label}
                      >
                        <IconComponent
                          className="w-4 h-4"
                          style={{ color: icon === i.key ? currentColorValue : 'var(--surface-muted-foreground)' }}
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
        <div className="mb-8">
          <div className="mb-3 px-1">
            <h3 className="typography-ui-header font-semibold text-foreground">
              Git Author Settings
            </h3>
            <p className="typography-meta text-muted-foreground mt-0.5">
              These settings configure <code className="font-mono text-[10px] bg-[var(--surface-muted)] px-1 rounded">user.name</code> and <code className="font-mono text-[10px] bg-[var(--surface-muted)] px-1 rounded">user.email</code>
            </p>
          </div>

          <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
            
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
              <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="typography-ui-label text-foreground">User Name</span>
                  {!isGlobalProfile && <span className="text-[var(--status-error)]">*</span>}
                </div>
                <span className="typography-meta text-muted-foreground">Appears in commit logs</span>
              </div>
              <div className="flex-1 max-w-sm flex justify-end">
                <Input
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="John Doe"
                  required={!isGlobalProfile}
                  readOnly={isGlobalProfile}
                  disabled={isGlobalProfile}
                  className="h-8 focus-visible:ring-[var(--primary-base)]"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="typography-ui-label text-foreground">Email Address</span>
                  {!isGlobalProfile && <span className="text-[var(--status-error)]">*</span>}
                </div>
                <span className="typography-meta text-muted-foreground">For commit attribution</span>
              </div>
              <div className="flex-1 max-w-sm flex justify-end">
                <Input
                  type="email"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                  placeholder="john@example.com"
                  required={!isGlobalProfile}
                  readOnly={isGlobalProfile}
                  disabled={isGlobalProfile}
                  className="h-8 focus-visible:ring-[var(--primary-base)]"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Authentication */}
        {!isGlobalProfile && (
          <div className="mb-8">
            <div className="mb-3 px-1">
              <h3 className="typography-ui-header font-semibold text-foreground">
                Authentication
              </h3>
              <p className="typography-meta text-muted-foreground mt-0.5">
                Credentials used to push to remote repositories.
              </p>
            </div>

            <div className="rounded-lg bg-[var(--surface-elevated)]/70 overflow-hidden flex flex-col">
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3 border-b border-[var(--surface-subtle)]">
                <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                  <span className="typography-ui-label text-foreground">Method</span>
                  <span className="typography-meta text-muted-foreground">SSH keys vs HTTPS tokens</span>
                </div>
                <div className="flex items-center gap-1 flex-1 justify-end">
                  <ButtonSmall
                    type="button"
                    variant={authType === 'ssh' ? 'default' : 'outline'}
                    onClick={() => setAuthType('ssh')}
                    className={cn(authType === 'ssh' ? undefined : 'text-foreground')}
                  >
                    <RiLock2Line className="w-3.5 h-3.5 mr-1" /> SSH Key
                  </ButtonSmall>
                  <ButtonSmall
                    type="button"
                    variant={authType === 'token' ? 'default' : 'outline'}
                    onClick={() => setAuthType('token')}
                    className={cn(authType === 'token' ? undefined : 'text-foreground')}
                  >
                    <RiKeyLine className="w-3.5 h-3.5 mr-1" /> HTTPS Token
                  </ButtonSmall>
                </div>
              </div>

              {authType === 'ssh' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                    <span className="typography-ui-label text-foreground flex items-center gap-1.5">
                      SSH Key Path
                      <Tooltip delayDuration={1000}>
                        <TooltipTrigger asChild>
                          <RiInformationLine className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent sideOffset={8} className="max-w-xs">
                          Common paths: ~/.ssh/id_rsa, ~/.ssh/id_ed25519
                        </TooltipContent>
                      </Tooltip>
                    </span>
                    <span className="typography-meta text-muted-foreground">Path to private key (optional)</span>
                  </div>
                  <div className="flex-1 max-w-sm flex justify-end">
                    <Input
                      value={sshKey}
                      onChange={(e) => setSshKey(e.target.value)}
                      placeholder="/Users/username/.ssh/id_rsa"
                      className="h-8 focus-visible:ring-[var(--primary-base)] font-mono text-xs"
                    />
                  </div>
                </div>
              )}

              {authType === 'token' && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-4 py-3">
                  <div className="flex min-w-0 flex-col sm:w-1/3 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <span className="typography-ui-label text-foreground">Host</span>
                      <span className="text-[var(--status-error)]">*</span>
                    </div>
                    <span className="typography-meta text-muted-foreground">Git host (e.g., github.com)</span>
                  </div>
                  <div className="flex-1 max-w-sm flex justify-end">
                    <Input
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                      placeholder="github.com"
                      required
                      className="h-8 focus-visible:ring-[var(--primary-base)] font-mono text-xs"
                    />
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* Delete Action */}
        {!isGlobalProfile && !isNewProfile && (
          <div className="mt-8 flex justify-end">
            <ButtonSmall
              variant="outline"
              onClick={handleDelete}
              className="text-[var(--status-error)] hover:text-[var(--status-error)] border-[var(--status-error)]/30 hover:bg-[var(--status-error)]/10"
            >
              <RiDeleteBinLine className="w-3.5 h-3.5 mr-1" /> Delete Profile
            </ButtonSmall>
          </div>
        )}

      </div>

      <Dialog
        open={isDeleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setIsDeleteDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Profile</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete profile "{selectedProfile?.name || name || 'this profile'}"?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <ButtonLarge onClick={() => void handleConfirmDelete()} disabled={isDeleting} className="bg-[var(--status-error)] hover:bg-[var(--status-error)]/90 text-white border-0">
              Delete
            </ButtonLarge>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScrollableOverlay>
  );
};
