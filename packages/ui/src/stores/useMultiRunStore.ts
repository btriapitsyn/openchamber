import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { CreateMultiRunParams, CreateMultiRunResult } from '@/types/multirun';
import { opencodeClient } from '@/lib/opencode/client';
import { createWorktree } from '@/lib/git/worktreeService';
import { checkIsGitRepository } from '@/lib/gitApi';
import { useSessionStore } from './sessionStore';
import { useDirectoryStore } from './useDirectoryStore';
import { useProjectsStore } from './useProjectsStore';

/**
 * Generate a git-safe slug from a string.
 */
const toGitSafeSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
};

/**
 * Generate a model slug from provider and model IDs.
 */
const toModelSlug = (providerID: string, modelID: string): string => {
  const provider = toGitSafeSlug(providerID);
  const model = toGitSafeSlug(modelID);
  return `${provider}-${model}`.substring(0, 60);
};

/**
 * Generate branch name for a run.
 * Format: <groupSlug>/<modelSlug>
 */
const generateBranchName = (groupSlug: string, modelSlug: string): string => {
  return `${groupSlug}/${modelSlug}`;
};

/**
 * Generate a stable worktree slug for a branch name.
 * Keeps `.openchamber/<slug>` branch-aligned.
 */
const sanitizeWorktreeSlug = (value: string): string => {
  return value
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, 120);
};


const resolveProjectDirectory = (): string | null => {
  const projectsState = useProjectsStore.getState();
  const activeProjectId = projectsState.activeProjectId;
  const activeProjectPath = activeProjectId
    ? projectsState.projects.find((project) => project.id === activeProjectId)?.path
    : undefined;

  if (typeof activeProjectPath === 'string' && activeProjectPath.trim().length > 0) {
    return activeProjectPath;
  }

  const currentDirectory = useDirectoryStore.getState().currentDirectory ?? null;
  if (!currentDirectory) {
    return null;
  }

  const normalized = currentDirectory.replace(/\\/g, '/').replace(/\/+$/, '') || currentDirectory;
  const marker = '/.openchamber/';
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex > 0) {
    return normalized.slice(0, markerIndex);
  }
  if (normalized.endsWith('/.openchamber')) {
    return normalized.slice(0, normalized.length - '/.openchamber'.length);
  }

  return normalized;
};

interface MultiRunState {
  isLoading: boolean;
  error: string | null;
}

interface MultiRunActions {
  /** Create worktrees/sessions and immediately start all runs */
  createMultiRun: (params: CreateMultiRunParams) => Promise<CreateMultiRunResult | null>;
  clearError: () => void;
}

type MultiRunStore = MultiRunState & MultiRunActions;

