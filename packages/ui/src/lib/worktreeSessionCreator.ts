/**
 * Utility for creating a new session with an auto-generated worktree.
 * This is a standalone function that can be called from keyboard shortcuts,
 * menu actions, or other non-hook contexts.
 */

import { toast } from '@/components/ui';
import { useSessionStore } from '@/stores/useSessionStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { useConfigStore } from '@/stores/useConfigStore';
import { useContextStore } from '@/stores/contextStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { checkIsGitRepository } from '@/lib/gitApi';
import { generateBranchName } from '@/lib/git/branchNameGenerator';
import { getRootBranch, getWorktreeStatus } from '@/lib/worktrees/worktreeStatus';
import { getWorktreeSetupCommands } from '@/lib/openchamberConfig';
import {
  removeProjectWorktree,
  type ProjectRef,
} from '@/lib/worktrees/worktreeManager';
import { createWorktreeWithDefaults } from '@/lib/worktrees/worktreeCreate';
import { startConfigUpdate, finishConfigUpdate } from '@/lib/configUpdate';

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/\/+$/, '') || value;

const resolveProjectRef = (directory: string): ProjectRef | null => {
  const normalized = normalizePath(directory);
  const projects = useProjectsStore.getState().projects;
  if (projects.length === 0) {
    return null;
  }

  const activeProject = useProjectsStore.getState().getActiveProject();
  if (activeProject?.path) {
    const activePath = normalizePath(activeProject.path);
    if (normalized === activePath || normalized.startsWith(`${activePath}/`)) {
      return { id: activeProject.id, path: activeProject.path };
    }
  }

  const matches = projects.filter((project) => {
    const projectPath = normalizePath(project.path);
    return normalized === projectPath || normalized.startsWith(`${projectPath}/`);
  });

  const match = matches.sort((a, b) => normalizePath(b.path).length - normalizePath(a.path).length)[0];

  return match ? { id: match.id, path: match.path } : null;
};

// Track if we're currently creating a worktree session
let isCreatingWorktreeSession = false;

/**
 * Create a new session with an auto-generated worktree.
 * Uses project's worktree defaults for naming/metadata.
 * 
 * @returns The created session, or null if creation failed
 */
