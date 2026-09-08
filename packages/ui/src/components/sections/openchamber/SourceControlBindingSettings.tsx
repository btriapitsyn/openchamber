import React from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useMobileAppActions } from '@/apps/mobileAppContext';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { GitIdentityProfile, SourceControlRepositoryBindingResetIntent } from '@/lib/api/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { repositoryBindingOwner, useRepositoryBinding } from '@/lib/source-control/repository-binding';
import { useUIStore } from '@/stores/useUIStore';
import { useGitStore } from '@/stores/useGitStore';
import {
  SETTINGS_FIELDS_STACK_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SELECT_SIZE,
  SettingsCheckboxRow,
  SettingsControlGroup,
  SettingsStackedField,
} from '../shared/SettingsSection';
import { AuxiliaryBindingSettings } from './RepositoryBindingEditors';

type RepositoryConfigurationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  directory: string;
  allowAuthorApply?: boolean;
};

/** Every editor after the first in the dialog is separated by the settings divider. */
const DIALOG_DIVIDER_CLASS = 'border-t border-border/60 pt-4';

const RepositoryAuthorEditor = ({ directory, className }: { directory: string; className?: string }) => {
  const { t } = useI18n();
  const { git } = useRuntimeAPIs();
  const fetchIdentity = useGitStore((state) => state.fetchIdentity);
  const [profiles, setProfiles] = React.useState<GitIdentityProfile[]>([]);
  const [selected, setSelected] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  const generation = React.useRef(0);
  React.useEffect(() => {
    const request = ++generation.current;
    const runtimeKey = getRuntimeKey();
    setLoading(true);
    setError(false);
    void git.getGitIdentities().then((result) => {
      if (request === generation.current && runtimeKey === getRuntimeKey()) setProfiles(result);
    }).catch(() => {
      if (request === generation.current && runtimeKey === getRuntimeKey()) setError(true);
    }).finally(() => {
      if (request === generation.current && runtimeKey === getRuntimeKey()) setLoading(false);
    });
    return () => { generation.current += 1; };
  }, [git, directory, retry]);

  const applyAuthor = async () => {
    if (!directory || saving || loading || !profiles.some((profile) => profile.id === selected)) return;
    const request = generation.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => request === generation.current && runtimeKey === getRuntimeKey();
    setSaving(true);
    setError(false);
    try {
      const result = await git.setGitIdentity(directory, selected);
      if (!isCurrent()) return;
      if (!result.success) { setError(true); return; }
      await fetchIdentity(directory, git);
      if (isCurrent()) setSelected('');
    } catch {
      if (isCurrent()) setError(true);
    } finally {
      if (isCurrent()) setSaving(false);
    }
  };
  const selectedProfile = profiles.find((profile) => profile.id === selected);

  return <SettingsControlGroup title={t('gitView.context.author')} className={cn('min-w-0', className)} contentClassName={SETTINGS_FIELDS_STACK_CLASS}>
    <SettingsStackedField label={t('gitView.header.identityTooltip')} controlClassName="max-w-none">
      <Select value={selected} onValueChange={setSelected} disabled={loading || saving || profiles.length === 0}>
        <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('gitView.context.author')}>
          <SelectValue placeholder={t(loading ? 'settings.sourceControl.binding.loading' : profiles.length ? 'gitView.header.identityTooltip' : 'gitView.header.noProfiles')}>
            {selectedProfile ? `${selectedProfile.name} · ${selectedProfile.userEmail}` : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>{profiles.map((profile) => <SelectItem key={profile.id} value={profile.id}>
          {profile.name} · {profile.userEmail}
        </SelectItem>)}</SelectContent>
      </Select>
    </SettingsStackedField>
    {error ? <p role="alert" className={cn(SETTINGS_HELPER_CLASS, 'text-[var(--status-error)]')}>
      {t('gitView.toast.applyIdentityFailed')}
    </p> : null}
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" className="max-w-full" disabled={!selected || loading || saving} onClick={() => void applyAuthor()}>
        <span className="truncate">{t('gitView.context.applyAuthor')}</span>
      </Button>
      {error ? <Button size="sm" variant="outline" disabled={saving || loading} onClick={() => setRetry((value) => value + 1)}>
        {t('settings.sourceControl.transport.retry')}
      </Button> : null}
    </div>
  </SettingsControlGroup>;
};

