import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { opencodeClient } from '@/lib/opencode/client';
import { listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import { useDirectoryStore } from './useDirectoryStore';
import { useProjectsStore } from './useProjectsStore';
import { useSessionStore } from './useSessionStore';
import type { WorktreeMetadata } from '@/types/worktree';
import type { Session } from '@opencode-ai/sdk/v2';


const resolveProjectDirectory = (currentDirectory: string | null | undefined): string | null => {
  const projectsState = useProjectsStore.getState();
  const activeProjectId = projectsState.activeProjectId;
  const activeProjectPath = activeProjectId
    ? projectsState.projects.find((project) => project.id === activeProjectId)?.path
    : undefined;

  if (typeof activeProjectPath === 'string' && activeProjectPath.trim().length > 0) {
    return activeProjectPath;
  }

  return currentDirectory ? normalize(currentDirectory) : null;
};

/**
 * Agent group session parsed from OpenCode session titles.
 * Session titles follow pattern: `groupSlug/provider/model` or `groupSlug/provider/model/index`
 * Model can contain `/` for creator/model format (e.g., `anthropic/claude-opus-4-5`)
 *
 * Examples:
 * - `feature/opencode/claude-sonnet-4-5` → group="feature", provider="opencode", model="claude-sonnet-4-5"
 * - `feature/opencode/claude-sonnet-4-1/2` → group="feature", provider="opencode", model="claude-sonnet-4-1", index=2
 * - `feature/openrouter/anthropic/claude-opus-4-5` → group="feature", provider="openrouter", model="anthropic/claude-opus-4-5"
 */
export interface AgentGroupSession {
  /** OpenCode session ID */
  id: string;
  /** Full worktree path (from session.directory) */
  path: string;
  /** Provider ID extracted from title */
  providerId: string;
  /** Model ID extracted from title (may contain / for creator/model format) */
  modelId: string;
  /** Instance number for duplicate model selections (default: 1) */
  instanceNumber: number;
  /** Branch name associated with this worktree */
  branch: string;
  /** Display label for the model */
  displayLabel: string;
  /** Full worktree metadata */
  worktreeMetadata?: WorktreeMetadata;
}

export interface AgentGroup {
  /** Group name (e.g., "agent-manager-2", "contributing") */
  name: string;
  /** Sessions within this group (one per model instance) */
  sessions: AgentGroupSession[];
  /** Timestamp of last activity (most recent session update) */
  lastActive: number;
  /** Total session count */
  sessionCount: number;
}

interface AgentGroupsState {
  /** All discovered agent groups from session titles */
  groups: AgentGroup[];
  /** Currently selected group name */
  selectedGroupName: string | null;
  /** Currently selected session ID within the group */
  selectedSessionId: string | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
}

interface AgentGroupsActions {
  /** Load/refresh agent groups from OpenCode sessions */
  loadGroups: () => Promise<void>;
  /** Select a group */
  selectGroup: (groupName: string | null) => void;
  /** Select a session within the current group */
  selectSession: (sessionId: string | null) => void;
  /** Delete the entire group (all worktrees + sessions in those worktrees). */
  deleteGroup: (groupName: string) => Promise<boolean>;
  /** Delete a single worktree within a group (and all sessions in that worktree). */
  deleteGroupWorktree: (groupName: string, worktreePath: string) => Promise<boolean>;
  /** Keep one worktree and remove all others in the group. */
  keepOnlyGroupWorktree: (groupName: string, keepWorktreePath: string) => Promise<boolean>;
  /** Get the currently selected group */
  getSelectedGroup: () => AgentGroup | null;
  /** Get the currently selected session */
  getSelectedSession: () => AgentGroupSession | null;
  /** Clear error */
  clearError: () => void;
}

type AgentGroupsStore = AgentGroupsState & AgentGroupsActions;

const normalize = (value: string): string => {
  if (!value) return '';
  const replaced = value.replace(/\\/g, '/');
  if (replaced === '/') return '/';
  return replaced.replace(/\/+$/, '');
};


const startsWithDirectory = (candidate: string, root: string): boolean => {
  const normalizedCandidate = normalize(candidate);
  const normalizedRoot = normalize(root);
  if (!normalizedCandidate || !normalizedRoot) {
    return false;
  }
  if (normalizedCandidate === normalizedRoot) {
    return true;
  }
  const prefix = normalizedRoot === '/' ? '/' : `${normalizedRoot}/`;
  return normalizedCandidate.startsWith(prefix);
};

const resolveCanonicalDirectory = async (
  apiClient: ReturnType<typeof opencodeClient.getApiClient>,
  directory: string
): Promise<string> => {
  const normalized = normalize(directory);
  if (!normalized) {
    return normalized;
  }
  try {
    const response = await apiClient.path.get({ directory: normalized });
    const canonical = normalize((response.data as { directory?: string | null } | null)?.directory ?? '');
    return canonical || normalized;
  } catch {
    return normalized;
  }
};

const listSessionsForDirectory = async (
  apiClient: ReturnType<typeof opencodeClient.getApiClient>,
  directory: string
): Promise<Session[]> => {
  const normalized = normalize(directory);
  if (!normalized) {
    return [];
  }

  const canonical = await resolveCanonicalDirectory(apiClient, normalized);

  const filterToDirectory = (sessions: Session[]) => {
    return sessions.filter((session) => {
      const dir = normalize((session as { directory?: string | null }).directory ?? '');
      if (!dir) return false;
      return startsWithDirectory(dir, normalized) || (canonical !== normalized && startsWithDirectory(dir, canonical));
    });
  };

  const attemptList = async (dir: string) => {
    const response = await apiClient.session.list({ directory: dir });
    return Array.isArray(response.data) ? response.data : [];
  };

  try {
    const list = filterToDirectory(await attemptList(normalized));
    if (list.length > 0) {
      return list;
    }
  } catch {
    // ignore
  }

  if (canonical && canonical !== normalized) {
    try {
      const list = filterToDirectory(await attemptList(canonical));
      if (list.length > 0) {
        return list;
      }
    } catch {
      // ignore
    }
  }

  try {
    const global = await apiClient.session.list(undefined);
    const list = Array.isArray(global.data) ? global.data : [];
    return filterToDirectory(list);
  } catch {
    return [];
  }
};

const buildWorktreeMetadataByPath = async (group: AgentGroup, projectDirectory: string): Promise<Map<string, WorktreeMetadata>> => {
  const map = new Map<string, WorktreeMetadata>();

  group.sessions.forEach((session) => {
    if (session.worktreeMetadata) {
      map.set(normalize(session.path), session.worktreeMetadata);
    }
  });

  const missingPaths = Array.from(new Set(group.sessions.map((session) => normalize(session.path))))
    .filter(Boolean)
    .filter((path) => !map.has(path));

  if (missingPaths.length === 0) {
    return map;
  }

  try {
    const worktrees = await listProjectWorktrees({ id: `path:${projectDirectory}`, path: projectDirectory });
    const infoByPath = new Map(worktrees.map((meta) => [normalize(meta.path), meta]));
    missingPaths.forEach((path) => {
      const info = infoByPath.get(path);
      if (info) {
        map.set(path, info);
      }
    });
  } catch {
    // ignore
  }

  return map;
};

const collectDeleteCandidates = async (params: {
  apiClient: ReturnType<typeof opencodeClient.getApiClient>;
  group: AgentGroup;
  projectDirectory: string;
  worktreePaths: string[];
}): Promise<Array<{ worktreePath: string; sessionIds: string[]; metadata?: WorktreeMetadata }>> => {
  const { apiClient, group, projectDirectory, worktreePaths } = params;
  const metadataByPath = await buildWorktreeMetadataByPath(group, projectDirectory);
  const sessionStore = useSessionStore.getState();

  const uniqueWorktreePaths = Array.from(new Set(worktreePaths.map((path) => normalize(path)).filter(Boolean)));
  const concurrency = 5;
  let index = 0;

  const results: Array<{ worktreePath: string; sessionIds: string[]; metadata?: WorktreeMetadata }> = [];

  const worker = async () => {
    while (index < uniqueWorktreePaths.length) {
      const current = uniqueWorktreePaths[index];
      index += 1;

      const sessionsInGroup = group.sessions.filter((session) => normalize(session.path) === current).map((session) => session.id);
      const cached = sessionStore.getSessionsByDirectory(current);
      const cachedIds = Array.isArray(cached) ? cached.map((session) => session.id) : [];

      // Prefer the session store cache (already directory-partitioned). If empty, fall back to direct API listing.
      let listedIds: string[] = [];
      if (cachedIds.length === 0) {
        try {
          const listed = await listSessionsForDirectory(apiClient, current);
          listedIds = listed.map((session) => session.id);
        } catch {
          listedIds = [];
        }
      }

      const ids = Array.from(new Set([...cachedIds, ...listedIds, ...sessionsInGroup].filter(Boolean)));
      results.push({
        worktreePath: current,
        sessionIds: ids,
        metadata: metadataByPath.get(current),
      });
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueWorktreePaths.length) }, worker));
  return results;
};

