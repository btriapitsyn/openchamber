import { isCompleteIdentity } from '@/lib/api/git-identity';
import React from 'react';
import { Icon } from '@/components/icon/Icon';

import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { ScrollShadow } from '@/components/ui/ScrollShadow';
import { ChangesPanel, type ChangesGroupConfig } from '@/components/views/git/ChangesPanel';
import { BranchSelector } from '@/components/views/git/BranchSelector';
import { CommitSection } from '@/components/views/git/CommitSection';
import { DirtyBranchSwitchDialog } from '@/components/views/git/DirtyBranchSwitchDialog';
import { SyncActions } from '@/components/views/git/SyncActions';
import { ContributorDestinationDialog } from '@/components/views/git/ContributorDestinationDialog';
import { useContributorDestinationChooser } from '@/components/views/git/contributorDestination';
import { RepositoryConfigurationDialog } from '@/components/sections/openchamber/SourceControlBindingSettings';
import { IdentityDropdown } from '@/components/views/git/GitHeader';
import { useGitIdentitiesStore } from '@/stores/useGitIdentitiesStore';
import { applyIdentityToRepository, identityApplicability, needsSystemAcknowledgement, isSignatureOnlyIdentity } from '@/lib/source-control/applyIdentity';
import { remoteTraits,
  selectableIdentities,
  identityDisplayName,
  identityAccountConnected,
  activeIdentityFor,
} from '@/lib/source-control/identity';
import { useConnectedAccountIds, useSourceControlAuthStore } from '@/stores/useSourceControlAuthStore';
import { SystemIdentityConfirmDialog } from '@/components/views/git/SystemIdentityConfirmDialog';
import type { GitIdentityProfile } from '@/lib/api/types';
import { PierreDiffViewer } from '@/components/views/PierreDiffViewer';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { useNestedGitDirectory } from '@/hooks/useNestedGitDirectory';
import type { GitStatus } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { generateCommitMessage, stageGitFile, stageGitFiles, unstageGitFile, unstageGitFiles } from '@/lib/gitApi';
import type { GitRemote } from '@/lib/gitApi';
import { getLanguageFromExtension, isImageFile } from '@/lib/toolHelpers';
import {
  useGitStore,
  useGitIdentity,
  useGitStatus,
  useGitBranches,
  useIsGitRepo,
  useGitLoadingStatus,
} from '@/stores/useGitStore';
import { NestedRepoResolutionStates } from '@/components/views/git/NestedRepoResolutionStates';
import { NestedRepoPicker } from '@/components/views/git/NestedRepoPicker';
import { getRuntimeKey } from '@/lib/runtime-switch';
import { BoundGitNetworkOperationError, GitOperationResultError, runBoundGitNetworkOperation } from '@/lib/boundGitNetworkOperation';
import { useGitOperationRecovery } from '@/components/views/git/useGitOperationRecovery';
import { GitOperationStatus } from '@/components/views/git/GitOperationStatus';
import { PendingGitOperationError } from '@/lib/source-control/git-operation-recovery';
import { useGitPublishChooser } from '@/components/views/git/useGitPublishChooser';
import { PublishDialog } from '@/components/views/git/PublishDialog';
import { settleGitFileReverts } from './mobileChangesOperations';

type SyncAction = 'fetch' | 'sync' | 'publish' | null;
type CommitAction = 'commit' | 'commitAndPush' | null;

const normalizePath = (value?: string | null): string => (value || '').replace(/\\/g, '/').replace(/\/+$/g, '');

const isStagedStatusFile = (file: GitStatus['files'][number]): boolean => {
  const indexStatus = file.index?.trim();
  return Boolean(indexStatus && indexStatus !== '?');
};

const isUnstagedStatusFile = (file: GitStatus['files'][number]): boolean => {
  const workingStatus = file.working_dir?.trim();
  const indexStatus = file.index?.trim();
  return Boolean(workingStatus || indexStatus === '?');
};

const diffCacheKey = (path: string, staged: boolean): string => staged ? `${path}\u0000staged` : path;

type MobileChangesSurfaceProps = {
  /** When provided, the list header gets a close X that calls this. */
  onClose?: () => void;
  /**
   * When set (and non-null), the surface opens directly into the per-file diff view for this
   * relative path. Updating it (incl. setting it to a different path while open) routes the
   * surface to that diff. Setting it back to null leaves the user on the current internal route.
   */
  initialDiffPath?: string | null;
  initialDiffStaged?: boolean;
};