export const useMultiRunStore = create<MultiRunStore>()(
  devtools(
    (set) => ({
      isLoading: false,
      error: null,

      createMultiRun: async (params: CreateMultiRunParams) => {
        const groupName = params.name.trim();
        const prompt = params.prompt.trim();
        const { models, agent, files } = params;

        if (!groupName) {
          set({ error: 'Group name is required' });
          return null;
        }

        if (!prompt) {
          set({ error: 'Prompt is required' });
          return null;
        }

        if (models.length < 1) {
          set({ error: 'Select at least 1 model' });
          return null;
        }

        if (models.length > 5) {
          set({ error: 'Maximum 5 models allowed' });
          return null;
        }

        set({ isLoading: true, error: null });

        try {
          const directory = resolveProjectDirectory();
          if (!directory) {
            set({ error: 'No directory selected', isLoading: false });
            return null;
          }

          const isGit = await checkIsGitRepository(directory);
          if (!isGit) {
            set({ error: 'Not in a git repository', isLoading: false });
            return null;
          }

          const groupSlug = toGitSafeSlug(groupName);
          const worktreeBaseBranch =
            typeof params.worktreeBaseBranch === 'string' && params.worktreeBaseBranch.trim().length > 0
              ? params.worktreeBaseBranch.trim()
              : 'HEAD';
          const startPoint = worktreeBaseBranch !== 'HEAD' ? worktreeBaseBranch : undefined;

          const createdRuns: Array<{
            sessionId: string;
            worktreePath: string;
            providerID: string;
            modelID: string;
          }> = [];

          // Count occurrences of each model to handle duplicates
          const modelCounts = new Map<string, number>();
          for (const model of models) {
            const key = `${model.providerID}:${model.modelID}`;
            modelCounts.set(key, (modelCounts.get(key) || 0) + 1);
          }

          // Track current index per model during iteration
          const modelIndexes = new Map<string, number>();

          // 1) Create worktrees + sessions
          for (const model of models) {
            const key = `${model.providerID}:${model.modelID}`;
            const count = modelCounts.get(key) || 1;
            const index = (modelIndexes.get(key) || 0) + 1;
            modelIndexes.set(key, index);

            const modelSlug = toModelSlug(model.providerID, model.modelID);
            // Append index only when same model is selected multiple times
            const branch = count > 1
              ? generateBranchName(groupSlug, `${modelSlug}/${index}`)
              : generateBranchName(groupSlug, modelSlug);

            if (!branch) {
              set({ error: 'Branch name is required for worktree creation', isLoading: false });
              return null;
            }

            const worktreeSlug = sanitizeWorktreeSlug(branch);
            if (!worktreeSlug) {
              set({ error: `Invalid branch name: ${branch}`, isLoading: false });
              return null;
            }

            try {
              const worktreeMetadata = await createWorktree({
                projectDirectory: directory,
                worktreeSlug,
                branch,
                createBranch: true,
                startPoint,
              });

              // Session title format: groupSlug/provider/model (or groupSlug/provider/model/index for duplicates)
              const sessionTitle = count > 1
                ? `${groupSlug}/${model.providerID}/${model.modelID}/${index}`
                : `${groupSlug}/${model.providerID}/${model.modelID}`;

              const session = await opencodeClient.withDirectory(
                worktreeMetadata.path,
                () => opencodeClient.createSession({ title: sessionTitle })
              );

              useSessionStore.getState().setWorktreeMetadata(session.id, worktreeMetadata);

              createdRuns.push({
                sessionId: session.id,
                worktreePath: worktreeMetadata.path,
                providerID: model.providerID,
                modelID: model.modelID,
              });
            } catch (error) {
              // Best-effort: allow partial success
              console.warn('[MultiRun] Failed to create session:', error);
            }
          }

          const sessionIds = createdRuns.map((r) => r.sessionId);
          const firstSessionId = createdRuns[0]?.sessionId ?? null;

          if (sessionIds.length === 0) {
            set({ error: 'Failed to create any sessions', isLoading: false });
            return null;
          }

          // 2) Start all runs with the same prompt.
          // IMPORTANT: do not await model/agent execution here; only worktree + session creation.
          // Convert files to the format expected by sendMessage
          const filesForMessage = files?.map((f) => ({
            type: 'file' as const,
            mime: f.mime,
            filename: f.filename,
            url: f.url,
          }));

          void (async () => {
            try {
              await Promise.allSettled(
                createdRuns.map(async (run) => {
                  try {
                    await opencodeClient.withDirectory(run.worktreePath, () =>
                      opencodeClient.sendMessage({
                        id: run.sessionId,
                        providerID: run.providerID,
                        modelID: run.modelID,
                        text: prompt,
                        agent,
                        files: filesForMessage,
                      })
                    );
                  } catch (error) {
                    console.warn('[MultiRun] Failed to start run:', error);
                  }
                })
              );
            } catch (error) {
              console.warn('[MultiRun] Failed to start runs:', error);
            }
          })();

          set({ isLoading: false });
          return { groupSlug, sessionIds, firstSessionId };
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Failed to create Multi-Run',
            isLoading: false,
          });
          return null;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'multirun-store' }
  )
);