/**
 * Whether OpenChamber answers Git for this repository in the agent's shell.
 *
 * An opt-out, not a choice between two settings: when the machine-wide answer
 * is no, nothing is put into the agent's environment at all, so there is
 * nothing a single repository could turn back on.
 */
const AgentAuthorityEditor = ({ directory, className }: { directory: string; className?: string }) => {
  const { t } = useI18n();
  const { git } = useRuntimeAPIs();
  const machineEnabled = useUIStore((state) => state.agentGitAuthorityEnabled);
  const [enabled, setEnabled] = React.useState<boolean | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const generation = React.useRef(0);

  React.useEffect(() => {
    const request = ++generation.current;
    const runtimeKey = getRuntimeKey();
    setEnabled(null);
    setError(false);
    if (!directory || !git.getAgentGitAuthority) return;
    void git.getAgentGitAuthority(directory).then((value) => {
      if (request === generation.current && runtimeKey === getRuntimeKey()) setEnabled(value);
    }).catch(() => {
      if (request === generation.current && runtimeKey === getRuntimeKey()) setError(true);
    });
    return () => { generation.current += 1; };
  }, [directory, git]);

  if (!git.setAgentGitAuthority || !git.getAgentGitAuthority) return null;

  const change = (value: boolean) => {
    if (!git.setAgentGitAuthority || saving) return;
    const request = generation.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => request === generation.current && runtimeKey === getRuntimeKey();
    setEnabled(value);
    setSaving(true);
    setError(false);
    void git.setAgentGitAuthority(directory, value).then((stored) => {
      if (isCurrent()) setEnabled(stored);
    }).catch(() => {
      if (!isCurrent()) return;
      setEnabled(!value);
      setError(true);
    }).finally(() => {
      if (isCurrent()) setSaving(false);
    });
  };

  return <SettingsControlGroup title={t('settings.sourceControl.agentAuthority.title')} className={cn('min-w-0', className)}>
    <SettingsCheckboxRow
      checked={enabled ?? false}
      disabled={enabled === null || saving || !machineEnabled}
      onChange={change}
      label={t('settings.sourceControl.agentAuthority.label')}
      ariaLabel={t('settings.sourceControl.agentAuthority.label')}
      info={t(machineEnabled ? 'settings.sourceControl.agentAuthority.info' : 'settings.sourceControl.agentAuthority.machineOff')}
    />
    {error ? <p role="alert" className={cn(SETTINGS_HELPER_CLASS, 'text-[var(--status-error)]')}>
      {t('settings.gitlab.status.operationFailed')}
    </p> : null}
  </SettingsControlGroup>;
};

/**
 * What a repository needs beyond its identity.
 *
 * The identity carries the account, the transport and the signature, and the
 * panel names it on its own button, so this holds only what an identity does
 * not say: the separate grants for submodules and Git LFS, whether OpenChamber
 * answers Git in agent shells here, and starting over.
 */