const deleteGroupWorktreeSessions = async (params: {
  group: AgentGroup;
  projectDirectory: string;
  worktreePaths: string[];
}) => {
  const apiClient = opencodeClient.getApiClient();
  const candidates = await collectDeleteCandidates({
    apiClient,
    group: params.group,
    projectDirectory: params.projectDirectory,
    worktreePaths: params.worktreePaths,
  });

  const sessionStore = useSessionStore.getState();
  const ids = new Set<string>();

  candidates.forEach(({ worktreePath, sessionIds, metadata }) => {
    sessionIds.forEach((id) => {
      ids.add(id);
      if (metadata) {
        sessionStore.setWorktreeMetadata(id, metadata);
        sessionStore.setSessionDirectory(id, worktreePath);
      }
    });
  });

  if (ids.size === 0) {
    return { failedIds: [] as string[] };
  }

  return sessionStore.deleteSessions(Array.from(ids), { archiveWorktree: true, silent: true });
};

/**
 * Parse a session title to extract group, provider, model, and index.
 * Title format: groupSlug/provider/model[/index]
 *
 * The groupSlug is always the first segment (cannot contain `/` as it's sanitized).
 * The provider is always the second segment.
 * Everything after the provider (excluding numeric index) is the model.
 * Model can contain `/` for creator/model format.
 *
 * Examples:
 * - "feature/opencode/claude-sonnet-4-5" → { groupSlug: "feature", provider: "opencode", model: "claude-sonnet-4-5", index: 1 }
 * - "feature/opencode/claude-sonnet-4-1/2" → { groupSlug: "feature", provider: "opencode", model: "claude-sonnet-4-1", index: 2 }
 * - "feature/openrouter/anthropic/claude-opus-4-5" → { groupSlug: "feature", provider: "openrouter", model: "anthropic/claude-opus-4-5", index: 1 }
 * - "my-task/anthropic/claude-sonnet-4/1" → { groupSlug: "my-task", provider: "anthropic", model: "claude-sonnet-4", index: 1 }
 */