export const MobileChangesSurface: React.FC<MobileChangesSurfaceProps> = ({ onClose, initialDiffPath, initialDiffStaged = false }) => {
  const { t } = useI18n();
  const { git, sourceControl } = useRuntimeAPIs();
  const rootDirectory = normalizePath(useEffectiveDirectory() ?? null);
  // When the root is not itself a repository, changes come from the resolved
  // nested repository instead.
  const { rootIsGitRepo, gitDirectory, nestedRepos } = useNestedGitDirectory(rootDirectory || null);
  const currentDirectory = gitDirectory ?? rootDirectory;
  const status = useGitStatus(currentDirectory || null);
  const branches = useGitBranches(currentDirectory || null);
  const currentIdentity = useGitIdentity(currentDirectory || null);
  const [isRepositoryConfigurationOpen, setRepositoryConfigurationOpen] = React.useState(false);
  const [isApplyingIdentity, setIsApplyingIdentity] = React.useState(false);
  const [pendingSystemIdentity, setPendingSystemIdentity] = React.useState<GitIdentityProfile | null>(null);
  const gitIdentityProfiles = useGitIdentitiesStore((state) => state.profiles);
  const globalGitIdentity = useGitIdentitiesStore((state) => state.globalIdentity);
  const loadGitIdentityProfiles = useGitIdentitiesStore((state) => state.loadProfiles);
  const loadGlobalGitIdentity = useGitIdentitiesStore((state) => state.loadGlobalIdentity);
  React.useEffect(() => {
    void loadGitIdentityProfiles();
    void loadGlobalGitIdentity();
  }, [loadGitIdentityProfiles, loadGlobalGitIdentity]);
  const connectedAccountIds = useConnectedAccountIds();
  const refreshIdentityAccounts = useSourceControlAuthStore((state) => state.refreshIdentityAccounts);
  const availableIdentities = React.useMemo(
    () => selectableIdentities(gitIdentityProfiles, globalGitIdentity,
      (identity) => (isCompleteIdentity(identity) || isSignatureOnlyIdentity(identity))
        && identityAccountConnected(identity, connectedAccountIds)),
    [gitIdentityProfiles, globalGitIdentity, connectedAccountIds],
  );
  const activeIdentityProfile = React.useMemo(
    () => activeIdentityFor(gitIdentityProfiles, globalGitIdentity, currentIdentity, (author) => ({
      id: 'local-config', name: author.userName, ...author, color: 'info', icon: 'user',
    })),
    [currentIdentity, gitIdentityProfiles, globalGitIdentity],
  );

  /**
   * Switching identity here writes the same three answers the add and clone
   * screens write. System Git is the exception: trusting whatever the machine
   * holds is confirmed in the repository configuration, not by a menu pick.
   */
  const applyIdentity = async (profile: GitIdentityProfile, acknowledgedSystem: boolean) => {
    if (!currentDirectory || isApplyingIdentity) return;
    setIsApplyingIdentity(true);
    try {
      const outcome = await applyIdentityToRepository(
        { directory: currentDirectory, identity: profile, remoteName: effectiveRemotes[0]?.name ?? null, acknowledgedSystem },
        { git, sourceControl },
      );
      if (outcome.status === 'failed') toast.error(t('gitView.toast.applyIdentityFailed'));
      else toast.success(t('gitView.toast.appliedIdentity', { name: identityDisplayName(profile, t) }));
    } finally {
      setIsApplyingIdentity(false);
    }
  };

  const handleApplyIdentity = async (profile: GitIdentityProfile) => {
    // Asked before anything is written, so cancelling leaves the repository as
    // it was rather than with a signature applied and a transport refused.
    if (needsSystemAcknowledgement(profile, effectiveRemotes.length > 0)) {
      setPendingSystemIdentity(profile);
      return;
    }
    await applyIdentity(profile, false);
  };
  const isGitRepo = useIsGitRepo(currentDirectory || null);
  const isLoadingStatus = useGitLoadingStatus(currentDirectory || null);
  const setActiveDirectory = useGitStore((state) => state.setActiveDirectory);
  const ensureAll = useGitStore((state) => state.ensureAll);
  const ensureNestedRepos = useGitStore((state) => state.ensureNestedRepos);
  const selectNestedRepo = useGitStore((state) => state.selectNestedRepo);
  const fetchStatus = useGitStore((state) => state.fetchStatus);
  const fetchBranches = useGitStore((state) => state.fetchBranches);
  const prefetchDiffs = useGitStore((state) => state.prefetchDiffs);
  const getDiff = useGitStore((state) => state.getDiff);
  const setDiff = useGitStore((state) => state.setDiff);

  const [route, setRoute] = React.useState<{ type: 'list' } | { type: 'diff'; path: string; staged: boolean }>(
    () => (initialDiffPath ? { type: 'diff', path: initialDiffPath, staged: initialDiffStaged } : { type: 'list' }),
  );

  // Allow the host (MobileApp) to push us into a specific diff when the surface
  // is reopened or when an external trigger (e.g. PendingChangesBar tap) requests
  // a different file mid-session.
  React.useEffect(() => {
    if (!initialDiffPath) return;
    setRoute((current) => (
      current.type === 'diff' && current.path === initialDiffPath && current.staged === initialDiffStaged
        ? current
        : { type: 'diff', path: initialDiffPath, staged: initialDiffStaged }
    ));
  }, [initialDiffPath, initialDiffStaged]);
  const [syncAction, setSyncAction] = React.useState<SyncAction>(null);
  const [commitAction, setCommitAction] = React.useState<CommitAction>(null);
  const [commitMessage, setCommitMessage] = React.useState('');
  const [revertingPaths, setRevertingPaths] = React.useState<Set<string>>(new Set());
  const [isRevertingAll, setIsRevertingAll] = React.useState(false);
  const [isGeneratingMessage, setIsGeneratingMessage] = React.useState(false);
  const [generatedHighlights, setGeneratedHighlights] = React.useState<string[]>([]);
  const [visibleChangePaths, setVisibleChangePaths] = React.useState<string[]>([]);
  const [remotes, setRemotes] = React.useState<GitRemote[]>([]);
  const [diffLoadError, setDiffLoadError] = React.useState<string | null>(null);
  const [diffRetryNonce, setDiffRetryNonce] = React.useState(0);
  const contributorDestination = useContributorDestinationChooser();
  const publishChooser = useGitPublishChooser({ directory: currentDirectory, branch: status?.current, chooseContributor: contributorDestination.choose });
  const operationRecovery = useGitOperationRecovery(currentDirectory, git, sourceControl);
  const [pendingDirtySwitchBranch, setPendingDirtySwitchBranch] = React.useState<string | null>(null);
  const changeEntries = React.useMemo(() => {
    const files = status?.files ?? [];
    const unique = new Map<string, (typeof files)[number]>();
    for (const file of files) {
      unique.set(file.path, file);
    }
    return Array.from(unique.values()).sort((a, b) => a.path.localeCompare(b.path));
  }, [status?.files]);

  const stagedChangeEntries = React.useMemo(
    () => changeEntries.filter(isStagedStatusFile),
    [changeEntries],
  );

  const unstagedChangeEntries = React.useMemo(
    () => changeEntries.filter(isUnstagedStatusFile),
    [changeEntries],
  );

  const effectiveRemotes = remotes;

  const selectedDiff = useGitStore(React.useCallback((state) => {
    if (!currentDirectory || route.type !== 'diff') return null;
    return state.directories.get(currentDirectory)?.diffCache.get(diffCacheKey(route.path, route.staged)) ?? null;
  }, [currentDirectory, route]));

  const selectedFileEntry = React.useMemo(() => {
    if (route.type !== 'diff') return null;
    return changeEntries.find((entry) => entry.path === route.path) ?? null;
  }, [changeEntries, route]);

  const refreshStatusAndBranches = React.useCallback(async (showErrors = true) => {
    if (!currentDirectory) return;
    try {
      await Promise.all([
        fetchStatus(currentDirectory, git),
        fetchBranches(currentDirectory, git),
      ]);
    } catch (error) {
      if (showErrors) {
        toast.error(error instanceof Error ? error.message : t('gitView.toast.refreshRepositoryFailed'));
      }
    }
  }, [currentDirectory, fetchBranches, fetchStatus, git, t]);

  const localBranches = React.useMemo(
    () => (branches?.all ?? []).filter((branch) => !branch.startsWith('remotes/')).sort(),
    [branches],
  );

  const remoteBranches = React.useMemo(
    () => (branches?.all ?? [])
      .filter((branch) => branch.startsWith('remotes/'))
      .map((branch) => branch.replace(/^remotes\//, ''))
      .sort(),
    [branches],
  );

  const performCheckout = React.useCallback(async (branch: string) => {
    if (!currentDirectory) return;
    const normalized = branch.replace(/^remotes\//, '');
    try {
      const result = await git.checkoutBranch(currentDirectory, normalized);
      toast.success(t('gitView.toast.checkedOut', { name: result.branch || normalized }));
      await refreshStatusAndBranches();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitView.toast.checkoutFailed', { name: normalized }));
    }
  }, [currentDirectory, git, refreshStatusAndBranches, t]);

  const handleCheckoutBranch = React.useCallback((branch: string) => {
    const normalized = branch.replace(/^remotes\//, '');
    if ((status?.files?.length ?? 0) > 0) {
      setPendingDirtySwitchBranch(normalized);
      return;
    }
    void performCheckout(normalized);
  }, [performCheckout, status?.files]);

  // Creating a branch does not publish it: pushing is an explicit planned
  // operation, so it never rides along with a local branch creation.
  const handleCreateBranch = React.useCallback(async (branch: string) => {
    if (!currentDirectory) return;
    try {
      await git.createBranch(currentDirectory, branch, status?.current ?? 'HEAD');
      await git.checkoutBranch(currentDirectory, branch);
      await refreshStatusAndBranches();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitView.toast.createBranchFailed'));
      throw error;
    }
  }, [currentDirectory, git, refreshStatusAndBranches, status?.current, t]);

  const refreshRemotes = React.useCallback(async () => {
    if (!currentDirectory) {
      setRemotes([]);
      return;
    }
    try {
      const remoteList = await git.getRemotes(currentDirectory);
      setRemotes(remoteList);
    } catch {
      setRemotes([]);
    }
  }, [currentDirectory, git]);

  React.useEffect(() => {
    if (!currentDirectory) return;
    setActiveDirectory(currentDirectory);
    void ensureAll(currentDirectory, git);
  }, [currentDirectory, ensureAll, git, setActiveDirectory]);

  React.useEffect(() => {
    void refreshRemotes();
  }, [refreshRemotes]);

  React.useEffect(() => {
    if (!currentDirectory || changeEntries.length === 0) return;
    const orderedPaths = Array.from(new Set([
      ...stagedChangeEntries.map((entry) => entry.path),
      ...visibleChangePaths,
      ...changeEntries.slice(0, 20).map((entry) => entry.path),
    ])).filter(Boolean);
    if (orderedPaths.length === 0) return;
    const timeoutId = window.setTimeout(() => {
      void prefetchDiffs(currentDirectory, git, orderedPaths, { maxFiles: 40 });
    }, 120);
    return () => window.clearTimeout(timeoutId);
  }, [changeEntries, currentDirectory, git, prefetchDiffs, stagedChangeEntries, visibleChangePaths]);

  React.useEffect(() => {
    if (route.type !== 'diff') {
      setDiffLoadError(null);
      return;
    }
    const cacheKey = diffCacheKey(route.path, route.staged);
    if (!currentDirectory || getDiff(currentDirectory, cacheKey)) {
      setDiffLoadError(null);
      return;
    }

    let cancelled = false;
    const runtimeKey = getRuntimeKey();
    setDiffLoadError(null);
    void git.getGitFileDiff(currentDirectory, { path: route.path, staged: route.staged || undefined })
      .then((response) => {
        if (cancelled) return;
        setDiff(currentDirectory, cacheKey, {
          original: response.original ?? '',
          modified: response.modified ?? '',
          isBinary: response.isBinary,
        }, runtimeKey);
      })
      .catch((error) => {
        if (cancelled) return;
        setDiffLoadError(error instanceof Error ? error.message : String(error));
      });

    return () => {
      cancelled = true;
    };
  }, [currentDirectory, diffRetryNonce, getDiff, git, route, setDiff]);

  const handleSyncAction = async (action: Exclude<SyncAction, null>, remote?: GitRemote, forceChoose = false) => {
    if (!currentDirectory) return;
    const recovery = operationRecovery.start();
    if (!recovery) return;
    setSyncAction(action);
    const actionLabel = t(action === 'fetch' ? 'gitView.sync.fetch' : action === 'publish' ? 'gitView.publish.title' : 'gitView.sync.syncChanges');
    try {
      if (action === 'sync' || action === 'publish') {
        const execute = await publishChooser.prepare(action === 'publish' ? 'push' : 'sync', { forceChoose: forceChoose || action === 'publish', onOperation: recovery.onOperation });
        await execute();
      } else if (remote && status) {
        await runBoundGitNetworkOperation({
          action, directory: currentDirectory, remoteName: remote.name, status, sourceControl, git, onOperation: recovery.onOperation,
        });
      } else {
        throw new BoundGitNetworkOperationError('tracking-required');
      }

      if (!recovery.isCurrent()) return;
      if (action === 'fetch' && remote) {
        toast.success(t('gitView.toast.fetchedFromRemote', { name: remote.name }));
      } else if (action === 'sync') {
        toast.success(t('gitView.toast.syncedChanges'));
      } else if (action === 'publish') {
        toast.success(t('gitView.publish.succeeded'));
      }
      await refreshStatusAndBranches(false);
      await refreshRemotes();
    } catch (error) {
      if (error instanceof GitOperationResultError || error instanceof PendingGitOperationError) {
        if (recovery.isCurrent()) await Promise.allSettled([refreshStatusAndBranches(false), refreshRemotes()]);
        return;
      }
      if (error instanceof BoundGitNetworkOperationError && error.code === 'stale-runtime') return;
      if (error instanceof BoundGitNetworkOperationError && publishChooser.errorMessage(error)) {
        toast.info(publishChooser.errorMessage(error));
        return;
      }
      await Promise.allSettled([
        refreshStatusAndBranches(false),
        refreshRemotes(),
      ]);
      toast.error(error instanceof BoundGitNetworkOperationError
        ? error.code === 'contributor-publish-cancelled-after-update'
          ? t('gitView.toast.contributorPublishCancelledAfterUpdate')
          : error.code === 'contributor-publish-cancelled'
            ? t('gitView.toast.contributorPublishCancelled')
            : t('gitView.toast.syncActionFailed', { action: actionLabel })
        : error instanceof Error ? error.message : t('gitView.toast.syncActionFailed', { action: actionLabel }));
    } finally {
      recovery.finish();
      if (recovery.isCurrent()) setSyncAction(null);
    }
  };

  const moveChangePaths = React.useCallback(async (paths: string[], direction: 'stage' | 'unstage') => {
    if (!currentDirectory || paths.length === 0) return;
    try {
      if (direction === 'stage') {
        if (paths.length > 1) await stageGitFiles(currentDirectory, paths);
        else await stageGitFile(currentDirectory, paths[0]);
      } else {
        if (paths.length > 1) await unstageGitFiles(currentDirectory, paths);
        else await unstageGitFile(currentDirectory, paths[0]);
      }
      await refreshStatusAndBranches(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : direction === 'stage'
        ? t('gitView.toast.stageFileFailed')
        : t('gitView.toast.unstageFileFailed'));
    }
  }, [currentDirectory, refreshStatusAndBranches, t]);

  const handleViewChangeDiff = React.useCallback((path: string, staged = false) => {
    setRoute({ type: 'diff', path, staged });
  }, []);

  const handleRevertFile = React.useCallback(async (filePath: string) => {
    if (!currentDirectory) return;
    setRevertingPaths((previous) => new Set(previous).add(filePath));
    try {
      await git.revertGitFile(currentDirectory, filePath);
      toast.success(t('gitView.toast.revertedFile', { path: filePath }));
      await refreshStatusAndBranches(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitView.toast.revertFailed'));
    } finally {
      setRevertingPaths((previous) => {
        const next = new Set(previous);
        next.delete(filePath);
        return next;
      });
    }
  }, [currentDirectory, git, refreshStatusAndBranches, t]);

  const handleRevertAll = React.useCallback(async (paths: string[]) => {
    if (!currentDirectory || paths.length === 0 || isRevertingAll) return;
    const uniquePaths = Array.from(new Set(paths));
    setIsRevertingAll(true);
    setRevertingPaths(new Set(uniquePaths));
    try {
      const result = await settleGitFileReverts(
        uniquePaths,
        (filePath) => git.revertGitFile(currentDirectory, filePath),
      );
      await refreshStatusAndBranches(false);
      if (result.failures.length === 0) {
        toast.success(uniquePaths.length === 1
          ? t('gitView.toast.revertedFilesSingle', { count: uniquePaths.length })
          : t('gitView.toast.revertedFilesPlural', { count: uniquePaths.length }));
      } else if (result.failures.length === uniquePaths.length) {
        toast.error(result.failures[0]?.error?.message ?? t('gitView.toast.revertFailed'));
      } else {
        const successCount = uniquePaths.length - result.failures.length;
        toast.warning(successCount === 1
          ? t('gitView.toast.revertedSomeSingle', { success: successCount, failed: result.failures.length })
          : t('gitView.toast.revertedSomePlural', { success: successCount, failed: result.failures.length }));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitView.toast.revertFailed'));
    } finally {
      setRevertingPaths(new Set());
      setIsRevertingAll(false);
    }
  }, [currentDirectory, git, isRevertingAll, refreshStatusAndBranches, t]);

  const handleInsertHighlights = React.useCallback((highlights: string[]) => {
    const normalized = highlights.map((text) => text.trim()).filter(Boolean);
    if (normalized.length === 0) {
      setGeneratedHighlights([]);
      return;
    }
    setCommitMessage((current) => `${current.trim()}${current.trim() ? '\n\n' : ''}${normalized.join('\n')}`.trim());
    setGeneratedHighlights([]);
  }, []);

  const handleGenerateCommitMessage = React.useCallback(async () => {
    if (!currentDirectory) return;
    const selectedFilePaths = stagedChangeEntries.map((file) => file.path).sort();
    if (selectedFilePaths.length === 0) {
      toast.error(t('gitView.toast.selectFileToDescribe'));
      return;
    }
    setIsGeneratingMessage(true);
    try {
      const { message } = await generateCommitMessage(currentDirectory, selectedFilePaths);
      setCommitMessage(message.subject?.trim() ?? '');
      setGeneratedHighlights(Array.isArray(message.highlights) ? message.highlights : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('gitView.toast.generateCommitMessageFailed'));
    } finally {
      setIsGeneratingMessage(false);
    }
  }, [currentDirectory, stagedChangeEntries, t]);

  const handleCommit = async (options: { pushAfter?: boolean } = {}) => {
    if (!currentDirectory) return;
    if (!commitMessage.trim()) {
      toast.error(t('gitView.toast.enterCommitMessage'));
      return;
    }
    const filesToCommit = stagedChangeEntries.map((file) => file.path).sort();
    if (filesToCommit.length === 0) {
      toast.error(t('gitView.toast.selectFileToCommit'));
      return;
    }

    setCommitAction(options.pushAfter ? 'commitAndPush' : 'commit');
    let recovery: ReturnType<typeof operationRecovery.start> = null;
    let commitOutcome: 'pending' | 'local' | 'published' = 'pending';
    try {
      await git.createGitCommit(currentDirectory, commitMessage.trim(), { files: filesToCommit });
      commitOutcome = 'local';
      toast.success(t('gitView.toast.commitCreated'));
      setCommitMessage('');
      setGeneratedHighlights([]);

      if (options.pushAfter) {
        recovery = operationRecovery.start();
        if (!recovery) {
          toast.warning(t('gitView.publish.commitKept'));
          await Promise.allSettled([refreshStatusAndBranches(false), refreshRemotes()]);
          return;
        }
        recovery.commitCreated();
        const executePush = await publishChooser.prepare('push', { onOperation: recovery.onOperation });
        setSyncAction('publish');
        await executePush();
        commitOutcome = 'published';
        toast.success(t('gitView.publish.succeeded'));

        await refreshStatusAndBranches(false);
        await refreshRemotes();
      } else {
        await refreshStatusAndBranches(false);
      }
    } catch (error) {
      if (options.pushAfter && commitOutcome === 'local') toast.warning(t('gitView.publish.commitKept'));
      if (error instanceof GitOperationResultError || error instanceof PendingGitOperationError) {
        await Promise.allSettled([refreshStatusAndBranches(false), refreshRemotes()]);
        return;
      }
      if (error instanceof BoundGitNetworkOperationError && error.code === 'stale-runtime') return;
      if (error instanceof BoundGitNetworkOperationError && publishChooser.errorMessage(error)) {
        toast.info(publishChooser.errorMessage(error));
        return;
      }
      if (options.pushAfter) {
        await Promise.allSettled([
          refreshStatusAndBranches(false),
          refreshRemotes(),
        ]);
      }
      toast.error(error instanceof BoundGitNetworkOperationError
        ? error.code === 'contributor-publish-cancelled-after-update'
          ? t('gitView.toast.contributorPublishCancelledAfterUpdate')
          : error.code === 'contributor-publish-cancelled'
            ? t('gitView.toast.contributorPublishCancelled')
            : t('gitView.toast.syncActionFailed', { action: t('gitView.sync.syncChanges') })
        : error instanceof Error ? error.message : t('gitView.toast.createCommitFailed'));
    } finally {
      recovery?.finish();
      setCommitAction(null);
      if (options.pushAfter) setSyncAction(null);
    }
  };

  const changeGroups = React.useMemo<ChangesGroupConfig[]>(() => {
    const groups: ChangesGroupConfig[] = [];

    if (stagedChangeEntries.length > 0) {
      groups.push({
        id: 'staged',
        title: t('gitView.changes.stagedTitle'),
        entries: stagedChangeEntries,
        actionSymbol: '-',
        actionAllLabel: t('gitView.changes.unstageAllAria'),
        getActionLabel: (path: string) => t('gitView.changes.unstageFileAria', { path }),
        onActionFile: (path: string) => void moveChangePaths([path], 'unstage'),
        onActionAll: (paths: string[]) => void moveChangePaths(paths, 'unstage'),
        onViewDiff: (path: string) => handleViewChangeDiff(path, true),
        onRevertFile: handleRevertFile,
        showRevertActions: false,
        accent: true,
      });
    }

    if (unstagedChangeEntries.length > 0) {
      groups.push({
        id: 'unstaged',
        title: t('gitView.changes.title'),
        entries: unstagedChangeEntries,
        actionSymbol: '+',
        actionAllLabel: t('gitView.changes.stageAllAria'),
        getActionLabel: (path: string) => t('gitView.changes.stageFileAria', { path }),
        onActionFile: (path: string) => void moveChangePaths([path], 'stage'),
        onActionAll: (paths: string[]) => void moveChangePaths(paths, 'stage'),
        onViewDiff: (path: string) => handleViewChangeDiff(path, false),
        onRevertFile: handleRevertFile,
      });
    }

    return groups;
  }, [handleRevertFile, handleViewChangeDiff, moveChangePaths, stagedChangeEntries, t, unstagedChangeEntries]);

  const networkDialogs = (
    <>
      {publishChooser.context ? <PublishDialog context={publishChooser.context} onSelect={publishChooser.settle} /> : null}
      <ContributorDestinationDialog candidates={contributorDestination.candidates} onSelect={contributorDestination.settle} />
    </>
  );

  const renderListState = (state: React.ReactNode) => (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {networkDialogs}
      <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 px-3 text-foreground">
        {onClose ? (
          <button
            type="button"
            className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="close" className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="typography-ui-label text-foreground">{t('mobile.nav.changes')}</h2>
          <p className="truncate typography-micro text-muted-foreground">
            {status?.current || currentDirectory || ''}
          </p>
        </div>
        {rootIsGitRepo === false && Array.isArray(nestedRepos) && nestedRepos.length > 0 ? (
          <NestedRepoPicker
            repositories={nestedRepos}
            selectedRepository={gitDirectory ?? null}
            onSelectRepository={(repository) => {
              if (rootDirectory) selectNestedRepo(rootDirectory, repository);
            }}
            repositoryRoot={rootDirectory ?? undefined}
          />
        ) : null}
      </header>
      <div className="min-h-0 flex-1">{state}</div>
    </div>
  );

  if (!currentDirectory) {
    return renderListState(<MobileChangesState message={t('gitView.empty.selectSessionOrDirectory')} />);
  }

  // Non-repo root: surface nested-repository resolution while the operating
  // directory has not proven to be a repository (discovering, failed,
  // unsupported, none found, or settling on the auto-selected one).
  if (rootIsGitRepo === false && isGitRepo !== true) {
    return renderListState(
      <NestedRepoResolutionStates
        rootIsGitRepo={rootIsGitRepo}
        resolvedIsGitRepo={isGitRepo}
        nestedRepos={nestedRepos}
        onRetryDiscovery={() => {
          if (rootDirectory) void ensureNestedRepos(rootDirectory, { force: true });
        }}
      />
    );
  }

  if (isLoadingStatus && isGitRepo === null) {
    return renderListState(<MobileChangesState loading message={t('gitView.loading.checkingRepository')} />);
  }

  if (route.type === 'diff') {
    return (
      <MobileDiffDetail
        path={route.path}
        diff={selectedDiff}
        fileExists={Boolean(selectedFileEntry)}
        error={diffLoadError}
        onBack={() => setRoute({ type: 'list' })}
        onRetry={() => setDiffRetryNonce((value) => value + 1)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      {networkDialogs}
      <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-2 px-3 text-foreground">
        {onClose ? (
          <button
            type="button"
            className="-ml-1 flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('mobile.surface.closeAria')}
            onClick={onClose}
            style={{ touchAction: 'manipulation' }}
          >
            <Icon name="close" className="size-5" />
          </button>
        ) : null}
        <div className="min-w-0 flex-1 px-1">
          <h2 className="typography-ui-label text-foreground">{t('mobile.nav.changes')}</h2>
          <BranchSelector
            currentBranch={status?.current}
            localBranches={localBranches}
            remoteBranches={remoteBranches}
            branchInfo={branches?.branches}
            currentBranchAhead={status?.ahead}
            onCheckout={(branch) => void handleCheckoutBranch(branch)}
            onCreate={handleCreateBranch}
            disabled={isLoadingStatus}
            directory={currentDirectory}
            switchBlockedNotice={(status?.files?.length ?? 0) > 0 ? t('gitView.branch.switchBlockedNotice') : null}
          />
        </div>
        {/* The identity names the whole configuration this repository acts as,
            and is the way into what it does not carry. */}
        <IdentityDropdown
          activeProfile={activeIdentityProfile}
          identities={availableIdentities}
          // On a phone the branch, the identity and the sync action cannot all
          // carry text: a name truncated to "system i…" tells nobody anything,
          // so below the small breakpoint the identity keeps its icon and the
          // branch keeps its name. The menu names it in full either way.
          triggerClassName="max-w-[10rem] shrink [&_.git-identity-label]:hidden sm:[&_.git-identity-label]:inline"
          onOpen={() => void refreshIdentityAccounts(sourceControl, gitIdentityProfiles.map((profile) => profile.account))}
          onSelect={(profile) => void handleApplyIdentity(profile)}
          isApplying={isApplyingIdentity}
          onConfigure={() => setRepositoryConfigurationOpen(true)}
          applicability={(identity) => {
            const url = effectiveRemotes[0]?.fetchUrl ?? '';
            return url ? identityApplicability(identity, remoteTraits(url)) : { applicable: true };
          }}
        />
        <SyncActions
          syncAction={operationRecovery.entry?.executing ? syncAction : null}
          remotes={effectiveRemotes}
          onFetch={(remote) => void handleSyncAction('fetch', remote)}
          onSync={(remote) => void handleSyncAction('sync', remote)}
          onPublish={() => void handleSyncAction('publish')}
          onChooseSyncTargets={() => void handleSyncAction('sync', undefined, true)}
          currentBranch={status?.current}
          hasTracking={Boolean(status?.tracking)}
          disabled={isLoadingStatus || operationRecovery.blocked}
          aheadCount={status?.ahead ?? 0}
          behindCount={status?.behind ?? 0}
          trackingRemoteName={status?.tracking?.split('/')[0]}
          hasUncommittedChanges={changeEntries.length > 0}
        />
      </header>
      <SystemIdentityConfirmDialog
        open={pendingSystemIdentity !== null}
        onCancel={() => setPendingSystemIdentity(null)}
        onConfirm={() => {
          const profile = pendingSystemIdentity;
          setPendingSystemIdentity(null);
          if (profile) void applyIdentity(profile, true);
        }}
      />
      <RepositoryConfigurationDialog
        open={isRepositoryConfigurationOpen}
        onOpenChange={setRepositoryConfigurationOpen}
        directory={currentDirectory}
      />
      <GitOperationStatus className="mx-3 mt-3" entry={operationRecovery.entry} onRefresh={() => void operationRecovery.refresh()} onCancel={() => void operationRecovery.cancel()} />
      {changeEntries.length > 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* File list scrolls inside ChangesPanel; the commit footer stays pinned. */}
          <div className="min-h-0 flex-1 overflow-hidden px-4 pt-4">
            <ChangesPanel
              groups={changeGroups}
              diffStats={status?.diffStats}
              revertingPaths={revertingPaths}
              onRevertAll={handleRevertAll}
              isRevertingAll={isRevertingAll}
              headerBackgroundClassName="bg-transparent"
              onVisiblePathsChange={setVisibleChangePaths}
            />
          </div>
          <div className="shrink-0 border-t border-border/70 px-4 pb-4 pt-3">
            <CommitSection
              stagedCount={stagedChangeEntries.length}
              commitMessage={commitMessage}
              onCommitMessageChange={setCommitMessage}
              generatedHighlights={generatedHighlights}
              onInsertHighlights={handleInsertHighlights}
              onGenerateMessage={handleGenerateCommitMessage}
              isGeneratingMessage={isGeneratingMessage}
              onCommit={() => void handleCommit({ pushAfter: false })}
              onCommitAndPush={() => void handleCommit({ pushAfter: true })}
              commitAction={commitAction}
              networkOperationBlocked={operationRecovery.blocked}
              gitmojiEnabled={false}
              onOpenGitmojiPicker={() => {}}
            />
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1">
          <MobileChangesState icon message={t('gitView.empty.cleanTitle')} description={t('mobile.changes.cleanDescription')} />
        </div>
      )}
      <DirtyBranchSwitchDialog
        open={pendingDirtySwitchBranch !== null}
        onOpenChange={(open) => { if (!open) setPendingDirtySwitchBranch(null); }}
        targetBranch={pendingDirtySwitchBranch ?? ''}
        changedFileCount={status?.files?.length ?? 0}
        onCommitAndSwitch={async (message, pushAfter) => {
          const branch = pendingDirtySwitchBranch;
          if (!branch || !currentDirectory) return;
          const sourceBranch = status?.current ?? null;
          await git.createGitCommit(currentDirectory, message, { addAll: true });
          let pushedRemoteName: string | null = null;
          if (pushAfter) {
            const trackingRemoteName = status?.tracking?.split('/')[0];
            const remote = effectiveRemotes.find((entry) => entry.name === trackingRemoteName) ?? effectiveRemotes[0];
            try {
              if (!remote) throw new Error(t('mobile.changes.noRemote'));
              await git.gitPush(currentDirectory, status?.tracking
                ? { remote: remote.name }
                : { remote: remote.name, branch: sourceBranch ?? undefined, options: ['--set-upstream'] });
              pushedRemoteName = remote.name;
            } catch {
              toast.error(t('gitView.dirtySwitch.pushFailed'));
              await refreshStatusAndBranches();
              setPendingDirtySwitchBranch(null);
              return;
            }
          }
          toast.success(sourceBranch
            ? pushedRemoteName
              ? t('gitView.toast.pushedToUpstream', { name: pushedRemoteName })
              : t('gitView.dirtySwitch.committedNotPushed', { branch: sourceBranch })
            : t('gitView.toast.commitCreated'));
          await refreshStatusAndBranches();
          setPendingDirtySwitchBranch(null);
          await performCheckout(branch);
        }}
        onGenerateMessage={async () => {
          if (!currentDirectory) return '';
          const paths = (status?.files ?? []).map((file) => file.path).sort();
          const { message } = await generateCommitMessage(currentDirectory, paths);
          return message.subject?.trim() ?? '';
        }}
        onRevertAndSwitch={async () => {
          const branch = pendingDirtySwitchBranch;
          if (!branch || !currentDirectory) return;
          await handleRevertAll((status?.files ?? []).map((file) => file.path));
          const fresh = await git.getGitStatus(currentDirectory);
          if (!fresh.isClean && (fresh.files?.length ?? 0) > 0) {
            toast.error(t('gitView.dirtySwitch.revertIncomplete'));
            return;
          }
          setPendingDirtySwitchBranch(null);
          await performCheckout(branch);
        }}
      />
    </div>
  );
};

const MobileChangesState: React.FC<{
  message: string;
  description?: string;
  loading?: boolean;
  icon?: boolean;
}> = ({ message, description, loading = false, icon = false }) => (
  <div className="flex h-full items-center justify-center px-6 text-center">
    <div className="flex max-w-sm flex-col items-center gap-2">
      {loading ? <Icon name="loader-4" className="size-5 animate-spin text-muted-foreground" /> : null}
      {icon ? <Icon name="git-branch" className="size-6 text-muted-foreground" /> : null}
      <p className="typography-ui-label font-semibold text-foreground">{message}</p>
      {description ? <p className="typography-meta text-muted-foreground">{description}</p> : null}
    </div>
  </div>
);

const MobileDiffDetail: React.FC<{
  path: string;
  diff: { original: string; modified: string; isBinary?: boolean } | null;
  fileExists: boolean;
  error: string | null;
  onBack: () => void;
  onRetry: () => void;
}> = ({ path, diff, fileExists, error, onBack, onRetry }) => {
  const { t } = useI18n();
  const language = React.useMemo(() => getLanguageFromExtension(path) || 'text', [path]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-[var(--oc-header-height,56px)] shrink-0 items-center gap-3 border-b border-border/70 px-3 text-foreground">
        <button
          type="button"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('header.actions.backAria')}
          onClick={onBack}
        >
          <Icon name="arrow-left" className="size-5" />
        </button>
        <div className="min-w-0 flex-1 px-2">
          <h2 className="truncate typography-ui-header text-foreground">{path}</h2>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden">
        {!fileExists ? (
          <MobileChangesState icon message={t('mobile.changes.diffDetail.missingTitle')} description={t('mobile.changes.diffDetail.missingDescription')} />
        ) : error ? (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="flex max-w-sm flex-col items-center gap-3">
              <p className="typography-ui-label font-semibold text-foreground">{t('mobile.changes.diffDetail.loadFailed')}</p>
              <p className="typography-meta text-muted-foreground">{error}</p>
              <Button type="button" size="sm" variant="outline" onClick={onRetry}>{t('diffView.actions.retry')}</Button>
            </div>
          </div>
        ) : !diff ? (
          <MobileChangesState loading message={t('diffView.state.loadingDiff')} />
        ) : diff.isBinary ? (
          <MobileChangesState icon message={t('diffView.binary.unavailable')} />
        ) : isImageFile(path) ? (
          <MobileChangesState icon message={t('mobile.changes.diffDetail.imageUnavailable')} />
        ) : (
          <ScrollShadow
            className="h-full overflow-y-auto overflow-x-hidden p-3"
            data-diff-virtual-root
            data-diff-virtual-content
          >
            <PierreDiffViewer
              original={diff.original}
              modified={diff.modified}
              language={language}
              fileName={path}
              renderSideBySide={false}
              wrapLines={true}
              layout="inline"
            />
          </ScrollShadow>
        )}
      </div>
    </div>
  );
};