export async function createWorktreeSession(): Promise<{ id: string } | null> {
  if (isCreatingWorktreeSession) {
    return null;
  }

  const activeProject = useProjectsStore.getState().getActiveProject();
  if (!activeProject?.path) {
    toast.error('No active project', {
      description: 'Please select a project first.',
    });
    return null;
  }

  const projectDirectory = activeProject.path;

  // Check if it's a git repo
  let isGitRepo = false;
  try {
    isGitRepo = await checkIsGitRepository(projectDirectory);
  } catch {
    // Ignore errors, treat as not a git repo
  }

  if (!isGitRepo) {
    toast.error('Not a Git repository', {
      description: 'Worktrees can only be created in Git repositories.',
    });
    return null;
  }

  isCreatingWorktreeSession = true;
  startConfigUpdate("Creating new worktree session...");

  try {
    const projectRef: ProjectRef = { id: activeProject.id, path: projectDirectory };

    // Generate a friendly name (SDK will slugify + ensure uniqueness).
    const preferredName = generateBranchName();

    const setupCommands = await getWorktreeSetupCommands(projectRef);
    const rootBranch = await getRootBranch(projectRef.path);
    const metadata = await createWorktreeWithDefaults(projectRef, {
      preferredName,
      mode: 'new',
      branchName: preferredName,
      worktreeName: preferredName,
      setupCommands,
    });

    const createdMetadata = {
      ...metadata,
      createdFromBranch: rootBranch,
      kind: 'standard' as const,
    };

    // Get worktree status
    const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
    const createdMetadataWithStatus = status ? { ...createdMetadata, status } : createdMetadata;

    // Create the session
    const sessionStore = useSessionStore.getState();
    const session = await sessionStore.createSession(undefined, metadata.path);
    if (!session) {
      // Clean up the worktree if session creation failed
      await removeProjectWorktree(projectRef, metadata, { deleteLocalBranch: true }).catch(() => undefined);
      toast.error('Failed to create session', {
        description: 'Could not create a session for the worktree.',
      });
      return null;
    }

    // Initialize the session
    const configState = useConfigStore.getState();
    const agents = configState.agents;
    sessionStore.initializeNewOpenChamberSession(session.id, agents);
    sessionStore.setSessionDirectory(session.id, metadata.path);
    sessionStore.setWorktreeMetadata(session.id, createdMetadataWithStatus);

    // Apply default agent and model settings
    try {
      const visibleAgents = configState.getVisibleAgents();
      let agentName: string | undefined;

      // Priority: settingsDefaultAgent → build → first visible
      if (configState.settingsDefaultAgent) {
        const settingsAgent = visibleAgents.find((a) => a.name === configState.settingsDefaultAgent);
        if (settingsAgent) {
          agentName = settingsAgent.name;
        }
      }
      if (!agentName) {
        agentName =
          visibleAgents.find((agent) => agent.name === 'build')?.name ||
          visibleAgents[0]?.name;
      }

      if (agentName) {
        // 1. Update global UI state
        configState.setAgent(agentName);

        // 2. Persist to session context so it sticks after reload/switch
        useContextStore.getState().saveSessionAgentSelection(session.id, agentName);

        // 3. Handle default model for the agent if set in global settings
        const settingsDefaultModel = configState.settingsDefaultModel;
        if (settingsDefaultModel) {
          const parts = settingsDefaultModel.split('/');
          if (parts.length === 2) {
            const [providerId, modelId] = parts;
            // Validate model exists (optional, but good practice)
            const modelMetadata = configState.getModelMetadata(providerId, modelId);
            if (modelMetadata) {
              useContextStore.getState().saveSessionModelSelection(session.id, providerId, modelId);
              // Also save the specific agent's model preference for this session
              useContextStore.getState().saveAgentModelForSession(session.id, agentName, providerId, modelId);

              // Seed default variant into session context so ModelControls restore logic
              // doesn't wipe it on first switch to the new session.
              const settingsDefaultVariant = configState.settingsDefaultVariant;
              if (settingsDefaultVariant) {
                const provider = configState.providers.find((p) => p.id === providerId);
                const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === modelId) as
                  | { variants?: Record<string, unknown> }
                  | undefined;
                const variants = model?.variants;

                if (variants && Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) {
                  configState.setCurrentVariant(settingsDefaultVariant);
                  useContextStore
                    .getState()
                    .saveAgentModelVariantForSession(session.id, agentName, providerId, modelId, settingsDefaultVariant);
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors setting default agent
    }

    // Update directory
    useDirectoryStore.getState().setDirectory(metadata.path, { showOverlay: false });

    // Refresh sessions list
    try {
      await sessionStore.loadSessions();
    } catch {
      // Ignore
    }

    toast.success('Worktree created', {
      description: metadata.branch ? `Branch: ${metadata.branch}` : 'Ready',
    });

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree session';
    toast.error('Failed to create worktree', {
      description: message,
    });
    return null;
  } finally {
    finishConfigUpdate();
    isCreatingWorktreeSession = false;
  }
}

/**
 * Check if a worktree session is currently being created.
 */
export function isCreatingWorktree(): boolean {
  return isCreatingWorktreeSession;
}

export async function createWorktreeOnly(): Promise<string | null> {
  if (isCreatingWorktreeSession) {
    return null;
  }

  const activeProject = useProjectsStore.getState().getActiveProject();
  if (!activeProject?.path) {
    toast.error('No active project', {
      description: 'Please select a project first.',
    });
    return null;
  }

  const projectDirectory = activeProject.path;
  let isGitRepo = false;
  try {
    isGitRepo = await checkIsGitRepository(projectDirectory);
  } catch {
    // ignored
  }

  if (!isGitRepo) {
    toast.error('Not a Git repository', {
      description: 'Worktrees can only be created in Git repositories.',
    });
    return null;
  }

  isCreatingWorktreeSession = true;
  startConfigUpdate('Creating new worktree...');

  try {
    const projectRef: ProjectRef = { id: activeProject.id, path: projectDirectory };
    const preferredName = generateBranchName();
    const setupCommands = await getWorktreeSetupCommands(projectRef);
    const metadata = await createWorktreeWithDefaults(projectRef, {
      preferredName,
      mode: 'new',
      branchName: preferredName,
      worktreeName: preferredName,
      setupCommands,
    });

    const rootBranch = await getRootBranch(projectRef.path).catch(() => undefined);
    const status = await getWorktreeStatus(metadata.path).catch(() => undefined);

    const branchLabel = metadata.branch || metadata.label || metadata.name;
    toast.success('Worktree created', {
      description: branchLabel
        ? `${branchLabel}${rootBranch ? ` from ${rootBranch}` : ''}`
        : status?.isDirty ? 'Created (dirty)' : 'Ready',
    });

    await useSessionStore.getState().loadSessions();
    return metadata.path;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree';
    toast.error('Failed to create worktree', {
      description: message,
    });
    return null;
  } finally {
    finishConfigUpdate();
    isCreatingWorktreeSession = false;
  }
}

/**
 * Create a new session with a worktree for a specific branch.
 * Unlike createWorktreeSession(), this allows specifying the project and branch explicitly.
 * 
 * @param projectDirectory - The root directory of the git repository
 * @param branchName - The name of the branch to create a worktree for
 * @returns The created session, or null if creation failed
 */
export async function createWorktreeSessionForBranch(
  projectDirectory: string,
  branchName: string,
  options?: {
    kind?: 'pr' | 'standard';
    existingBranch?: string;
    worktreeName?: string;
    setUpstream?: boolean;
    upstreamRemote?: string;
    upstreamBranch?: string;
    ensureRemoteName?: string;
    ensureRemoteUrl?: string;
    createdFromBranch?: string;
  }
): Promise<{ id: string } | null> {
  if (isCreatingWorktreeSession) {
    return null;
  }

  isCreatingWorktreeSession = true;
  startConfigUpdate("Creating worktree session...");

  try {
    const projectRef = resolveProjectRef(projectDirectory);
    if (!projectRef) {
      throw new Error('Project is not registered in OpenChamber');
    }

    // Check if it's a git repo (root project path)
    let isGitRepo = false;
    try {
      isGitRepo = await checkIsGitRepository(projectRef.path);
    } catch {
      // Ignore errors, treat as not a git repo
    }

    if (!isGitRepo) {
      toast.error('Not a Git repository', {
        description: 'Worktrees can only be created in Git repositories.',
      });
      return null;
    }

    const setupCommands = await getWorktreeSetupCommands(projectRef);
    const rootBranch = await getRootBranch(projectRef.path);
    const metadata = await createWorktreeWithDefaults(projectRef, {
      preferredName: branchName,
      mode: 'existing',
      existingBranch: options?.existingBranch || branchName,
      branchName,
      worktreeName: options?.worktreeName || branchName,
      setUpstream: options?.setUpstream,
      upstreamRemote: options?.upstreamRemote,
      upstreamBranch: options?.upstreamBranch,
      ensureRemoteName: options?.ensureRemoteName,
      ensureRemoteUrl: options?.ensureRemoteUrl,
      setupCommands,
    });

    const kind = options?.kind ?? 'standard';
    const createdMetadata = {
      ...metadata,
      createdFromBranch: options?.createdFromBranch || rootBranch,
      kind,
    };

    // Get worktree status
    const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
    const createdMetadataWithStatus = status ? { ...createdMetadata, status } : createdMetadata;

    // Create the session
    const sessionStore = useSessionStore.getState();
    const session = await sessionStore.createSession(undefined, metadata.path);
    if (!session) {
      // Clean up the worktree if session creation failed
      await removeProjectWorktree(projectRef, metadata, { deleteLocalBranch: true }).catch(() => undefined);
      toast.error('Failed to create session', {
        description: 'Could not create a session for the worktree.',
      });
      return null;
    }

    // Initialize the session
    const configState = useConfigStore.getState();
    const agents = configState.agents;
    sessionStore.initializeNewOpenChamberSession(session.id, agents);
    sessionStore.setSessionDirectory(session.id, metadata.path);
    sessionStore.setWorktreeMetadata(session.id, createdMetadataWithStatus);

    // Apply default agent and model settings
    try {
      const visibleAgents = configState.getVisibleAgents();
      let agentName: string | undefined;

      // Priority: settingsDefaultAgent → build → first visible
      if (configState.settingsDefaultAgent) {
        const settingsAgent = visibleAgents.find((a) => a.name === configState.settingsDefaultAgent);
        if (settingsAgent) {
          agentName = settingsAgent.name;
        }
      }
      if (!agentName) {
        agentName =
          visibleAgents.find((agent) => agent.name === 'build')?.name ||
          visibleAgents[0]?.name;
      }

      if (agentName) {
        // 1. Update global UI state
        configState.setAgent(agentName);

        // 2. Persist to session context so it sticks after reload/switch
        useContextStore.getState().saveSessionAgentSelection(session.id, agentName);

        // 3. Handle default model for the agent if set in global settings
        const settingsDefaultModel = configState.settingsDefaultModel;
        if (settingsDefaultModel) {
          const parts = settingsDefaultModel.split('/');
          if (parts.length === 2) {
            const [providerId, modelId] = parts;
            // Validate model exists (optional, but good practice)
            const modelMetadata = configState.getModelMetadata(providerId, modelId);
            if (modelMetadata) {
              useContextStore.getState().saveSessionModelSelection(session.id, providerId, modelId);
              // Also save the specific agent's model preference for this session
              useContextStore.getState().saveAgentModelForSession(session.id, agentName, providerId, modelId);

              // Seed default variant into session context so ModelControls restore logic
              // doesn't wipe it on first switch to the new session.
              const settingsDefaultVariant = configState.settingsDefaultVariant;
              if (settingsDefaultVariant) {
                const provider = configState.providers.find((p) => p.id === providerId);
                const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === modelId) as
                  | { variants?: Record<string, unknown> }
                  | undefined;
                const variants = model?.variants;

                if (variants && Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) {
                  configState.setCurrentVariant(settingsDefaultVariant);
                  useContextStore
                    .getState()
                    .saveAgentModelVariantForSession(session.id, agentName, providerId, modelId, settingsDefaultVariant);
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore errors setting default agent
    }

    // Update directory
    useDirectoryStore.getState().setDirectory(metadata.path, { showOverlay: false });

    // Refresh sessions list
    try {
      await sessionStore.loadSessions();
    } catch {
      // Ignore
    }

    toast.success('Worktree created', {
      description: metadata.branch ? `Branch: ${metadata.branch}` : 'Ready',
    });

    return session;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create worktree session';
    toast.error('Failed to create worktree', {
      description: message,
    });
    return null;
  } finally {
    finishConfigUpdate();
    isCreatingWorktreeSession = false;
  }
}

/**
 * Create a worktree session for a new branch name.
 * Callers can still use startPoint for metadata or follow-up git operations.
 */
export async function createWorktreeSessionForNewBranch(
  projectDirectory: string,
  preferredBranchName: string,
  startPoint?: string,
  options?: {
    kind?: 'pr' | 'standard';
    worktreeName?: string;
    setUpstream?: boolean;
    upstreamRemote?: string;
    upstreamBranch?: string;
    ensureRemoteName?: string;
    ensureRemoteUrl?: string;
    createdFromBranch?: string;
  }
): Promise<{ id: string; branch: string } | null> {
  if (isCreatingWorktreeSession) {
    return null;
  }

  isCreatingWorktreeSession = true;
  startConfigUpdate('Creating worktree session...');

  try {
    const start = startPoint?.trim() || 'HEAD';
    const base = preferredBranchName?.trim();
    if (!base) {
      throw new Error('Branch name is required');
    }

    const kind = options?.kind ?? 'standard';

    const projectRef = resolveProjectRef(projectDirectory);
    if (!projectRef) {
      throw new Error('Project is not registered in OpenChamber');
    }

    let isGitRepo = false;
    try {
      isGitRepo = await checkIsGitRepository(projectRef.path);
    } catch {
      // ignore
    }

    if (!isGitRepo) {
      toast.error('Not a Git repository', {
        description: 'Worktrees can only be created in Git repositories.',
      });
      return null;
    }

    const setupCommands = await getWorktreeSetupCommands(projectRef);
    const rootBranch = await getRootBranch(projectRef.path);
    try {
      const metadata = await createWorktreeWithDefaults(projectRef, {
        preferredName: base,
        mode: 'new',
        branchName: base,
        worktreeName: options?.worktreeName || base,
        startRef: start,
        setUpstream: options?.setUpstream,
        upstreamRemote: options?.upstreamRemote,
        upstreamBranch: options?.upstreamBranch,
        ensureRemoteName: options?.ensureRemoteName,
        ensureRemoteUrl: options?.ensureRemoteUrl,
        setupCommands,
      });
      const createdMetadata = {
        ...metadata,
        createdFromBranch: options?.createdFromBranch || rootBranch || start,
        kind,
      };

        const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
        const createdMetadataWithStatus = status ? { ...createdMetadata, status } : createdMetadata;

        const sessionStore = useSessionStore.getState();
        const session = await sessionStore.createSession(undefined, metadata.path);
        if (!session) {
          await removeProjectWorktree(projectRef, metadata, { deleteLocalBranch: true }).catch(() => undefined);
          throw new Error('Could not create a session for the worktree.');
        }

        const configState = useConfigStore.getState();
        sessionStore.initializeNewOpenChamberSession(session.id, configState.agents);
        sessionStore.setSessionDirectory(session.id, metadata.path);
        sessionStore.setWorktreeMetadata(session.id, createdMetadataWithStatus);

        // Apply default agent/model/variant settings (reuse same logic as createWorktreeSessionForBranch)
        try {
          const visibleAgents = configState.getVisibleAgents();
          let agentName: string | undefined;
          if (configState.settingsDefaultAgent) {
            const settingsAgent = visibleAgents.find((a) => a.name === configState.settingsDefaultAgent);
            if (settingsAgent) {
              agentName = settingsAgent.name;
            }
          }
          if (!agentName) {
            agentName =
              visibleAgents.find((agent) => agent.name === 'build')?.name ||
              visibleAgents[0]?.name;
          }

          if (agentName) {
            configState.setAgent(agentName);
            useContextStore.getState().saveSessionAgentSelection(session.id, agentName);

            const settingsDefaultModel = configState.settingsDefaultModel;
            if (settingsDefaultModel) {
              const parts = settingsDefaultModel.split('/');
              if (parts.length === 2) {
                const [providerId, modelId] = parts;
                const modelMetadata = configState.getModelMetadata(providerId, modelId);
                if (modelMetadata) {
                  useContextStore.getState().saveSessionModelSelection(session.id, providerId, modelId);
                  useContextStore.getState().saveAgentModelForSession(session.id, agentName, providerId, modelId);

                  const settingsDefaultVariant = configState.settingsDefaultVariant;
                  if (settingsDefaultVariant) {
                    const provider = configState.providers.find((p) => p.id === providerId);
                    const model = provider?.models.find((m: Record<string, unknown>) => (m as { id?: string }).id === modelId) as
                      | { variants?: Record<string, unknown> }
                      | undefined;
                    const variants = model?.variants;
                    if (variants && Object.prototype.hasOwnProperty.call(variants, settingsDefaultVariant)) {
                      configState.setCurrentVariant(settingsDefaultVariant);
                      useContextStore
                        .getState()
                        .saveAgentModelVariantForSession(session.id, agentName, providerId, modelId, settingsDefaultVariant);
                    }
                  }
                }
              }
            }
          }
        } catch {
          // ignore
        }

        useDirectoryStore.getState().setDirectory(metadata.path, { showOverlay: false });
        try {
          await sessionStore.loadSessions();
        } catch {
          // ignore
        }

        toast.success('Worktree created', {
          description: metadata.branch ? `Branch: ${metadata.branch}` : 'Ready',
        });

        return { id: session.id, branch: metadata.branch || base };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create worktree session';
      toast.error('Failed to create worktree', { description: message });
      return null;
    }
  } finally {
    finishConfigUpdate();
    isCreatingWorktreeSession = false;
  }
}

/**
 * Same as createWorktreeSessionForNewBranch, but preserves the exact branch name.
 * Use when the worktree must be tied to a specific ref (e.g. PR head ref).
 */
export async function createWorktreeSessionForNewBranchExact(
  projectDirectory: string,
  branchName: string,
  startPoint: string,
  options?: {
    kind?: 'pr' | 'standard';
    worktreeName?: string;
    setUpstream?: boolean;
    upstreamRemote?: string;
    upstreamBranch?: string;
    ensureRemoteName?: string;
    ensureRemoteUrl?: string;
    createdFromBranch?: string;
  }
): Promise<{ id: string; branch: string } | null> {
  return createWorktreeSessionForNewBranch(projectDirectory, branchName, startPoint, {
    kind: options?.kind,
    worktreeName: options?.worktreeName,
    setUpstream: options?.setUpstream,
    upstreamRemote: options?.upstreamRemote,
    upstreamBranch: options?.upstreamBranch,
    ensureRemoteName: options?.ensureRemoteName,
    ensureRemoteUrl: options?.ensureRemoteUrl,
    createdFromBranch: options?.createdFromBranch,
  });
}