function parseSessionTitle(title: string | undefined): {
  groupSlug: string;
  provider: string;
  model: string;
  index: number;
} | null {
  if (!title) return null;

  const parts = title.split('/');
  if (parts.length < 3) return null;

  // First part is always groupSlug (cannot contain / or spaces as it's sanitized by toGitSafeSlug)
  const groupSlug = parts[0];
  if (!groupSlug || groupSlug.includes(' ')) return null;

  // Second part is always provider
  const provider = parts[1];
  if (!provider) return null;

  // Check if last part is a numeric index
  const lastPart = parts[parts.length - 1];
  const lastPartNum = parseInt(lastPart, 10);
  const hasIndex = parts.length >= 4 && !isNaN(lastPartNum) && String(lastPartNum) === lastPart;

  // Model is everything from parts[2] to end (excluding index if present)
  const modelParts = hasIndex
    ? parts.slice(2, -1)
    : parts.slice(2);

  // Must have at least one model part
  if (modelParts.length === 0) {
    return null;
  }

  const model = modelParts.join('/');

  return {
    groupSlug,
    provider,
    model,
    index: hasIndex ? lastPartNum : 1,
  };
}

export const useAgentGroupsStore = create<AgentGroupsStore>()(
  devtools(
    (set, get) => ({
      groups: [],
      selectedGroupName: null,
      selectedSessionId: null,
      isLoading: false,
      error: null,

      loadGroups: async () => {
        const currentDirectory = useDirectoryStore.getState().currentDirectory;
        const projectDirectory = resolveProjectDirectory(currentDirectory);

        if (!projectDirectory) {
          set({ groups: [], isLoading: false, error: 'No project directory selected' });
          return;
        }

        const normalizedProject = normalize(projectDirectory);

        const projectsState = useProjectsStore.getState();
        const projectEntry = projectsState.projects.find((p) => normalize(p.path) === normalizedProject);
        const projectRef = {
          id: projectEntry?.id ?? `path:${normalizedProject}`,
          path: normalizedProject,
        };

        const previousGroups = get().groups;
        set({ isLoading: true, error: null });

        try {
          const apiClient = opencodeClient.getApiClient();
          const canonicalProject = await resolveCanonicalDirectory(apiClient, normalizedProject);
          const canonicalRef = canonicalProject && canonicalProject !== normalizedProject
            ? { ...projectRef, path: canonicalProject }
            : null;

          const managedWorktrees = await listProjectWorktrees(projectRef).catch(() => []);
          const managedWorktreesCanonical = canonicalRef
            ? await listProjectWorktrees(canonicalRef).catch(() => [])
            : [];

          const worktreeDirectorySet = new Set<string>();
          const worktreeMetadataMap = new Map<string, WorktreeMetadata>();
          [...managedWorktrees, ...managedWorktreesCanonical].forEach((meta) => {
            if (meta?.path) {
              const key = normalize(meta.path);
              worktreeDirectorySet.add(key);
              if (!worktreeMetadataMap.has(key)) {
                worktreeMetadataMap.set(key, meta);
              }
            }
          });

          const fetchCandidateSessions = async (): Promise<Session[]> => {
            try {
              const scoped = await apiClient.session.list({ directory: normalizedProject });
              const list = Array.isArray(scoped.data) ? scoped.data : [];
              if (list.some((session) => {
                const dir = normalize((session as { directory?: string | null }).directory ?? '');
                return dir ? worktreeDirectorySet.has(dir) : false;
              })) {
                return list;
              }
            } catch {
              // ignore and fall back to global list
            }

            const global = await apiClient.session.list(undefined);
            return Array.isArray(global.data) ? global.data : [];
          };

          const fetchSessionsByWorktreeDirectories = async (directories: string[]): Promise<Session[]> => {
            const sessionsMap = new Map<string, Session>();
            const concurrency = 5;
            let index = 0;

            const worker = async () => {
              while (index < directories.length) {
                const current = directories[index];
                index += 1;
                const normalizedDir = normalize(current);
                if (!normalizedDir) continue;

                try {
                  const sessions = await listSessionsForDirectory(apiClient, normalizedDir);
                  sessions.forEach((session) => sessionsMap.set(session.id, session));
                } catch (err) {
                  console.debug('Failed to fetch sessions from worktree:', normalizedDir, err);
                }
              }
            };

            await Promise.all(Array.from({ length: Math.min(concurrency, directories.length) }, worker));
            return Array.from(sessionsMap.values());
          };

          const candidateSessions = await fetchCandidateSessions();
          let allSessions = candidateSessions.filter((session) => {
            const dir = normalize((session as { directory?: string | null }).directory ?? '');
            if (!dir) {
              return false;
            }
            return worktreeDirectorySet.has(dir);
          });

          // Some OpenCode builds do not return sessions across directories in the global list.
          // If we didn't discover any group sessions, fall back to querying each worktree directory directly.
          if (allSessions.length === 0) {
            const candidates = new Set<string>();

            // 1) Known worktree directories for this project
            worktreeDirectorySet.forEach((dir) => candidates.add(dir));

            if (candidates.size > 0) {
              allSessions = await fetchSessionsByWorktreeDirectories(Array.from(candidates));
            }
          }

          const sessionUpdatedAtById = new Map<string, number>();
          for (const session of allSessions) {
            const updatedAt = (session as { time?: { updated?: number | null } }).time?.updated ?? 0;
            sessionUpdatedAtById.set(session.id, typeof updatedAt === 'number' ? updatedAt : 0);
          }

          // Parse sessions and group by groupSlug
          const groupsMap = new Map<string, AgentGroupSession[]>();

          for (const session of allSessions) {
            const parsed = parseSessionTitle(session.title);
            if (!parsed) continue; // Skip sessions without valid agent group title

            const sessionPath = normalize(session.directory);
            const worktreeInfo = worktreeMetadataMap.get(sessionPath);

            const agentSession: AgentGroupSession = {
              id: session.id,
              path: sessionPath,
              providerId: parsed.provider,
              modelId: parsed.model,
              instanceNumber: parsed.index,
              branch: worktreeInfo?.branch ?? '',
              displayLabel: `${parsed.provider}/${parsed.model}`,
              worktreeMetadata: worktreeInfo,
            };

            const existing = groupsMap.get(parsed.groupSlug);
            if (existing) {
              existing.push(agentSession);
            } else {
              groupsMap.set(parsed.groupSlug, [agentSession]);
            }
          }

          // Convert map to array and sort
          const groups: AgentGroup[] = Array.from(groupsMap.entries()).map(
            ([name, sessions]) => {
              // Find the most recent session update time for lastActive
              const lastActive = sessions.reduce((max, s) => {
                const updatedTime = sessionUpdatedAtById.get(s.id) ?? 0;
                return Math.max(max, updatedTime);
              }, 0);

              return {
                name,
                sessions: sessions.sort((a, b) => {
                  // Sort by provider, then model, then instance
                  const providerCmp = a.providerId.localeCompare(b.providerId);
                  if (providerCmp !== 0) return providerCmp;
                  const modelCmp = a.modelId.localeCompare(b.modelId);
                  if (modelCmp !== 0) return modelCmp;
                  return a.instanceNumber - b.instanceNumber;
                }),
                lastActive: lastActive || Date.now(),
                sessionCount: sessions.length,
              };
            }
          );

          // Sort groups by name
          groups.sort((a, b) => a.name.localeCompare(b.name));

          set({ groups, isLoading: false, error: null });
        } catch (err) {
          console.error('Failed to load agent groups:', err);
          // Preserve existing groups on error to avoid UI flickering
          set({
            groups: previousGroups.length > 0 ? previousGroups : [],
            isLoading: false,
            error: err instanceof Error ? err.message : 'Failed to load agent groups',
          });
        }
      },

      selectGroup: (groupName) => {
        const { groups } = get();
        const group = groups.find((g) => g.name === groupName);

        set({
          selectedGroupName: groupName,
          // Auto-select first session when selecting a group
          selectedSessionId: group?.sessions[0]?.id ?? null,
        });
      },

      selectSession: (sessionId) => {
        set({ selectedSessionId: sessionId });
      },

      deleteGroup: async (groupName) => {
        const group = get().groups.find((g) => g.name === groupName);
        if (!group) {
          return false;
        }

        const currentDirectory = useDirectoryStore.getState().currentDirectory;
        const projectDirectory = resolveProjectDirectory(currentDirectory);
        if (!projectDirectory) {
          set({ error: 'No project directory selected' });
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const { failedIds } = await deleteGroupWorktreeSessions({
            group,
            projectDirectory: normalize(projectDirectory),
            worktreePaths: group.sessions.map((s) => s.path),
          });
          if (failedIds.length > 0) {
            set({ error: 'Failed to delete some sessions' });
          }

          if (get().selectedGroupName === groupName) {
            set({ selectedGroupName: null, selectedSessionId: null });
          }

          await get().loadGroups();
          return failedIds.length === 0;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to delete group' });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      deleteGroupWorktree: async (groupName, worktreePath) => {
        const group = get().groups.find((g) => g.name === groupName);
        if (!group) {
          return false;
        }
        const normalizedWorktreePath = normalize(worktreePath);
        if (!normalizedWorktreePath) {
          return false;
        }

        const currentDirectory = useDirectoryStore.getState().currentDirectory;
        const projectDirectory = resolveProjectDirectory(currentDirectory);
        if (!projectDirectory) {
          set({ error: 'No project directory selected' });
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const { failedIds } = await deleteGroupWorktreeSessions({
            group,
            projectDirectory: normalize(projectDirectory),
            worktreePaths: [normalizedWorktreePath],
          });
          if (failedIds.length > 0) {
            set({ error: 'Failed to delete some sessions' });
          }

          await get().loadGroups();

          const updated = get().groups.find((g) => g.name === groupName);
          if (!updated) {
            if (get().selectedGroupName === groupName) {
              set({ selectedGroupName: null, selectedSessionId: null });
            }
            return failedIds.length === 0;
          }

          if (get().selectedGroupName === groupName) {
            const currentSelected = get().selectedSessionId;
            const remainingIds = new Set(updated.sessions.map((s) => s.id));
            if (!currentSelected || !remainingIds.has(currentSelected)) {
              set({ selectedSessionId: updated.sessions[0]?.id ?? null });
            }
          }

          return failedIds.length === 0;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to delete worktree' });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      keepOnlyGroupWorktree: async (groupName, keepWorktreePath) => {
        const group = get().groups.find((g) => g.name === groupName);
        if (!group) {
          return false;
        }
        const keepPath = normalize(keepWorktreePath);
        if (!keepPath) {
          return false;
        }

        const worktreePaths = Array.from(new Set(group.sessions.map((s) => normalize(s.path)).filter(Boolean)));
        const toDelete = worktreePaths.filter((path) => path !== keepPath);
        if (toDelete.length === 0) {
          return true;
        }

        const currentDirectory = useDirectoryStore.getState().currentDirectory;
        const projectDirectory = resolveProjectDirectory(currentDirectory);
        if (!projectDirectory) {
          set({ error: 'No project directory selected' });
          return false;
        }

        set({ isLoading: true, error: null });
        try {
          const { failedIds } = await deleteGroupWorktreeSessions({
            group,
            projectDirectory: normalize(projectDirectory),
            worktreePaths: toDelete,
          });
          if (failedIds.length > 0) {
            set({ error: 'Failed to delete some sessions' });
          }

          await get().loadGroups();
          if (get().selectedGroupName === groupName) {
            const updated = get().groups.find((g) => g.name === groupName);
            const keepSession = updated?.sessions.find((s) => normalize(s.path) === keepPath) ?? updated?.sessions[0] ?? null;
            set({ selectedSessionId: keepSession?.id ?? null });
          }
          return failedIds.length === 0;
        } catch (err) {
          set({ error: err instanceof Error ? err.message : 'Failed to remove other worktrees' });
          return false;
        } finally {
          set({ isLoading: false });
        }
      },

      getSelectedGroup: () => {
        const { groups, selectedGroupName } = get();
        if (!selectedGroupName) return null;
        return groups.find((g) => g.name === selectedGroupName) ?? null;
      },

      getSelectedSession: () => {
        const { selectedSessionId } = get();
        const group = get().getSelectedGroup();
        if (!group || !selectedSessionId) return null;
        return group.sessions.find((s) => s.id === selectedSessionId) ?? null;
      },

      clearError: () => {
        set({ error: null });
      },
    }),
    { name: 'agent-groups-store' }
  )
);
