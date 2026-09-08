import React from 'react';
import {
  buildManagedAccountOptions,
  endpointsShareOrigin,
  getManagedCredentialSourceLabelKey,
  getSourceControlIdentityOrigin,
  getSourceControlProviderLabel,
  isSshRemoteUrl,
} from '@/lib/source-control/identity';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type {
  GitAuxiliaryBindingIntent,
  GitCheckoutHydrationRequirement,
  GitNetworkOperation,
  GitTransportBindingIntent,
  GitTransportBindingRemovalIntent,
  SourceControlAuthAccount,
  SourceControlIdentity,
} from '@/lib/api/types';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { GitOperationResultError, runCheckoutHydration } from '@/lib/boundGitNetworkOperation';
import { repositoryBindingOwner, useRepositoryBinding } from '@/lib/source-control/repository-binding';
import { getSourceControlAuthKey, useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { useProviderBindingEditor } from './useProviderBindingEditor';
import {
  SETTINGS_FIELDS_STACK_CLASS,
  SETTINGS_HELPER_CLASS,
  SETTINGS_SELECT_SIZE,
  SettingsCheckboxRow,
  SettingsControlGroup,
  SettingsGroupTitle,
  SettingsStackedField,
} from '../shared/SettingsSection';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Icon } from '@/components/icon/Icon';
import { ManagedSshCredentials } from './ManagedSshCredentials';
import { useGitOperationRecovery } from '@/components/views/git/useGitOperationRecovery';
import { GitOperationStatus } from '@/components/views/git/GitOperationStatus';

type SourceControlBindingSettingsProps = {
  className?: string;
  directory: string;
};

/** Selects inside the binding editors fill their stacked field instead of the shared settings width cap. */
const EDITOR_CONTROL_CLASS = 'max-w-none';
/** Action row under each editor: primary save first, quiet removal second. */
const EDITOR_ACTIONS_CLASS = 'flex flex-wrap items-center gap-2';
/** Remote and transport pickers sit side by side once the dialog is wide enough. */
const REMOTE_TRANSPORT_GRID_CLASS = 'grid grid-cols-1 gap-3 @sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]';

const EditorStatus = ({ error, children }: { error?: boolean; children: React.ReactNode }) => (
  <p role={error ? 'alert' : undefined} className={cn(SETTINGS_HELPER_CLASS, error && 'text-[var(--status-error)]')}>
    {children}
  </p>
);

export const CredentialLabel = ({ identity, account }: { identity: SourceControlIdentity; account?: SourceControlAuthAccount }) => {
  const { t } = useI18n();
  return <>{getSourceControlProviderLabel(identity.provider)} · {identity.instance}{account ? <>
    {' · '}@{account.user.username}{' · '}{t(getManagedCredentialSourceLabelKey(account.source))}{' · '}{account.id}
  </> : null}</>;
};

