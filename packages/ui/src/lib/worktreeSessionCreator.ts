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
import { generateUniqueBranchName } from '@/lib/git/branchNameGenerator';
import {
  createWorktree,
  getWorktreeStatus,
  removeWorktree,
  runWorktreeSetupCommands,
} from '@/lib/git/worktreeService';
import { getWorktreeSetupCommands } from '@/lib/openchamberConfig';
import { startConfigUpdate, finishConfigUpdate } from '@/lib/configUpdate';

const sanitizeWorktreeSlug = (value: string): string => {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 120);
};

// Track if we're currently creating a worktree session
let isCreatingWorktreeSession = false;

/**
 * Create a new session with an auto-generated worktree.
 * Uses project's worktree defaults (branch prefix, base branch) from settings.
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
    // Get worktree defaults from project settings
    const worktreeDefaults = activeProject.worktreeDefaults;
    const branchPrefix = worktreeDefaults?.branchPrefix;
    const baseBranch = worktreeDefaults?.baseBranch;

    // Generate a unique branch name
    const branchName = await generateUniqueBranchName(projectDirectory, branchPrefix);
    if (!branchName) {
      toast.error('Failed to generate branch name', {
        description: 'Could not generate a unique branch name. Please try again.',
      });
      return null;
    }

    const worktreeSlug = sanitizeWorktreeSlug(branchName);

    // Determine start point (base branch)
    const startPoint = baseBranch && baseBranch !== 'HEAD' ? baseBranch : undefined;

    // Create the worktree
    const metadata = await createWorktree({
      projectDirectory,
      worktreeSlug,
      branch: branchName,
      createBranch: true,
      startPoint,
    });

    // Get worktree status
    const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
    const createdMetadata = status ? { ...metadata, status } : metadata;

    // Create the session
    const sessionStore = useSessionStore.getState();
    const session = await sessionStore.createSession(undefined, metadata.path);
    if (!session) {
      // Clean up the worktree if session creation failed
      await removeWorktree({ projectDirectory, path: metadata.path, force: true }).catch(() => undefined);
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
    sessionStore.setWorktreeMetadata(session.id, createdMetadata);

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

    // Get and run setup commands
    const setupCommands = await getWorktreeSetupCommands(projectDirectory);
    const commandsToRun = setupCommands.filter(cmd => cmd.trim().length > 0);

    if (commandsToRun.length > 0) {
      toast.success('Worktree created', {
        description: `Branch: ${branchName}. Running ${commandsToRun.length} setup command${commandsToRun.length === 1 ? '' : 's'}...`,
      });

      // Run setup commands in background
      runWorktreeSetupCommands(metadata.path, projectDirectory, commandsToRun).then((result) => {
        if (result.success) {
          toast.success('Setup commands completed', {
            description: `All ${result.results.length} command${result.results.length === 1 ? '' : 's'} succeeded.`,
          });
        } else {
          const failed = result.results.filter(r => !r.success);
          const succeeded = result.results.filter(r => r.success);
          toast.error('Setup commands failed', {
            description: `${failed.length} of ${result.results.length} command${result.results.length === 1 ? '' : 's'} failed.` +
              (succeeded.length > 0 ? ` ${succeeded.length} succeeded.` : ''),
          });
        }
      }).catch(() => {
        toast.error('Setup commands failed', {
          description: 'Could not execute setup commands.',
        });
      });
    } else {
      toast.success('Worktree created', {
        description: `Branch: ${branchName}`,
      });
    }

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
  branchName: string
): Promise<{ id: string } | null> {
  if (isCreatingWorktreeSession) {
    return null;
  }

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
  startConfigUpdate("Creating worktree session...");

  try {
    // Use the branch name as the worktree slug (sanitized)
    const worktreeSlug = sanitizeWorktreeSlug(branchName);

    // Create the worktree - don't create a new branch, use existing one
    const metadata = await createWorktree({
      projectDirectory,
      worktreeSlug,
      branch: branchName,
      createBranch: false, // Use existing branch
    });

    // Get worktree status
    const status = await getWorktreeStatus(metadata.path).catch(() => undefined);
    const createdMetadata = status ? { ...metadata, status } : metadata;

    // Create the session
    const sessionStore = useSessionStore.getState();
    const session = await sessionStore.createSession(undefined, metadata.path);
    if (!session) {
      // Clean up the worktree if session creation failed
      await removeWorktree({ projectDirectory, path: metadata.path, force: true }).catch(() => undefined);
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
    sessionStore.setWorktreeMetadata(session.id, createdMetadata);

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

    // Get and run setup commands
    const setupCommands = await getWorktreeSetupCommands(projectDirectory);
    const commandsToRun = setupCommands.filter(cmd => cmd.trim().length > 0);

    if (commandsToRun.length > 0) {
      toast.success('Worktree created', {
        description: `Branch: ${branchName}. Running ${commandsToRun.length} setup command${commandsToRun.length === 1 ? '' : 's'}...`,
      });

      // Run setup commands in background
      runWorktreeSetupCommands(metadata.path, projectDirectory, commandsToRun).then((result) => {
        if (result.success) {
          toast.success('Setup commands completed', {
            description: `All ${result.results.length} command${result.results.length === 1 ? '' : 's'} succeeded.`,
          });
        } else {
          const failed = result.results.filter(r => !r.success);
          const succeeded = result.results.filter(r => r.success);
          toast.error('Setup commands failed', {
            description: `${failed.length} of ${result.results.length} command${result.results.length === 1 ? '' : 's'} failed.` +
              (succeeded.length > 0 ? ` ${succeeded.length} succeeded.` : ''),
          });
        }
      }).catch(() => {
        toast.error('Setup commands failed', {
          description: 'Could not execute setup commands.',
        });
      });
    } else {
      toast.success('Worktree created', {
        description: `Branch: ${branchName}`,
      });
    }

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