export const RepositoryConfigurationDialog: React.FC<RepositoryConfigurationDialogProps> = ({ open, onOpenChange, directory, allowAuthorApply = false }) => {
  const { t } = useI18n();
  const { sourceControl } = useRuntimeAPIs();
  const mobileActions = useMobileAppActions();
  const binding = useRepositoryBinding(directory, sourceControl);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);
  const [resetError, setResetError] = React.useState(false);
  const resetRequestRef = React.useRef(0);
  const setSettingsPage = useUIStore((state) => state.setSettingsPage);
  const setSettingsDialogOpen = useUIStore((state) => state.setSettingsDialogOpen);
  const read = binding.read;

  React.useLayoutEffect(() => {
    resetRequestRef.current += 1;
    setResetOpen(false);
    setResetting(false);
    setResetError(false);
    return () => { resetRequestRef.current += 1; };
  }, [binding.scope, sourceControl]);

  const resetBinding = async (): Promise<void> => {
    if (resetting || binding.status !== 'ready' || !binding.isCurrent() || !read?.binding) return;
    const request = resetRequestRef.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => request === resetRequestRef.current && runtimeKey === getRuntimeKey();
    const mutationScope = repositoryBindingOwner.captureMutation(binding.scope, read);
    const intent: SourceControlRepositoryBindingResetIntent = {
      directory,
      expectedRepositoryId: read.repository.repositoryId,
      expectedRevision: read.revision,
      expectedConfigRevision: read.repository.configRevision,
      confirmed: true,
    };
    setResetting(true);
    setResetError(false);
    try {
      const result = await sourceControl.resetRepositoryBinding(intent);
      if (!repositoryBindingOwner.setMutationResult(mutationScope, result)) {
        await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      }
      if (isCurrent()) setResetOpen(false);
    } catch {
      if (isCurrent()) setResetError(true);
      await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
    } finally {
      mutationScope.release();
      if (isCurrent()) setResetting(false);
    }
  };


  return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        {open ? <DialogContent className="@container min-w-0 max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('gitView.context.configure')}</DialogTitle>
            <DialogDescription>{t('gitView.context.draft')}</DialogDescription>
          </DialogHeader>
          <AgentAuthorityEditor directory={directory} />
          <AuxiliaryBindingSettings directory={directory} className={DIALOG_DIVIDER_CLASS} />
          {allowAuthorApply ? <RepositoryAuthorEditor directory={directory} className={DIALOG_DIVIDER_CLASS} /> : null}
          {read?.binding ? <SettingsControlGroup
            title={t('settings.sourceControl.reset.title')}
            description={t('settings.sourceControl.reset.description')}
            className={cn('min-w-0', DIALOG_DIVIDER_CLASS)}
            contentClassName="pt-1"
          >
            <Dialog open={resetOpen} onOpenChange={(value) => { if (!resetting) { setResetOpen(value); setResetError(false); } }}>
              <DialogTrigger asChild><Button size="sm" variant="destructive" disabled={resetting || binding.status !== 'ready'}>
                {t('settings.sourceControl.reset.action')}
              </Button></DialogTrigger>
              {resetOpen ? <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('settings.sourceControl.reset.confirmTitle')}</DialogTitle>
                  <DialogDescription>{t('settings.sourceControl.reset.confirmDescription')}</DialogDescription>
                </DialogHeader>
                {resetError ? <p role="alert" className={cn(SETTINGS_HELPER_CLASS, 'text-[var(--status-error)]')}>
                  {t('settings.sourceControl.reset.failed')}
                </p> : null}
                <DialogFooter>
                  <Button size="sm" variant="ghost" disabled={resetting} onClick={() => setResetOpen(false)}>
                    {t('gitView.common.cancel')}
                  </Button>
                  <Button size="sm" variant="destructive" disabled={resetting} onClick={() => void resetBinding()}>
                    {t('settings.sourceControl.reset.confirmAction')}
                  </Button>
                </DialogFooter>
              </DialogContent> : null}
            </Dialog>
          </SettingsControlGroup> : null}
          <DialogFooter className={DIALOG_DIVIDER_CLASS}>
            <Button size="sm" variant="ghost" onClick={() => {
              onOpenChange(false);
              setSettingsPage('git');
              if (mobileActions) mobileActions.openSettings();
              else setSettingsDialogOpen(true);
            }}>{t('gitView.context.settings')}</Button>
            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>{t('dialog.common.actions.close')}</Button>
          </DialogFooter>
        </DialogContent> : null}
      </Dialog>
  );
};