export const ProviderSourceControlBindingSettings: React.FC<SourceControlBindingSettingsProps> = ({
  className,
  directory,
}) => {
  const { t } = useI18n();
  const { sourceControl } = useRuntimeAPIs();
  const identities = useSourceControlAuthStore((state) => state.identities);
  const authEntries = useSourceControlAuthStore((state) => state.entries);
  const {
    bindingRead, boundProvider, options, selected, effectiveSelectedKey, setSelectedKey,
    isLoading, isSaving, error, canSave, retry, selectRef, saveBinding, removeBinding,
  } = useProviderBindingEditor({
    directory, sourceControl, identities,
    authEntry: (identity) => authEntries[getSourceControlAuthKey(identity)],
    operationFailed: t('settings.gitlab.status.operationFailed'),
  });

  let statusText = t('settings.sourceControl.binding.noRepository');
  if (directory && isLoading) statusText = t('settings.sourceControl.binding.loading');
  else if (bindingRead && !boundProvider) statusText = t('settings.sourceControl.binding.suggested');
  else if (boundProvider) statusText = t(canSave && boundProvider.readiness === 'ready' ? 'gitView.context.ready' : 'gitView.context.needsAttention');

  return (
    <SettingsControlGroup
      title={t('gitView.context.provider')}
      className={cn('min-w-0', className)}
      contentClassName={SETTINGS_FIELDS_STACK_CLASS}
    >
      <SettingsStackedField
        label={t('settings.sourceControl.binding.accountLabel')}
        info={t('settings.sourceControl.binding.configured')}
        controlClassName={EDITOR_CONTROL_CLASS}
      >
        <Select
          value={effectiveSelectedKey}
          onValueChange={setSelectedKey}
          disabled={!bindingRead || options.length === 0 || isSaving}
        >
          <SelectTrigger
            ref={selectRef}
            size={SETTINGS_SELECT_SIZE}
            className="w-full"
            aria-label={t('settings.sourceControl.binding.accountAriaLabel')}
          >
            <SelectValue placeholder={t('settings.sourceControl.binding.noAccounts')}>
              {selected ? <><CredentialLabel identity={selected.identity} account={selected.account} /> · {selected.remote.name}</> : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option.key} value={option.key}>
                <CredentialLabel identity={option.identity} account={option.account} /> · {option.remote.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsStackedField>
      <EditorStatus error={Boolean(error)}>{error ?? statusText}</EditorStatus>
      <div className={EDITOR_ACTIONS_CLASS}>
        <Button size="sm" onClick={saveBinding} disabled={!selected || isSaving || !canSave}>
          {bindingRead?.status === 'missing'
            ? t('settings.sourceControl.binding.confirm')
            : t('settings.common.actions.saveChanges')}
        </Button>
        {boundProvider ? (
          <Button size="sm" variant="ghost" className="max-w-full" onClick={removeBinding} disabled={isSaving || !canSave}>
            <span className="truncate">{t('gitView.context.removeProvider')}</span>
          </Button>
        ) : null}
        {error ? <Button size="sm" variant="outline" onClick={() => void retry()} disabled={isLoading || isSaving}>
          {t('settings.sourceControl.transport.retry')}
        </Button> : null}
      </div>
    </SettingsControlGroup>
  );
};

export const TransportBindingSettings: React.FC<SourceControlBindingSettingsProps> = ({
  className,
  directory,
}) => {
  const { t } = useI18n();
  const { git, sourceControl } = useRuntimeAPIs();
  const binding = useRepositoryBinding(directory, sourceControl);
  const bindingRead = binding.read;
  const [selectedRemote, setSelectedRemote] = React.useState('');
  const [selectedTransport, setSelectedTransport] = React.useState<'system' | 'https' | 'ssh' | 'anonymous' | ''>('');
  const [selectedAccount, setSelectedAccount] = React.useState('');
  const [selectedSshCredential, setSelectedSshCredential] = React.useState('');
  const [unverifiedConfirmed, setUnverifiedConfirmed] = React.useState(false);
  const identities = useSourceControlAuthStore((state) => state.identities);
  const authEntries = useSourceControlAuthStore((state) => state.entries);
  const refreshAccounts = useSourceControlAuthStore((state) => state.refreshAll);
  const identitiesError = useSourceControlAuthStore((state) => state.identitiesError);
  const isLoading = binding.status === 'loading';
  const [isSaving, setIsSaving] = React.useState(false);
  const [mutationError, setError] = React.useState<string | null>(null);
  const error = mutationError ?? (binding.error ? t('settings.gitlab.status.operationFailed') : null);
  const requestIdRef = React.useRef(0);
  const remoteSelectRef = React.useRef<HTMLButtonElement>(null);

  React.useLayoutEffect(() => {
    requestIdRef.current += 1;
    setError(null);
    setSelectedRemote('');
    setSelectedTransport('');
    setSelectedAccount('');
    setSelectedSshCredential('');
    setUnverifiedConfirmed(false);
    setIsSaving(false);
    return () => { requestIdRef.current += 1; };
  }, [binding.scope, sourceControl, git]);

  const remoteName = selectedRemote;
  const remote = bindingRead?.repository.remotes.find((item) => item.name === remoteName);
  const currentRemoteBinding = bindingRead?.binding?.remotes.find((item) => item.name === remoteName);
  const transport = selectedTransport;
  const httpsAvailable = remote?.fetch.displayUrl.startsWith('https://') && remote.push.displayUrl.startsWith('https://');
  const sshAvailable = Boolean(remote && [remote.fetch, remote.push].every((endpoint) => isSshRemoteUrl(endpoint.displayUrl)));
  React.useLayoutEffect(() => {
    setSelectedTransport('');
    setSelectedAccount('');
    setSelectedSshCredential('');
    setUnverifiedConfirmed(false);
  }, [remote?.fetch.fingerprint, remote?.push.fingerprint]);
  const accountOptions = identities.flatMap((identity) => {
    const entry = authEntries[getSourceControlAuthKey(identity)];
    if (!entry?.hasChecked || entry.isLoading || entry.status?.status !== 'connected') return [];
    const origin = getSourceControlIdentityOrigin(identity);
    if (!origin || !remote || !endpointsShareOrigin([remote.fetch.displayUrl, remote.push.displayUrl], origin)) return [];
    return buildManagedAccountOptions(identity, entry.status.accounts, (account) => t(getManagedCredentialSourceLabelKey(account.source)));
  });
  const account = accountOptions.find((option) => option.key === selectedAccount);
  const accountsFailed = Boolean(identitiesError) || identities.some((identity) => {
    const status = authEntries[getSourceControlAuthKey(identity)]?.status?.status;
    return status && status !== 'connected' && status !== 'disconnected';
  });
  const canSave = Boolean(binding.status === 'ready' && bindingRead && remote && transport && git.configureTransportBinding && !isSaving
    && (transport !== 'system' || unverifiedConfirmed)
    && (transport !== 'https' || httpsAvailable && account)
    && (transport !== 'anonymous' || remote?.fetch.displayUrl.startsWith('https://'))
    && (transport !== 'ssh' || sshAvailable && selectedSshCredential));
  const canRemove = Boolean(binding.status === 'ready' && bindingRead?.binding && remote && currentRemoteBinding
    && git.removeTransportBinding && !isSaving);

  const saveBinding = async (): Promise<void> => {
    if (!canSave || !binding.isCurrent() || !bindingRead || !remote || !transport || !git.configureTransportBinding) return;
    const requestId = requestIdRef.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => requestIdRef.current === requestId && runtimeKey === getRuntimeKey();
    const mutationScope = repositoryBindingOwner.captureMutation(binding.scope, bindingRead);
    setIsSaving(true);
    setError(null);
    try {
      const authority = {
        directory,
        expectedRepositoryId: bindingRead.repository.repositoryId,
        expectedRevision: bindingRead.revision,
        expectedConfigRevision: bindingRead.repository.configRevision,
        expectedFetchFingerprint: remote.fetch.fingerprint,
        expectedPushFingerprint: remote.push.fingerprint,
        remote: remoteName,
      };
      let intent: GitTransportBindingIntent;
      if (transport === 'system') intent = { ...authority, transport, unverifiedConfirmed: true };
      else if (transport === 'https' && account) intent = { ...authority, transport, credentialAccount: account.reference };
      else if (transport === 'ssh') intent = { ...authority, transport, sshCredentialId: selectedSshCredential };
      else intent = { ...authority, transport: 'anonymous' };
      const result = await git.configureTransportBinding(intent);
      if (result.status === 'configured' && !repositoryBindingOwner.setMutationResult(mutationScope, result.binding)) {
        await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      }
      if (!isCurrent()) return;
      if (result.status === 'configured') {
        setSelectedTransport('');
        setSelectedAccount('');
        setUnverifiedConfirmed(false);
      }
    } catch {
      if (isCurrent()) {
        setSelectedTransport('');
        setUnverifiedConfirmed(false);
        setError(t('settings.gitlab.status.operationFailed'));
      }
      await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      if (isCurrent()) remoteSelectRef.current?.focus();
    } finally {
      mutationScope.release();
      if (isCurrent()) setIsSaving(false);
    }
  };

  const removeBinding = async (): Promise<void> => {
    if (!canRemove || !binding.isCurrent() || !bindingRead?.binding || !remote || !currentRemoteBinding
      || !git.removeTransportBinding) return;
    const requestId = requestIdRef.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => requestIdRef.current === requestId && runtimeKey === getRuntimeKey();
    const mutationScope = repositoryBindingOwner.captureMutation(binding.scope, bindingRead);
    const intent: GitTransportBindingRemovalIntent = {
      directory,
      expectedRepositoryId: bindingRead.repository.repositoryId,
      expectedRevision: bindingRead.revision,
      expectedConfigRevision: bindingRead.repository.configRevision,
      expectedFetchFingerprint: remote.fetch.fingerprint,
      expectedPushFingerprint: remote.push.fingerprint,
      remote: remoteName,
    };
    setIsSaving(true);
    setError(null);
    try {
      const result = await git.removeTransportBinding(intent);
      if (!repositoryBindingOwner.setMutationResult(mutationScope, result.binding)) {
        await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      }
      if (isCurrent()) {
        setSelectedTransport('');
        setSelectedAccount('');
        setSelectedSshCredential('');
        setUnverifiedConfirmed(false);
      }
    } catch {
      if (isCurrent()) setError(t('settings.gitlab.status.operationFailed'));
      await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      if (isCurrent()) remoteSelectRef.current?.focus();
    } finally {
      mutationScope.release();
      if (isCurrent()) setIsSaving(false);
    }
  };

  let statusText = t('settings.sourceControl.transport.noRepository');
  if (directory && isLoading) statusText = t('settings.sourceControl.transport.loading');
  else if (bindingRead?.status === 'missing') statusText = t('settings.sourceControl.transport.missing');
  else if (bindingRead?.status === 'needs-attention') statusText = t('settings.sourceControl.transport.needsAttention');
  else if (bindingRead?.status === 'bound' && currentRemoteBinding) statusText = t('settings.sourceControl.transport.configured');
  else if (bindingRead) statusText = t('settings.sourceControl.transport.missing');

  return (
    <SettingsControlGroup
      title={t('gitView.context.transport')}
      info={t('settings.sourceControl.transport.info')}
      className={cn('min-w-0', className)}
      contentClassName={SETTINGS_FIELDS_STACK_CLASS}
    >
      <div className={REMOTE_TRANSPORT_GRID_CLASS}>
        <SettingsStackedField label={t('settings.sourceControl.transport.remoteLabel')} controlClassName={EDITOR_CONTROL_CLASS}>
          <Select value={remoteName} onValueChange={(value) => {
            setSelectedRemote(value);
            setSelectedTransport('');
            setSelectedAccount('');
            setUnverifiedConfirmed(false);
          }} disabled={!bindingRead || isSaving}>
            <SelectTrigger
              ref={remoteSelectRef}
              size={SETTINGS_SELECT_SIZE}
              className="w-full"
              aria-label={t('settings.sourceControl.transport.remoteAriaLabel')}
            >
              <SelectValue placeholder={t(bindingRead?.repository.remotes.length
                ? 'settings.sourceControl.transport.remoteLabel' : 'settings.sourceControl.transport.noRemotes')} />
            </SelectTrigger>
            <SelectContent>
              {bindingRead?.repository.remotes.map((item) => (
                <SelectItem key={item.name} value={item.name}>{item.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsStackedField>
        <SettingsStackedField label={t('settings.sourceControl.transport.modeLabel')} controlClassName={EDITOR_CONTROL_CLASS}>
          <Select
            value={transport}
            onValueChange={(value) => {
              if (value === 'system' || value === 'https' || value === 'ssh' || value === 'anonymous') {
                setSelectedTransport(value);
                setUnverifiedConfirmed(false);
                setSelectedAccount('');
              }
            }}
            disabled={!remote || isSaving}
          >
            <SelectTrigger
              size={SETTINGS_SELECT_SIZE}
              className="w-full"
              aria-label={t('settings.sourceControl.transport.modeAriaLabel')}
            >
              <SelectValue placeholder={t('settings.sourceControl.transport.choose')}>
                {transport ? t(transport === 'system' ? 'settings.sourceControl.transport.system'
                  : transport === 'anonymous' ? 'settings.sourceControl.transport.anonymous'
                    : transport === 'https' ? 'settings.sourceControl.transport.https' : 'settings.sourceControl.transport.ssh') : undefined}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('settings.sourceControl.transport.system')}</SelectItem>
              <SelectItem value="anonymous" disabled={!remote?.fetch.displayUrl.startsWith('https://')}>{t('settings.sourceControl.transport.anonymous')}</SelectItem>
              <SelectItem value="https" disabled={!httpsAvailable}>{t('settings.sourceControl.transport.https')}</SelectItem>
              <SelectItem value="ssh" disabled={!sshAvailable}>{t('settings.sourceControl.transport.ssh')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsStackedField>
      </div>
      {transport === 'https' ? (
        <SettingsStackedField label={t('settings.sourceControl.transport.credentialAccount')} controlClassName={cn(EDITOR_CONTROL_CLASS, 'flex-wrap')}>
          <Select value={selectedAccount} onValueChange={setSelectedAccount} disabled={isSaving}>
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('settings.sourceControl.transport.credentialAccount')}>
              <SelectValue placeholder={t(accountOptions.length
                ? 'settings.sourceControl.transport.credentialAccount' : 'settings.sourceControl.binding.noAccounts')}>{account?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>{accountOptions.map((option) => <SelectItem key={option.key} value={option.key}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          {accountsFailed ? <EditorStatus error>{t('settings.gitlab.status.operationFailed')}</EditorStatus> : null}
          <Button size="sm" variant="ghost" disabled={isSaving} onClick={() => void refreshAccounts(sourceControl, { force: true })}>
            {t('settings.sourceControl.transport.retry')}
          </Button>
        </SettingsStackedField>
      ) : null}
      {transport === 'ssh' ? <ManagedSshCredentials
        selection={{ value: selectedSshCredential, onChange: setSelectedSshCredential }} disabled={isSaving}
      /> : null}
      {transport === 'system' ? <SettingsCheckboxRow
        checked={unverifiedConfirmed} onChange={setUnverifiedConfirmed} disabled={isSaving}
        label={t('settings.sourceControl.transport.unverifiedConfirmation')}
      /> : null}
      <EditorStatus error={Boolean(error)}>{error ?? statusText}</EditorStatus>
      <div className={EDITOR_ACTIONS_CLASS}>
        <Button size="sm" onClick={saveBinding} disabled={!canSave}>
          {bindingRead?.status === 'missing'
            ? t('settings.sourceControl.transport.bind')
            : t('settings.common.actions.saveChanges')}
        </Button>
        {currentRemoteBinding ? <Button size="sm" variant="ghost" onClick={() => void removeBinding()} disabled={!canRemove}>
          {t('settings.sourceControl.transport.remove')}
        </Button> : null}
        {error ? <Button size="sm" variant="outline" onClick={() => { setError(null); void binding.retry(); }} disabled={isSaving || isLoading}>
          {t('settings.sourceControl.transport.retry')}
        </Button> : null}
      </div>
    </SettingsControlGroup>
  );
};

const hydrationRequirements = (operation: GitNetworkOperation | undefined): GitCheckoutHydrationRequirement[] => {
  if (!operation || operation.target.operation !== 'checkout-hydration') return [];
  const entries = [...operation.target.requirements];
  const discovered = [
    ...(operation.hydration?.submodules ?? []).map((item) => ({ kind: 'submodule' as const, item })),
    ...(operation.hydration?.lfs ?? []).map((item) => ({ kind: 'lfs' as const, item })),
  ];
  for (const { kind, item } of discovered) {
    const endpoint = item.endpoint;
    if (!endpoint) continue;
    if (!entries.some((entry) => entry.kind === kind && entry.path === item.path
      && entry.endpoint.fingerprint === endpoint.fingerprint)) {
      entries.push({ kind, path: item.path, endpoint });
    }
  }
  return entries;
};

export const AuxiliaryBindingSettings: React.FC<SourceControlBindingSettingsProps> = ({ directory, className }) => {
  const { t } = useI18n();
  const { git, sourceControl } = useRuntimeAPIs();
  const binding = useRepositoryBinding(directory, sourceControl);
  const recovery = useGitOperationRecovery(directory, git, sourceControl);
  const [parentRemote, setParentRemote] = React.useState('');
  const [selectedRequirement, setSelectedRequirement] = React.useState('');
  const [transport, setTransport] = React.useState<'system' | 'https' | 'ssh' | 'anonymous' | ''>('');
  const [accountKey, setAccountKey] = React.useState('');
  const [sshCredential, setSshCredential] = React.useState('');
  const [unverifiedConfirmed, setUnverifiedConfirmed] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const requestRef = React.useRef(0);
  const identities = useSourceControlAuthStore((state) => state.identities);
  const authEntries = useSourceControlAuthStore((state) => state.entries);
  const latest = recovery.entry?.reads.at(-1)?.operation;
  const requirements = latest?.target.operation === 'checkout-hydration'
    && latest.target.remote.name === parentRemote ? hydrationRequirements(latest) : [];
  const selected = requirements.find((entry) => JSON.stringify([entry.kind, entry.path, entry.endpoint.fingerprint]) === selectedRequirement);
  const read = binding.read;
  const remote = read?.repository.remotes.find((entry) => entry.name === parentRemote);
  const currentGrant = selected && read?.binding?.auxiliary.find((entry) => entry.kind === selected.kind
    && entry.endpoint.fingerprint === selected.endpoint.fingerprint);

  React.useLayoutEffect(() => {
    requestRef.current += 1;
    setParentRemote('');
    setSelectedRequirement('');
    setTransport('');
    setAccountKey('');
    setSshCredential('');
    setUnverifiedConfirmed(false);
    setSaving(false);
    setError(false);
    setOpen(false);
    return () => { requestRef.current += 1; };
  }, [binding.scope, git, sourceControl]);

  React.useLayoutEffect(() => {
    setTransport('');
    setAccountKey('');
    setSshCredential('');
    setUnverifiedConfirmed(false);
  }, [selected?.endpoint.fingerprint]);

  const accountOptions = identities.flatMap((identity) => {
    const entry = authEntries[getSourceControlAuthKey(identity)];
    if (!selected?.endpoint.displayUrl.startsWith('https://') || entry?.status?.status !== 'connected') return [];
    const origin = getSourceControlIdentityOrigin(identity);
    if (!origin || !endpointsShareOrigin([selected.endpoint.displayUrl], origin)) return [];
    return buildManagedAccountOptions(identity, entry.status.accounts, (account) => t(getManagedCredentialSourceLabelKey(account.source)));
  });
  const account = accountOptions.find((entry) => entry.key === accountKey);
  const isHttps = selected?.endpoint.displayUrl.startsWith('https://');
  const isSsh = Boolean(selected && isSshRemoteUrl(selected.endpoint.displayUrl));
  const canSave = Boolean(binding.status === 'ready' && read?.binding && remote && selected
    && git.configureAuxiliaryBinding && !saving && transport
    && (transport !== 'system' || unverifiedConfirmed)
    && (transport !== 'https' || isHttps && account)
    && (transport !== 'ssh' || isSsh && sshCredential)
    && (transport !== 'anonymous' || isHttps));
  const canRemove = Boolean(binding.status === 'ready' && currentGrant && remote && git.configureAuxiliaryBinding && !saving);

  const retryHydration = async () => {
    if (!parentRemote || recovery.blocked) return;
    const action = recovery.start();
    if (!action) return;
    setError(false);
    try {
      await runCheckoutHydration({
        directory, git, sourceControl, parentRemoteName: parentRemote, onOperation: action.onOperation,
      });
    } catch (caught) {
      if (!(caught instanceof GitOperationResultError)) setError(true);
    } finally {
      action.finish();
    }
  };

  const save = async (operation: 'configure' | 'remove') => {
    if ((operation === 'configure' && !canSave) || (operation === 'remove' && !canRemove)
      || !binding.isCurrent() || !read?.binding || !remote || !selected || !git.configureAuxiliaryBinding) return;
    const request = requestRef.current;
    const runtimeKey = getRuntimeKey();
    const isCurrent = () => requestRef.current === request && runtimeKey === getRuntimeKey();
    const authority = {
      directory,
      expectedRepositoryId: read.repository.repositoryId,
      expectedRevision: read.revision,
      expectedConfigRevision: read.repository.configRevision,
      parentRemote,
      expectedParentFingerprint: remote.fetch.fingerprint,
      kind: selected.kind,
      path: selected.path,
      expectedEndpointFingerprint: selected.endpoint.fingerprint,
    };
    let intent: GitAuxiliaryBindingIntent;
    if (operation === 'remove') intent = { ...authority, operation };
    else if (transport === 'system') intent = { ...authority, operation, transport, unverifiedConfirmed: true };
    else if (transport === 'https' && account) intent = { ...authority, operation, transport, credentialAccount: account.reference };
    else if (transport === 'ssh') intent = { ...authority, operation, transport, sshCredentialId: sshCredential };
    else if (transport === 'anonymous') intent = { ...authority, operation, transport };
    else return;
    const mutationScope = repositoryBindingOwner.captureMutation(binding.scope, read);
    setSaving(true);
    setError(false);
    try {
      const result = await git.configureAuxiliaryBinding(intent);
      if (!repositoryBindingOwner.setMutationResult(mutationScope, result.binding)) {
        await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
      }
      if (isCurrent()) {
        setTransport('');
        setAccountKey('');
        setSshCredential('');
        setUnverifiedConfirmed(false);
      }
    } catch {
      if (isCurrent()) setError(true);
      await repositoryBindingOwner.reconcile(mutationScope, sourceControl);
    } finally {
      mutationScope.release();
      if (isCurrent()) setSaving(false);
    }
  };

  const kindLabel = (kind: GitCheckoutHydrationRequirement['kind']) => t(kind === 'submodule' ? 'gitView.hydration.kind.submodule' : 'gitView.hydration.kind.lfs');

  // Most repositories have neither submodules nor LFS, and the endpoint list
  // only appears once a parent remote is chosen and the checkout is inspected.
  // The block therefore stays closed until someone asks for it.
  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn('min-w-0', className)}>
      <CollapsibleTrigger className="w-auto justify-start gap-1.5">
        <SettingsGroupTitle>{t('gitView.hydration.title')}</SettingsGroupTitle>
        <Icon name={open ? 'arrow-up-s' : 'arrow-down-s'} className="h-4 w-4 text-muted-foreground" />
      </CollapsibleTrigger>
      <CollapsibleContent>
    <SettingsControlGroup
      description={t('gitView.hydration.description')}
      className="min-w-0 pt-2"
      contentClassName={SETTINGS_FIELDS_STACK_CLASS}
    >
      <SettingsStackedField label={t('gitView.hydration.parentRemote')} controlClassName={EDITOR_CONTROL_CLASS}>
        <Select value={parentRemote} onValueChange={(value) => {
          setParentRemote(value);
          setSelectedRequirement('');
          setTransport('');
          setAccountKey('');
          setSshCredential('');
          setUnverifiedConfirmed(false);
        }} disabled={!read?.binding || saving || recovery.blocked}>
          <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('gitView.hydration.parentRemote')}>
            <SelectValue placeholder={t('settings.sourceControl.transport.remoteLabel')} />
          </SelectTrigger>
          <SelectContent>{read?.binding?.remotes.filter((entry) => entry.readiness === 'ready').map((entry) => (
            <SelectItem key={entry.name} value={entry.name}>{entry.name}</SelectItem>
          ))}</SelectContent>
        </Select>
      </SettingsStackedField>
      <GitOperationStatus entry={recovery.entry} onRefresh={() => void recovery.refresh()} onCancel={() => void recovery.cancel()} />
      {requirements.length ? <SettingsStackedField label={t('gitView.hydration.endpoint')} controlClassName={EDITOR_CONTROL_CLASS}>
        <Select value={selectedRequirement} onValueChange={setSelectedRequirement} disabled={saving}>
          <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('gitView.hydration.endpoint')}>
            <SelectValue placeholder={t('gitView.hydration.chooseEndpoint')}>
              {selected ? `${selected.path} · ${kindLabel(selected.kind)} · ${selected.endpoint.displayUrl}` : undefined}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>{requirements.map((entry) => {
            const key = JSON.stringify([entry.kind, entry.path, entry.endpoint.fingerprint]);
            return <SelectItem key={key} value={key}>{entry.path} · {kindLabel(entry.kind)} · {entry.endpoint.displayUrl}</SelectItem>;
          })}</SelectContent>
        </Select>
      </SettingsStackedField> : null}
      {selected ? <>
        <SettingsStackedField label={t('settings.sourceControl.transport.modeLabel')} controlClassName={EDITOR_CONTROL_CLASS}>
          <Select value={transport} onValueChange={(value) => {
            if (value === 'system' || value === 'https' || value === 'ssh' || value === 'anonymous') setTransport(value);
          }} disabled={saving}>
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('settings.sourceControl.transport.modeAriaLabel')}>
              <SelectValue placeholder={t('settings.sourceControl.transport.choose')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t('settings.sourceControl.transport.system')}</SelectItem>
              <SelectItem value="anonymous" disabled={!isHttps}>{t('settings.sourceControl.transport.anonymous')}</SelectItem>
              <SelectItem value="https" disabled={!isHttps}>{t('settings.sourceControl.transport.https')}</SelectItem>
              <SelectItem value="ssh" disabled={!isSsh}>{t('settings.sourceControl.transport.ssh')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsStackedField>
        {transport === 'https' ? <SettingsStackedField label={t('settings.sourceControl.transport.credentialAccount')} controlClassName={EDITOR_CONTROL_CLASS}>
          <Select value={accountKey} onValueChange={setAccountKey} disabled={saving}>
            <SelectTrigger size={SETTINGS_SELECT_SIZE} className="w-full" aria-label={t('settings.sourceControl.transport.credentialAccount')}>
              <SelectValue placeholder={t('settings.sourceControl.binding.noAccounts')}>{account?.label}</SelectValue>
            </SelectTrigger>
            <SelectContent>{accountOptions.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.label}</SelectItem>)}</SelectContent>
          </Select>
        </SettingsStackedField> : null}
        {transport === 'ssh' ? <ManagedSshCredentials selection={{ value: sshCredential, onChange: setSshCredential }} disabled={saving} /> : null}
        {transport === 'system' ? <SettingsCheckboxRow checked={unverifiedConfirmed} onChange={setUnverifiedConfirmed} disabled={saving}
          label={t('gitView.hydration.systemConfirmation')} /> : null}
      </> : null}
      {latest?.hydration?.status === 'client-missing' ? <p role="alert" className={cn(SETTINGS_HELPER_CLASS, 'text-[var(--status-warning)]')}>
        {t('gitView.hydration.lfsMissing')}
      </p> : null}
      {error ? <EditorStatus error>{t('settings.gitlab.status.operationFailed')}</EditorStatus> : null}
      <div className={EDITOR_ACTIONS_CLASS}>
        <Button size="sm" variant="outline" disabled={!parentRemote || recovery.blocked || saving} onClick={() => void retryHydration()}>
          {t('gitView.hydration.retry')}
        </Button>
        {selected ? <>
          <Button size="sm" disabled={!canSave} onClick={() => void save('configure')}>{t('settings.common.actions.saveChanges')}</Button>
          {currentGrant ? <Button size="sm" variant="ghost" disabled={!canRemove} onClick={() => void save('remove')}>{t('settings.common.actions.delete')}</Button> : null}
        </> : null}
      </div>
    </SettingsControlGroup>
      </CollapsibleContent>
    </Collapsible>
  );
};
